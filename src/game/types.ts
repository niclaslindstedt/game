// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Data shapes for the simulation. The state is a plain mutable object the
// renderer reads every frame; `step()` advances it and reports what happened
// as events so the app layer can drive sound and visual feedback without the
// engine knowing either exists. The state holds a seeded RNG closure for
// in-run rolls (crits, drops), so it is deterministic but not JSON-plain.
//
// Entities reference the content catalogs (defs/) by id: an Enemy carries a
// `defId` into ENEMY_DEFS, an Equipment a `defId` into WEAPON_DEFS/GEAR_DEFS.
// The catalogs scale to hundreds of entries without these shapes changing.

import type { Rng } from "@game/lib/rng.ts";
import type { Vec2 } from "@game/lib/vec.ts";

/**
 * `intro` shows the story text box, `levelup` waits for a stat choice,
 * `inventory` pauses for bag management; the simulation only advances while
 * `playing`.
 */
export type GamePhase =
  "intro" | "playing" | "levelup" | "inventory" | "victory" | "defeat";

/** The five trainable stats, one point awarded per level-up. */
export type StatName =
  "health" | "strength" | "dexterity" | "intelligence" | "luck";

export type WeaponClass = "melee" | "ranged" | "magic";

/**
 * Item quality, lowest to highest. Every tier exists engine-wide; each
 * level's loot table decides which tiers can actually drop there (the moon
 * rolls regular and magic only).
 */
export type Tier = "regular" | "magic" | "epic" | "legendary";

export type EquipSlot = "weapon" | "suit" | "charm";

/** One rolled bonus on a magic+ item. Higher tiers roll more of them. */
export type Affix =
  | { kind: "damagePct"; value: number }
  | { kind: "maxHp"; value: number }
  | { kind: "crit"; value: number }
  | { kind: "stat"; value: number; stat: StatName };

/** A droppable, equippable item instance (medkits are consumables, not this). */
export type Equipment = {
  id: number;
  /** Key into WEAPON_DEFS or GEAR_DEFS. */
  defId: string;
  slot: EquipSlot;
  tier: Tier;
  /** Rolled bonuses; length is dictated by the tier. */
  affixes: Affix[];
};

export type Player = {
  pos: Vec2;
  /** Height above the ground (world px) and vertical speed while jumping. */
  z: number;
  vz: number;
  hp: number;
  maxHp: number;
  /** Unit vector of the last movement direction; drives sprite facing. */
  facing: Vec2;
  /** True while the player moved this step; drives the walk animation. */
  moving: boolean;
  /** Remaining ms until the weapon may fire again. */
  weaponCooldownMs: number;
  /** Remaining ms of post-hit invulnerability flash (visual only). */
  hurtFlashMs: number;
  level: number;
  xp: number;
  /** XP still needed to reach the next level. */
  xpToNext: number;
  /** Stat points awarded but not yet spent (spent via `allocateStat`). */
  pendingStatPoints: number;
  stats: Record<StatName, number>;
  equipment: {
    /** Never empty — the character always fights with something. */
    weapon: Equipment;
    suit: Equipment | null;
    charm: Equipment | null;
  };
  /** Fixed-size bag; `null` cells are empty. */
  inventory: (Equipment | null)[];
};

export type Enemy = {
  id: number;
  /** Key into ENEMY_DEFS (hp/speed/damage/AI live on the def). */
  defId: string;
  pos: Vec2;
  /** Spawn point: monsters return here when the player escapes their aggro. */
  home: Vec2;
  hp: number;
  maxHp: number;
  /** Snapshot of def speed × per-instance jitter. */
  speed: number;
  /** Remaining ms until this enemy may deal contact damage again. */
  contactCooldownMs: number;
};

export type Projectile = {
  id: number;
  pos: Vec2;
  /** Unit direction of travel. */
  dir: Vec2;
  speed: number;
  radius: number;
  /** Damage before the on-hit crit roll. */
  damage: number;
  /** Remaining ms before the projectile despawns. */
  lifetimeMs: number;
  /** Which weapon class fired it (drives the projectile sprite). */
  weaponClass: WeaponClass;
};

export type Item =
  | { id: number; kind: "medkit"; pos: Vec2 }
  | { id: number; kind: "equipment"; pos: Vec2; equipment: Equipment };

/** A decorative feature scattered at level creation — rendered, no collision. */
export type Decor = {
  kind: string;
  pos: Vec2;
};

/** A fixed story prop (the lander, the flag, …) placed by the level def. */
export type Landmark = {
  kind: string;
  pos: Vec2;
};

export type GameStats = {
  kills: number;
  totalEnemies: number;
  shotsFired: number;
  damageDealt: number;
  damageTaken: number;
  itemsCollected: number;
  xpGained: number;
  /** Wall-clock ms of simulated play time. */
  timeMs: number;
};

/**
 * Something notable that happened during one `step()`, for the app layer to
 * react to (play a sound, flash the screen). Cleared at the start of every
 * step.
 */
export type GameEvent =
  | { type: "shot"; weaponClass: WeaponClass }
  | { type: "swing" }
  | { type: "jump" }
  | { type: "land" }
  | { type: "enemyHit"; pos: Vec2; crit: boolean }
  | { type: "enemyKilled"; pos: Vec2; defId: string }
  | { type: "playerHurt"; crit: boolean }
  | { type: "itemCollected"; kind: Item["kind"]; tier?: Tier }
  | { type: "itemDropped"; pos: Vec2 }
  | { type: "levelUp"; level: number }
  | { type: "bossDefeated"; pos: Vec2 }
  | { type: "victory" }
  | { type: "defeat" };

/** Per-step player intent, produced by the app's input layer. */
export type GameInput = {
  /** True while the pointer/touch is held down. */
  steering: boolean;
  /** Steering target in world coordinates (meaningful while steering). */
  target: Vec2;
  /** True on the step a jump was requested (tap / space edge, not hold). */
  jump: boolean;
};

/** Static facts about the running level, snapshotted from its LevelDef. */
export type LevelInfo = {
  /** Key into LEVELS. */
  id: string;
  /** Story order (1 = earth, 2 = the moon, …). */
  index: number;
  name: string;
  width: number;
  height: number;
  /** Downward acceleration in world px/s² — per level: moon ≈ earth/6. */
  gravity: number;
  /** Tileset/mood key for the renderer ("moon", "earth", …). */
  biome: string;
};

export type GameState = {
  phase: GamePhase;
  level: LevelInfo;
  /** Where the run begins; also the origin difficulty scales out from. */
  playerSpawn: Vec2;
  /** Story props to draw (the lander, the boss's flag, …). */
  landmarks: Landmark[];
  player: Player;
  enemies: Enemy[];
  projectiles: Projectile[];
  items: Item[];
  decor: Decor[];
  /** Counts down once the objective clears; the level ends at 0. */
  victoryCountdownMs: number | null;
  stats: GameStats;
  /** Events emitted by the most recent `step()`. */
  events: GameEvent[];
  /** Monotonic id source for spawned entities. */
  nextId: number;
  /** Seeded stream for in-run rolls (crits, drops) — keeps runs replayable. */
  rng: Rng;
};
