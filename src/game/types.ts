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

/**
 * The difficulty ladder, gentlest to absurd. Chosen on the main menu before
 * a run; the per-setting numbers live in defs/difficulties.ts.
 */
export type Difficulty = "easy" | "medium" | "hard" | "nightmare" | "jesus";

/** The six trainable stats, one point awarded per level-up. */
export type StatName =
  "health" | "strength" | "dexterity" | "intelligence" | "speed" | "luck";

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
  /**
   * Weapon-upgrade pickups applied to this piece (weapons only). They stick
   * to the weapon that was held when the upgrade was collected.
   */
  upgrades?: number;
};

/**
 * A running time-limited power granted by an ability pickup (fire orbs,
 * lightning storm, stasis field). `defId` keys into ABILITY_DEFS; the two
 * scratch fields mean different things per ability kind.
 */
export type ActiveAbility = {
  defId: string;
  remainingMs: number;
  /** Orbit abilities: the current sweep angle in radians. */
  angle: number;
  /** Ms until the ability's next damage tick / strike. */
  cooldownMs: number;
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
  /**
   * Which way the sprite mirrors. Updated with hysteresis (see
   * PLAYER.faceFlipMinX) so near-vertical movement doesn't flicker the flip.
   */
  faceLeft: boolean;
  /** Time-limited powers currently running (spent ability pickups). */
  abilities: ActiveAbility[];
  /**
   * Ability pickups carried but not yet used (ABILITY_DEFS ids, oldest
   * first). The `useItem` input spends the head; HELD_ITEMS.cap bounds it.
   */
  heldAbilities: string[];
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
  /**
   * Height above the ground at which the shot is drawn — inherited from a
   * jumping shooter, sinking back to 0 in flight. Visual only.
   */
  z: number;
};

export type Item =
  | { id: number; kind: "medkit"; pos: Vec2 }
  | { id: number; kind: "upgrade"; pos: Vec2 }
  | { id: number; kind: "equipment"; pos: Vec2; equipment: Equipment }
  /** A time-limited power pickup; `defId` keys into ABILITY_DEFS. */
  | { id: number; kind: "ability"; pos: Vec2; defId: string };

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
  /** A storm ability bolt struck at `pos` (drives the flash + crack). */
  | { type: "lightning"; pos: Vec2 }
  /** An ability pickup kicked in (or refreshed its timer). */
  | { type: "abilityStarted"; defId: string }
  | { type: "abilityEnded"; defId: string }
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
  /**
   * True on the step the player asked to use a carried ability pickup
   * (mouse click / two-finger tap / HUD button edge). Spends the oldest
   * held ability; a no-op with empty hands.
   */
  useItem?: boolean;
  /**
   * The world rect currently on screen (the camera view). When set, the
   * auto-weapon only targets monsters inside it — the character never
   * shoots at enemies the player cannot see yet. Absent (headless tests,
   * bots) targeting falls back to weapon range alone.
   */
  view?: { x: number; y: number; width: number; height: number };
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
  /** The run's chosen difficulty (scales spawns, hp, and loot). */
  difficulty: Difficulty;
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
  /**
   * Equipment dropped by regular monsters so far — the pity counter behind
   * LOOT.minEquipmentPerLevel (boss drops don't count toward it).
   */
  minionEquipmentDrops: number;
  /**
   * Monsters spawned so far per wave-budget line (indexed like the level's
   * `waves.budget`). The spawner streams each line in until its count is
   * exhausted; empty when the level has no waves.
   */
  waveSpawned: number[];
  /**
   * World px the player has walked that the spawner hasn't converted into
   * monsters yet — moving through the level stirs more of the horde awake
   * (waves.moveSpawnEvery px each).
   */
  moveSpawnCredit: number;
  /**
   * Kill count at which the level's guaranteed early weapon drops (rolled
   * at creation from loot.earlyWeapon); null once dropped or when the level
   * has none.
   */
  earlyWeaponAtKills: number | null;
  stats: GameStats;
  /** Events emitted by the most recent `step()`. */
  events: GameEvent[];
  /** Monotonic id source for spawned entities. */
  nextId: number;
  /** Seeded stream for in-run rolls (crits, drops) — keeps runs replayable. */
  rng: Rng;
};
