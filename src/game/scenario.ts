// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Test-scenario support: mutate a freshly created run into an exact
// situation — the hero at the boss with 2 hp and no weapon, sixty mobs in a
// ring around him, the wave spawner silenced, a redrawn sprite posed frozen
// over its own level ground — so bugs, performance problems, and art
// judgements can be staged on demand instead of played into. This is a
// developer tool, not a gameplay system: the app feeds it from the
// `?scenario=` URL param (see docs/configuration.md and the `test-scenario`
// skill), tests call `applyScenario` directly after `createGame`.

import { clamp, distance, vec, type Vec2 } from "@game/lib/vec.ts";
import { CONSUMABLES, HELD_ITEMS, MEDKIT, MERCHANT } from "./config/index.ts";
import { abilityDef } from "./defs/abilities.ts";
import { enemyDef } from "./defs/enemies/index.ts";
import {
  gearDef,
  isGearDef,
  isWeaponDef,
  weaponDef,
} from "./defs/equipment.ts";
import { levelDef } from "./defs/levels/index.ts";
import { talentDefs } from "./defs/talents/index.ts";
import { scaledMobCount } from "./defs/difficulties.ts";
import { storyItemDef } from "./defs/story.ts";
import { uniqueDef } from "./defs/uniques.ts";
import { spawnEnemy } from "./create.ts";
import {
  mintUnique,
  recomputeMaxHp,
  recomputeMaxStamina,
  rollEquipment,
  skipStoryOpening,
  syncInventoryCapacity,
} from "./items/index.ts";
import { xpToLevelUp } from "./leveling.ts";
import { revealAround } from "./map.ts";
import { currentMobLevel, mobLevelScale } from "./menace.ts";
import { insideObstacle } from "./obstacles.ts";
import { warn } from "../output.ts";
import type {
  Equipment,
  GameState,
  Item,
  StatName,
  Tier,
} from "./types/index.ts";

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
  /**
   * Spawn already WOUNDED: current hp as a fraction of max, clamped to
   * (0, 1]. The renderer swaps wound sprites off this same fraction (config
   * WOUNDS: ≤0.5 hurt, ≤0.25 wrecked for elites/bosses, ≤0.1 a boss's dying
   * last stand), so a staged `hpFrac` shows a battle-damage stage in-game
   * without landing a single hit. Default 1 — spawned fresh.
   */
  hpFrac?: number;
};

/**
 * One line of GROUND ITEMS laid out around the hero — pickups posed in the
 * world exactly like `spawns` poses monsters. The art loop's tool for judging
 * item/pickup sprites over real level ground (see the art-improvement skill).
 */
export type ScenarioDrop = {
  /**
   * What lies on the ground: a loose pickup kind (`medkit` / `xp` / `repair`
   * / `drink`), an equipment def id (WEAPON_DEFS/GEAR_DEFS — minted at
   * `tier`), a UNIQUE_DEFS id (minted as that named piece), an ABILITY_DEFS
   * id, or a STORY_ITEM_DEFS id. An unknown id warns and skips the line.
   */
  item: string;
  /** How many copies. Default 1. */
  count?: number;
  /** Equipment ids only: the minted tier (drop-beam color, affix count).
   * Default `regular`. */
  tier?: Tier;
  /** Exact spot instead of the ring — every copy lands here. */
  at?: Vec2;
  /** Ring inner radius around the player (world units). Default 30 — beyond
   * pickup reach, so the hero doesn't scoop the exhibit. */
  minDistance?: number;
  /** Ring outer radius. Default `minDistance + 90` (inside one screen). */
  maxDistance?: number;
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
   * boss (facing it), `"merchant"` a step outside the merchant's discovery
   * radius (facing the stall — one step closer triggers the meeting), and a
   * `{x, y}` lands him exactly there. The map is revealed around the landing
   * spot.
   */
  place?: "boss" | "merchant" | Vec2;
  /**
   * POSE the world for a screenshot: enemies neither move, strike, nor fire;
   * the merchant stops wandering (and can't be discovered mid-pose);
   * companions hold position. The hero stays fully playable — pair with
   * `disarmed` so the auto-attack doesn't cut down the exhibits. Applied to
   * `state.freeze`; `window.__scenario({freeze: false})` thaws a live run.
   */
  freeze?: boolean;
  /** Hit points, clamped to [1, maxHp] after gear/stats resolve. */
  hp?: number;
  /** Sprint pool, clamped to [0, maxStamina]. */
  stamina?: number;
  /** Player level (xp resets to 0, xpToNext re-derived). No stat points are
   * granted — pair with `stats` to describe the build. */
  level?: number;
  /** ABSOLUTE allocated stat points per stat (not deltas). */
  stats?: Partial<Record<StatName, number>>;
  /** ABSOLUTE talent ranks per talent id (a `defs/talents/` id → rank), so a
   * scenario can stage a specced hero to eyeball a talent's always-on effect and
   * its FX (e.g. `{ immolation_aura: 5, arcane_singularity: 5 }`). Clamped to
   * the talent's `maxRank`; an unknown id is ignored. */
  talents?: Record<string, number>;
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
  /** Stacked medkits per quality (index → count, clamped to the stack cap) —
   * stages the consumable dock's medkit slot for a screenshot. */
  medkits?: number[];
  /** Stacked stamina potions (clamped to the stack cap) — stages the dock's
   * stamina slot. */
  staminaPotions?: number;
  /** Stacked weapon repair kits (clamped to the stack cap) — stages the dock's
   * repair slot. */
  repairKits?: number;
  /**
   * Remove the spawned population before the scenario's own spawns land.
   * Bosses are kept — deleting the objective would end the level on the
   * spot (see step/ `objectiveCleared`).
   */
  clearEnemies?: boolean;
  /** Exhaust the wave budget so the horde spawner stays silent and the
   * field holds exactly what the scenario placed. */
  stopWaves?: boolean;
  /** Extra monsters, spawned after `clearEnemies`/`stopWaves` resolve. */
  spawns?: ScenarioSpawn[];
  /** Ground items laid out around the hero (after `place` resolves), for
   * judging pickup/item art in the world. */
  drops?: ScenarioDrop[];
};

/** How far from the boss `place: "boss"` sets the hero down. */
const BOSS_STANDOFF = 90;
/** How far past the merchant's discovery radius `place: "merchant"` stays —
 * he fills the frame but the meeting scene doesn't fire on its own. */
const MERCHANT_STANDOFF_SLACK = 10;
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
  if (spec.freeze !== undefined) state.freeze = spec.freeze;

  if (spec.level !== undefined) {
    player.level = Math.max(1, Math.floor(spec.level));
    player.xp = 0;
    player.xpToNext = xpToLevelUp(player.level, state.difficulty);
  }
  if (spec.stats) {
    for (const [stat, points] of Object.entries(spec.stats)) {
      const value = Math.max(0, points ?? 0);
      player.stats[stat as StatName] = value;
      // A forced build reads as the hero's own picks on the chooser.
      player.spentStats[stat as StatName] = value;
    }
  }
  if (spec.talents) {
    for (const [id, rank] of Object.entries(spec.talents)) {
      const def = talentDefs()[id];
      if (!def) continue; // unknown id — ignore
      const value = Math.max(0, Math.min(def.maxRank, Math.floor(rank)));
      if (value > 0) player.talents[id] = value;
      else delete player.talents[id];
    }
  }

  if (spec.weapon !== undefined) {
    // `null` = the unbreakable fallback sidearm — the same piece items/durability.ts
    // draws when a weapon shatters with an empty bag ("no weapon"). A
    // UNIQUE_DEFS id mints that named unique (its bonuses AND its signature
    // look), so a scenario can stage a hero holding a specific unique.
    const defId = spec.weapon ?? "blaster";
    const asUnique =
      spec.weapon !== null && knownDef(uniqueDef, defId)
        ? uniqueDef(defId)
        : null;
    if (asUnique && asUnique.slot === "weapon") {
      player.equipment.weapon = mintUnique(state, defId);
      player.weaponCooldownMs = 0;
    } else if (spec.weapon !== null && !isWeaponDef(defId)) {
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
  if (spec.medkits) {
    player.medkits = new Array<number>(MEDKIT.tiers.length)
      .fill(0)
      .map((_, i) =>
        clamp(Math.round(spec.medkits?.[i] ?? 0), 0, CONSUMABLES.stackCap),
      );
  }
  if (spec.staminaPotions !== undefined) {
    player.staminaPotions = clamp(
      Math.round(spec.staminaPotions),
      0,
      CONSUMABLES.stackCap,
    );
  }
  if (spec.repairKits !== undefined) {
    player.repairKits = clamp(
      Math.round(spec.repairKits),
      0,
      CONSUMABLES.stackCap,
    );
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
      // A staged field stays staged: park the trickle cooldown effectively
      // forever so the post-budget straggler stream (stepSpawner) can't wander
      // into an fps probe or a posed screenshot. Finite so it serializes.
      state.trickleMs = Number.MAX_SAFE_INTEGER;
    }
  }

  for (const spawn of spec.spawns ?? []) spawnRing(state, spawn);
  for (const drop of spec.drops ?? []) dropRing(state, drop);
}

/** Mint a plain weapon at catalog durability (the fallback sidearm is
 * unbreakable, exactly as items/durability.ts mints it). */
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

/** Teleport the hero to the spec's spot (or a stand-off from the boss or
 * the merchant's stall). */
function placePlayer(
  state: GameState,
  place: "boss" | "merchant" | Vec2,
): void {
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
  } else if (place === "merchant") {
    // A step OUTSIDE the discovery radius: the trader fills the frame but
    // his meeting scene waits for the player (or a nudge) to trigger it.
    // Horizontally beside the stall, not on the approach line — the phone
    // frame shows ~97 world units above/below the hero, so a vertical
    // stand-off this size would park the merchant just off-screen.
    const merchant = state.merchant.pos;
    const reach = MERCHANT.discoverRadius + MERCHANT_STANDOFF_SLACK;
    const side = player.pos.x >= merchant.x ? 1 : -1;
    target = vec(merchant.x + side * reach, merchant.y);
    player.facing = vec(-side, 0);
    player.faceLeft = side > 0;
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
    const mob = spawnEnemy(
      spawn.enemy,
      pos,
      state.rng,
      state.nextId++,
      hpMult,
      0,
      1,
      mlvl,
    );
    // Staged battle damage: land on the wound fraction directly (never
    // below 1 hp — a scenario poses wounded mobs, it doesn't kill them).
    if (spawn.hpFrac !== undefined) {
      mob.hp = clamp(Math.round(mob.maxHp * spawn.hpFrac), 1, mob.maxHp);
    }
    state.enemies.push(mob);
  }
  state.stats.totalEnemies += count;
}

/** Lay one drop line's ground items into their ring (or onto their spot). */
function dropRing(state: GameState, drop: ScenarioDrop): void {
  const count = Math.max(1, Math.floor(drop.count ?? 1));
  const min = Math.max(0, drop.minDistance ?? 30);
  const max = Math.max(min, drop.maxDistance ?? min + 90);
  const center = state.player.pos;
  for (let i = 0; i < count; i++) {
    const pos =
      drop.at !== undefined
        ? vec(drop.at.x, drop.at.y)
        : samplePosition(state, center, min, max, MEDKIT.radius);
    const item = mintDrop(state, drop, pos);
    if (!item) return; // unknown id — warned once, the whole line skipped
    state.items.push(item);
  }
}

/** True when `lookup` recognizes the id (the def accessors throw loudly). */
function knownDef(lookup: (id: string) => unknown, id: string): boolean {
  try {
    lookup(id);
    return true;
  } catch {
    return false;
  }
}

/**
 * Mint one ground item off a drop line: loose pickup kinds pass through;
 * equipment ids mint at the line's tier (make quality pinned to normal so a
 * staged sprite is the catalog sprite); unique ids mint the named piece;
 * ability/story ids wrap their def. Unknown ids warn and mint nothing.
 */
function mintDrop(
  state: GameState,
  drop: ScenarioDrop,
  pos: Vec2,
): Item | null {
  const id = drop.item;
  if (id === "medkit" || id === "xp" || id === "repair" || id === "drink") {
    return { id: state.nextId++, kind: id, pos };
  }
  if (isWeaponDef(id) || isGearDef(id)) {
    return {
      id: state.nextId++,
      kind: "equipment",
      pos,
      equipment: rollEquipment(state, {
        defId: id,
        tier: drop.tier ?? "regular",
        quality: "normal",
      }),
    };
  }
  if (knownDef(uniqueDef, id)) {
    return {
      id: state.nextId++,
      kind: "equipment",
      pos,
      equipment: mintUnique(state, id),
    };
  }
  if (knownDef(abilityDef, id)) {
    return { id: state.nextId++, kind: "ability", pos, defId: id };
  }
  if (knownDef(storyItemDef, id)) {
    return { id: state.nextId++, kind: "story", pos, defId: id };
  }
  warn(`scenario: unknown drop item '${id}' — drop skipped`);
  return null;
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
