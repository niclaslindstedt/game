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

import type { CutsceneState } from "@game/lib/cutscene.ts";
import type { Rng } from "@game/lib/rng.ts";
import type { Vec2 } from "@game/lib/vec.ts";

/**
 * `cutscene` plays the level's prelude scene, `intro` shows the story text
 * box, `levelup` waits for a stat choice, `inventory` pauses for bag
 * management, `dialogue` holds the world while a character (or a found
 * story item) speaks; the simulation only advances while `playing`.
 */
export type GamePhase =
  | "cutscene"
  | "intro"
  | "playing"
  | "levelup"
  | "inventory"
  | "dialogue"
  | "victory"
  | "defeat";

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
   * Attacks left before this weapon breaks (weapons only; the def carries
   * the maximum). Undefined = unbreakable — the player's own sidearm never
   * wears out, so the run can never be left weaponless.
   */
  durability?: number;
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
  /**
   * Remaining ms of the "that was a CRIT" flash — the renderer blinks the
   * sprite while this runs. Visual only, set by critical player hits.
   */
  critFlashMs?: number;
  /**
   * Elites sleep at their post until the player wanders close (or wounds
   * them); once true they hunt forever — no drifting back home. Unused by
   * minions and bosses, whose wakefulness is derived per tick.
   */
  awake?: boolean;
  /**
   * True once this enemy's dialogue has played (or been skipped by killing
   * the speaker mid-rush). Speakers only ever get one scene.
   */
  spoke?: boolean;
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
  /** The golden level-up arrow: grants a share of the XP to the next level. */
  | { id: number; kind: "xp"; pos: Vec2 }
  /** A repair kit: restores the equipped weapon's durability to full. */
  | { id: number; kind: "repair"; pos: Vec2 }
  | { id: number; kind: "equipment"; pos: Vec2; equipment: Equipment }
  /** A time-limited power pickup; `defId` keys into ABILITY_DEFS. */
  | { id: number; kind: "ability"; pos: Vec2; defId: string }
  /**
   * A plot piece — a keycard, a dossier, the anti-grav unit. `defId` keys
   * into STORY_ITEM_DEFS; picking one up banks it in `state.storyItems`
   * (never the bag) and plays its lore as a dialogue.
   */
  | { id: number; kind: "story"; pos: Vec2; defId: string };

/** A decorative feature scattered at level creation — rendered, no collision. */
export type Decor = {
  kind: string;
  pos: Vec2;
};

/**
 * A solid feature neither the player nor monsters can move through. Low ones
 * (`jumpable`) can be cleared mid-jump — monsters never jump, so a low rock
 * is a wall to the horde and a hop to the player. Tall ones block everyone.
 */
export type Obstacle = {
  id: number;
  /** Sprite/kind key for the renderer ("boulder", "rock"). */
  kind: string;
  pos: Vec2;
  /** Collision radius in world px. */
  radius: number;
  /** True when a jumping player sails over it. */
  jumpable: boolean;
};

/** A fixed story prop (the lander, the flag, …) placed by the level def. */
export type Landmark = {
  kind: string;
  pos: Vec2;
};

/**
 * A locked door from the level def: a wall segment of `door_locked`
 * obstacles that vanishes when the player brings the matching key (a story
 * item whose `unlocks` names this door) up to it.
 */
export type DoorState = {
  /** The LevelDef door id story items reference via `unlocks`. */
  id: string;
  /** Midpoint of the door segment (event anchor, proximity checks). */
  center: Vec2;
  /** The obstacle ids to remove from `state.obstacles` when it opens. */
  obstacleIds: number[];
  open: boolean;
};

/**
 * The running conversation while `phase === "dialogue"`: an elite or boss
 * delivering its scene, or a picked-up story item revealing its lore. The
 * pages live on the def (EnemyDef.dialogue / StoryItemDef.lore); this
 * tracks only who speaks and how far the player has tapped.
 */
export type DialogueState = {
  source:
    | { kind: "enemy"; enemyId: number; defId: string }
    | { kind: "story"; defId: string };
  /** Index of the page currently on screen. */
  page: number;
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
  | {
      type: "enemyHit";
      pos: Vec2;
      crit: boolean;
      damage: number;
      defId: string;
    }
  | {
      type: "enemyKilled";
      pos: Vec2;
      defId: string;
      /** The killing blow, so death also floats a damage number. */
      damage: number;
      crit: boolean;
    }
  | { type: "playerHurt"; crit: boolean }
  | { type: "itemCollected"; kind: Item["kind"]; tier?: Tier }
  | { type: "itemDropped"; pos: Vec2 }
  /** A picked-up piece was better than the equipped one and replaced it. */
  | { type: "autoEquipped"; defId: string }
  /** The equipped weapon's durability ran out; `defId` is the broken one. */
  | { type: "weaponBroke"; defId: string }
  /** A screen-nuke pickup went off at the player's position. */
  | { type: "nuke"; pos: Vec2 }
  /** A storm ability bolt struck at `pos` (drives the flash + crack). */
  | { type: "lightning"; pos: Vec2 }
  /** An ability pickup kicked in (or refreshed its timer). */
  | { type: "abilityStarted"; defId: string }
  | { type: "abilityEnded"; defId: string }
  | { type: "levelUp"; level: number }
  | { type: "bossDefeated"; pos: Vec2 }
  /** A speaker took the stage: the run paused into the `dialogue` phase. */
  | { type: "dialogueStarted"; speaker: string }
  /** A plot piece was picked up (`defId` keys into STORY_ITEM_DEFS). */
  | { type: "storyItemCollected"; defId: string }
  /** A locked door recognized its key and slid open. */
  | { type: "doorOpened"; pos: Vec2 }
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
  /** What the HUD calls this level's hostiles ("GHOSTS", "STAFF"). */
  foes: string;
};

export type GameState = {
  phase: GamePhase;
  /**
   * The running prelude scene while `phase === "cutscene"` (see
   * @game/lib/cutscene and defs/cutscenes.ts); null once it played out.
   */
  cutscene: CutsceneState | null;
  level: LevelInfo;
  /** The run's chosen difficulty (scales spawns, hp, and loot). */
  difficulty: Difficulty;
  /** Where the run begins; also the origin difficulty scales out from. */
  playerSpawn: Vec2;
  /** Story props to draw (the lander, the boss's flag, …). */
  landmarks: Landmark[];
  /** The running conversation while `phase === "dialogue"`; null otherwise. */
  dialogue: DialogueState | null;
  /** Collected story items (STORY_ITEM_DEFS ids) — keys, dossiers, the lot. */
  storyItems: string[];
  /** Locked doors built from the level def, open or not. */
  doors: DoorState[];
  player: Player;
  enemies: Enemy[];
  projectiles: Projectile[];
  items: Item[];
  decor: Decor[];
  /** Solid features scattered at level creation — see Obstacle. */
  obstacles: Obstacle[];
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
