// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT A SCRIPT CAN SEE. One global table, `game`, and everything under it is
// READ-ONLY — a script computes an answer, it never edits the run.
//
//   game.config   every tuning table the engine reads (LOOT, MENACE, STATS…)
//   game.balance  the DEVELOPER → BALANCE knobs, live
//   game.run      the run the hook is being called for (see `runView`)
//   game.log(…)   a rate-limited line into the engine's log buffer
//
// Two rules shape this module, and both come from rules the engine already had:
//
// **The run view is LAZY.** `game.run` is an empty frozen table with an
// `__index` native behind it, so a hook that never mentions the run costs
// nothing, and one that reads `game.run.hero.level` builds only that. The
// snapshot is memoized per TICK, so a hook called sixty times in a kill storm
// builds one table, not sixty — this is the per-frame-allocation rule from
// AGENTS.md, applied to the seam a modder is most likely to lean on.
//
// **Read-only means frozen, not a metatable.** `freezeTable` marks the tables
// themselves, and the VM refuses every write to a frozen table — including
// through `setmetatable`, `table.insert` and `table.sort`. A metatable-based
// guard would come off with one `setmetatable` call.

import * as CONFIG from "../config/index.ts";
import { BALANCE } from "../tuning.ts";
import { info } from "../../output.ts";
import type { GameState, Player } from "../types/index.ts";
import {
  LuaTable,
  freezeTable,
  luaToDisplay,
  native,
  toLuaTable,
  type LuaValue,
} from "@game/lib/lua/index.ts";

/**
 * A plain JS value as a Lua one. Objects become tables, arrays become
 * 1-indexed sequences, and anything the VM has no representation for
 * (functions, symbols, class instances) is dropped rather than smuggled across
 * — a script must never end up holding a live host object.
 */
function toLua(value: unknown, depth = 0): LuaValue {
  if (depth > 8) return undefined;
  if (value === null || value === undefined) return undefined;
  const t = typeof value;
  if (t === "number" || t === "string" || t === "boolean") {
    return value as LuaValue;
  }
  if (Array.isArray(value)) {
    const table = new LuaTable();
    for (let i = 0; i < value.length; i++) {
      table.set(i + 1, toLua(value[i], depth + 1));
    }
    return table;
  }
  if (t === "object") {
    const table = new LuaTable();
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const converted = toLua(v, depth + 1);
      if (converted !== undefined) table.set(k, converted);
    }
    return table;
  }
  return undefined;
}

/**
 * The whole tuning tree, snake_cased at the top level so a script reads
 * `game.config.loot.dropChance` rather than shouting. The LEAF keys keep their
 * TypeScript spelling on purpose: a modder reading `config/loot.ts` to find out
 * what a knob does must be able to search for the same word in both files.
 *
 * Built ONCE (the config is frozen data compiled into the build), then frozen.
 */
let configTable: LuaTable | undefined;
function configView(): LuaTable {
  if (configTable) return configTable;
  const t = new LuaTable();
  for (const [name, value] of Object.entries(CONFIG)) {
    if (typeof value !== "object" || value === null) continue;
    t.set(name.toLowerCase(), toLua(value));
  }
  configTable = freezeTable(t);
  return configTable;
}

/**
 * `game.balance` — the DEVELOPER → BALANCE knobs. LAZY for the same reason
 * `game.run` is, one step sharper: the page moves these live, mid-run, and a
 * snapshot taken when the chunk loaded would hand the hook a stale number
 * while the rest of the engine used the new one — the two halves of one
 * formula disagreeing, which is exactly the bug the knobs exist to hunt.
 */
function balanceView(): LuaTable {
  const view = new LuaTable();
  const meta = new LuaTable();
  meta.set(
    "__index",
    native("balance_index", (args) => {
      const key = args[1];
      if (typeof key !== "string") return [undefined];
      const value = (BALANCE as unknown as Record<string, unknown>)[key];
      return [typeof value === "number" ? value : undefined];
    }),
  );
  view.metatable = meta;
  return freezeTable(view);
}

// ---- the run view ---------------------------------------------------------

/** The state a hook is currently being called against, plus the tick its
 * snapshot was built for. Stamped by `setScriptRun` — a reference assignment,
 * which is what makes it free to do every step. */
let currentState: GameState | undefined;
let currentHero: Player | undefined;
let snapshot: LuaTable | undefined;
let snapshotAt = -1;
let snapshotHero: Player | undefined;

/**
 * Point the run view at a state (and, when the hook is about one hero, at that
 * hero). Called by the binding layer immediately before every hook call — a
 * private read of "the hero" is a PARAMETER, so which hero `game.run.hero` is
 * travels with the call rather than defaulting to seat 0.
 */
export function setScriptRun(
  state: GameState | undefined,
  hero?: Player,
): void {
  if (state !== currentState || hero !== currentHero) snapshot = undefined;
  currentState = state;
  currentHero = hero;
}

/** The per-hero half of the run view. */
function heroView(state: GameState, hero: Player): LuaTable {
  return toLuaTable({
    level: hero.level,
    hp: hero.hp,
    max_hp: hero.maxHp,
    xp: hero.xp,
    stamina: hero.stamina ?? 0,
    coins: hero.coins ?? 0,
    seat: state.players.indexOf(hero),
    /** RAW chosen + auto stats, before gear and before the diminishing curve —
     * the effective value is what `stat_diminish` is being asked about, so
     * handing it back here would be circular. */
    stats: toLua(hero.stats) as LuaTable,
    spent_stats: toLua(hero.spentStats) as LuaTable,
    talents: toLua(hero.talents) as LuaTable,
    weapon: hero.equipment?.weapon
      ? toLuaTable({
          def: hero.equipment.weapon.defId,
          ilvl: hero.equipment.weapon.ilvl,
          tier: hero.equipment.weapon.tier ?? "regular",
        })
      : undefined,
  });
}

/** Build (or reuse) the snapshot for the current state and hero. */
function runSnapshot(): LuaTable | undefined {
  const state = currentState;
  if (!state) return undefined;
  const tick = state.stats.timeMs;
  if (snapshot && snapshotAt === tick && snapshotHero === currentHero) {
    return snapshot;
  }
  const hero = currentHero;
  const table = toLuaTable({
    difficulty: state.difficulty,
    level: state.level.id,
    level_index: state.level.index,
    biome: state.level.biome,
    phase: state.phase,
    time_ms: state.stats.timeMs,
    combat_ms: state.stats.combatMs,
    kills: state.stats.kills,
    damage_dealt: state.stats.damageDealt,
    damage_taken: state.stats.damageTaken,
    xp_gained: state.stats.xpGained,
    items_collected: state.stats.itemsCollected,
    gold_collected: state.stats.goldCollected,
    menace: state.menace,
    menace_floor: state.menaceFloor,
    peak_menace: state.stats.peakMenace,
    enemies_alive: state.enemies.length,
    items_on_floor: state.items.length,
    party_size: state.players.length,
    is_party: state.players.length > 1,
    hero: hero ? heroView(state, hero) : undefined,
  });
  snapshot = freezeTable(table);
  snapshotAt = tick;
  snapshotHero = hero;
  return snapshot;
}

/**
 * Whether the hook call in progress has READ the run view.
 *
 * This is what makes the host's memo safe (see `script/host.ts`): a hook that
 * touches nothing but its arguments, `game.config` and `game.balance` is a PURE
 * function of them and its answer can be cached, while one that asks about the
 * run cannot. Rather than annotating each hook — an annotation that would
 * eventually be wrong — the run view reports its own use, so the answer is
 * observed rather than declared.
 */
let touchedRun = false;

/** Start a hook call: nothing has been read yet. */
export function beginHookCall(): void {
  touchedRun = false;
}

/** Did the call just finished read the run? */
export function hookTouchedRun(): boolean {
  return touchedRun;
}

/** `game.run` — the lazy, frozen, per-tick-memoized view described in the
 * header. Outside a run (a menu-time or tooling call) every field reads `nil`,
 * which is why a shipped script never assumes one is there. */
function runView(): LuaTable {
  const view = new LuaTable();
  const meta = new LuaTable();
  meta.set(
    "__index",
    native("run_index", (args) => {
      touchedRun = true;
      return [runSnapshot()?.get(args[1])];
    }),
  );
  view.metatable = meta;
  return freezeTable(view);
}

// ---- logging --------------------------------------------------------------

/** Lines a script has already printed this generation, so a hook that logs on
 * every kill floods nothing. Cleared with the environment. */
let logged = 0;
const LOG_LIMIT = 64;

function logFn(chunk: string) {
  return native("log", (args) => {
    if (logged >= LOG_LIMIT) return [];
    logged++;
    const text = args.map((a) => luaToDisplay(a)).join(" ");
    info(
      `[script ${chunk}] ${text}${
        logged === LOG_LIMIT ? " (further lines from scripts suppressed)" : ""
      }`,
    );
    return [];
  });
}

/**
 * The environment one script chunk runs in. Fresh per chunk (so two scripts
 * cannot see each other's globals), and everything under `game` frozen.
 */
export function scriptEnv(chunkName: string): Record<string, LuaValue> {
  const game = new LuaTable();
  game.set("config", configView());
  game.set("balance", balanceView());
  game.set("run", runView());
  game.set("log", logFn(chunkName));
  return { game: freezeTable(game) };
}

/** Reset the per-environment log budget — called when the catalog is swapped,
 * so a new run's scripts get their allowance back. */
export function resetScriptLogBudget(): void {
  logged = 0;
}
