// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Test-scenario support: mutate a freshly created run into an exact
// situation — the hero at the boss with 2 hp and no weapon, sixty mobs in a
// ring around him, the wave spawner silenced — so bugs and performance
// problems can be reproduced on demand instead of played into. This is a
// developer tool, not a gameplay system: the app feeds it from the
// `?scenario=` URL param (see docs/configuration.md and the `test-scenario`
// skill), tests call `applyScenario` directly after `createGame`.

import { clamp, distance, vec, type Vec2 } from "@game/lib/vec.ts";
import { HELD_ITEMS } from "./config.ts";
import { enemyDef } from "./defs/enemies/index.ts";
import { gearDef, isWeaponDef, weaponDef } from "./defs/equipment.ts";
import { levelDef } from "./defs/levels/index.ts";
import { scaledMobCount } from "./defs/difficulties.ts";
import { spawnEnemy } from "./create.ts";
import {
  recomputeMaxHp,
  recomputeMaxStamina,
  skipStoryOpening,
  syncInventoryCapacity,
} from "./items.ts";
import { xpToLevelUp } from "./leveling.ts";
import { revealAround } from "./map.ts";
import { currentMobLevel, mobLevelScale } from "./menace.ts";
import { insideObstacle } from "./obstacles.ts";
import { warn } from "../output.ts";
import type { Equipment, GameState, StatName } from "./types.ts";

/** One ring of extra monsters dropped around a center point. */
export type ScenarioSpawn = {
  /** Enemy def id (ENEMY_DEFS key). */
  enemy: string;
  /** How many to spawn. Default 1. */
  count?: number;
  /**
   * Exact spot instead of the ring — every copy lands here (bodies resolve
   * apart on the first step). Overrides the distance ring.
   */
  at?: Vec2;
  /** Ring inner radius around the player (world units). Default 60 — just
   * beyond melee reach, well inside the screen. */
  minDistance?: number;
  /** Ring outer radius. Default `minDistance + 160`. */
  maxDistance?: number;
  /** MONSTER LEVEL override for loot/tier gates. Default: the level the wave
   * spawner would stamp right now (`currentMobLevel`). */
  mlvl?: number;
  /** Extra hp multiplier on top of the difficulty's live scale. Default 1. */
  hpMult?: number;
};

/**
 * A declarative test scenario, applied over a created run. Every field is
 * optional — the spec describes only what differs from a normal run.
 */
export type ScenarioSpec = {
  /**
   * Skip the prelude cutscene, intro monologue, and scripted opening strike
   * and drop straight into the `playing` phase. Default true — a scenario
   * exists to reach a situation, not to sit through the story. Set false to
   * keep the authored opening.
   */
  skipOpening?: boolean;
  /**
   * Teleport the hero: `"boss"` places him a stand-off away from the level's
   * boss (facing it), a `{x, y}` lands him exactly there. The map is
   * revealed around the landing spot.
   */
  place?: "boss" | Vec2;
  /** Hit points, clamped to [1, maxHp] after gear/stats resolve. */
  hp?: number;
  /** Sprint pool, clamped to [0, maxStamina]. */
  stamina?: number;
  /** Player level (xp resets to 0, xpToNext re-derived). No stat points are
   * granted — pair with `stats` to describe the build. */
  level?: number;
  /** ABSOLUTE allocated stat points per stat (not deltas). */
  stats?: Partial<Record<StatName, number>>;
  /** Coins in the purse. */
  coins?: number;
  /**
   * Held weapon: a WEAPON_DEFS id minted plain at catalog durability, or
   * `null` for the unbreakable fallback sidearm (`blaster`) — the game's
   * "no weapon" state.
   */
  weapon?: string | null;
  /** True holsters the weapon entirely: the auto-attack sits out until the
   * scenario is over — the hero literally cannot fight. */
  disarmed?: boolean;
  /**
   * Worn gear per slot: a GEAR_DEFS id minted plain, or `null` to strip the
   * slot bare. Slots not listed keep whatever the run dressed them in.
   */
  gear?: Partial<
    Record<"head" | "chest" | "legs" | "feet" | "charm" | "bag", string | null>
  >;
  /** Powerups banked into the dock (ABILITY_DEFS ids, oldest first, capped
   * at the dock size). */
  abilities?: string[];
  /**
   * Remove the spawned population before the scenario's own spawns land.
   * Bosses are kept — deleting the objective would end the level on the
   * spot (see step.ts `objectiveCleared`).
   */
  clearEnemies?: boolean;
  /** Exhaust the wave budget so the horde spawner stays silent and the
   * field holds exactly what the scenario placed. */
  stopWaves?: boolean;
  /** Extra monsters, spawned after `clearEnemies`/`stopWaves` resolve. */
  spawns?: ScenarioSpawn[];
};

/** How far from the boss `place: "boss"` sets the hero down. */
const BOSS_STANDOFF = 90;
/** Ring sampling attempts per spawned monster before placement is forced. */
const SPAWN_ATTEMPTS = 24;

/**
 * Apply a test scenario to a created run, in one deterministic pass (ring
 * positions draw on `state.rng`, so a fixed seed reproduces the exact
 * layout). Meant to run once, right after `createGame` (+ loadout); applying
 * to a mid-flight run works but tramples whatever the run had done.
 */
export function applyScenario(state: GameState, spec: ScenarioSpec): void {
  const player = state.player;

  if (spec.skipOpening !== false) skipStoryOpening(state);

  if (spec.level !== undefined) {
    player.level = Math.max(1, Math.floor(spec.level));
    player.xp = 0;
    player.xpToNext = xpToLevelUp(player.level);
  }
  if (spec.stats) {
    for (const [stat, points] of Object.entries(spec.stats)) {
      player.stats[stat as StatName] = Math.max(0, points ?? 0);
    }
  }

  if (spec.weapon !== undefined) {
    // `null` = the unbreakable fallback sidearm — the same piece items.ts
    // draws when a weapon shatters with an empty bag ("no weapon").
    const defId = spec.weapon ?? "blaster";
    if (spec.weapon !== null && !isWeaponDef(defId)) {
      warn(`scenario: unknown weapon def '${defId}' — kept the held weapon`);
    } else {
      player.equipment.weapon = mintWeapon(state, defId, spec.weapon === null);
      player.weaponCooldownMs = 0;
    }
  }
  if (spec.disarmed !== undefined) player.disarmed = spec.disarmed;

  for (const [slot, defId] of Object.entries(spec.gear ?? {})) {
    const wearSlot = slot as keyof NonNullable<ScenarioSpec["gear"]>;
    if (defId === null) {
      player.equipment[wearSlot] = null;
      continue;
    }
    const piece = mintGear(state, defId, wearSlot);
    if (piece) player.equipment[wearSlot] = piece;
  }

  // Derived pools follow the build described above; the explicit hp/stamina
  // land last so "2 hp" survives the recompute.
  recomputeMaxHp(state);
  recomputeMaxStamina(state);
  syncInventoryCapacity(state);
  if (spec.hp !== undefined) {
    player.hp = clamp(Math.round(spec.hp), 1, player.maxHp);
  }
  if (spec.stamina !== undefined) {
    player.stamina = clamp(spec.stamina, 0, player.maxStamina);
  }
  if (spec.coins !== undefined) player.coins = Math.max(0, spec.coins);

  if (spec.abilities) {
    player.heldAbilities = spec.abilities.slice(0, HELD_ITEMS.cap);
  }

  if (spec.place !== undefined) placePlayer(state, spec.place);

  if (spec.clearEnemies) {
    // The objective stays: deleting the boss would clear the level on the
    // next step. Everything else vanishes without a kill (no XP, no loot).
    const keep = state.enemies.filter((e) => enemyDef(e.defId).role === "boss");
    state.stats.totalEnemies -= state.enemies.length - keep.length;
    state.enemies = keep;
  }
  if (spec.stopWaves) {
    const waves = levelDef(state.level.id).waves;
    if (waves) {
      waves.budget.forEach((entry, i) => {
        const total = scaledMobCount(entry.count, state.difficulty);
        const remaining = total - (state.waveSpawned[i] ?? 0);
        state.stats.totalEnemies -= Math.max(0, remaining);
        state.waveSpawned[i] = total;
      });
      state.moveSpawnCredit = 0;
    }
  }

  for (const spawn of spec.spawns ?? []) spawnRing(state, spawn);
}

/** Mint a plain weapon at catalog durability (the fallback sidearm is
 * unbreakable, exactly as items.ts mints it). */
function mintWeapon(
  state: GameState,
  defId: string,
  unbreakable: boolean,
): Equipment {
  const piece: Equipment = {
    id: state.nextId++,
    defId,
    slot: "weapon",
    tier: "regular",
    ilvl: 1,
    affixes: [],
  };
  const durability = weaponDef(defId).durability;
  if (!unbreakable && durability !== undefined) piece.durability = durability;
  return piece;
}

/** Mint a plain gear piece into its authored slot — base armor, full
 * durability, no affixes (the same shape createGame's starting gear uses). */
function mintGear(
  state: GameState,
  defId: string,
  wearSlot: string,
): Equipment | null {
  let def;
  try {
    def = gearDef(defId);
  } catch {
    warn(`scenario: unknown gear def '${defId}' — slot left as it was`);
    return null;
  }
  if (def.slot !== wearSlot) {
    warn(`scenario: '${defId}' is a ${def.slot} piece, not ${wearSlot}`);
    return null;
  }
  const piece: Equipment = {
    id: state.nextId++,
    defId,
    slot: def.slot,
    tier: "regular",
    ilvl: def.levelReq ?? 1,
    affixes: [],
  };
  if (def.armor !== undefined) piece.armor = def.armor;
  if (def.durability !== undefined) piece.durability = def.durability;
  return piece;
}

/** Teleport the hero to the spec's spot (or a stand-off from the boss). */
function placePlayer(state: GameState, place: "boss" | Vec2): void {
  const player = state.player;
  let target: Vec2;
  if (place === "boss") {
    const boss = state.enemies.find((e) => enemyDef(e.defId).role === "boss");
    if (!boss) {
      warn("scenario: place 'boss' but the level has no boss — not moved");
      return;
    }
    // Land a stand-off short of the boss, back along the line toward where
    // the hero stood (his approach direction), facing the fight.
    const away = distance(player.pos, boss.pos);
    const dir =
      away > 1
        ? vec(
            (player.pos.x - boss.pos.x) / away,
            (player.pos.y - boss.pos.y) / away,
          )
        : vec(1, 0);
    const reach = enemyDef(boss.defId).radius + BOSS_STANDOFF;
    target = vec(boss.pos.x + dir.x * reach, boss.pos.y + dir.y * reach);
    player.facing = vec(-dir.x, -dir.y);
    player.faceLeft = dir.x > 0;
  } else {
    target = vec(place.x, place.y);
  }
  player.pos = vec(
    clamp(target.x, 8, state.level.width - 8),
    clamp(target.y, 8, state.level.height - 8),
  );
  revealAround(state, player.pos);
}

/** Drop one spawn line's monsters into their ring (or onto their spot). */
function spawnRing(state: GameState, spawn: ScenarioSpawn): void {
  let def;
  try {
    def = enemyDef(spawn.enemy);
  } catch {
    warn(`scenario: unknown enemy def '${spawn.enemy}' — spawn skipped`);
    return;
  }
  const count = Math.max(1, Math.floor(spawn.count ?? 1));
  const min = Math.max(0, spawn.minDistance ?? 60);
  const max = Math.max(min, spawn.maxDistance ?? min + 160);
  const mlvl = spawn.mlvl ?? currentMobLevel(state);
  const hpMult = mobLevelScale(state) * (spawn.hpMult ?? 1);
  const center = state.player.pos;

  for (let i = 0; i < count; i++) {
    const pos =
      spawn.at !== undefined
        ? vec(spawn.at.x, spawn.at.y)
        : samplePosition(state, center, min, max, def.radius);
    state.enemies.push(
      spawnEnemy(
        spawn.enemy,
        pos,
        state.rng,
        state.nextId++,
        hpMult,
        0,
        1,
        mlvl,
      ),
    );
  }
  state.stats.totalEnemies += count;
}

/**
 * Rejection-sample a ring position: at least `min` from the center, clear
 * of obstacles, inside the level. A scenario must deliver its count — after
 * the attempts run out the last far-enough candidate is used even inside an
 * obstacle (bodies resolve out on the first step), and as a final resort
 * the ring floor east of the center.
 */
function samplePosition(
  state: GameState,
  center: Vec2,
  min: number,
  max: number,
  radius: number,
): Vec2 {
  let fallback: Vec2 | null = null;
  for (let attempts = 0; attempts < SPAWN_ATTEMPTS; attempts++) {
    const angle = state.rng() * Math.PI * 2;
    const ring = min + state.rng() * (max - min);
    const pos = vec(
      clamp(
        center.x + Math.cos(angle) * ring,
        radius,
        state.level.width - radius,
      ),
      clamp(
        center.y + Math.sin(angle) * ring,
        radius,
        state.level.height - radius,
      ),
    );
    if (distance(pos, center) < min) continue;
    fallback = pos;
    if (!insideObstacle(state, pos, radius)) return pos;
  }
  return (
    fallback ??
    vec(
      clamp(center.x + min, radius, state.level.width - radius),
      clamp(center.y, radius, state.level.height - radius),
    )
  );
}
