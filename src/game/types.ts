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
 * box, `title` flashes the level name alone before the drop, `levelup` waits
 * for a stat choice, `inventory` pauses for bag management, `dialogue` holds
 * the world while a character (or a found story item) speaks; the simulation
 * only advances while `playing`.
 */
export type GamePhase =
  | "cutscene"
  | "intro"
  | "title"
  | "playing"
  | "paused"
  | "levelup"
  | "inventory"
  | "dialogue"
  | "victory"
  | "defeat";

/**
 * A difficulty id: a key into DIFFICULTY_DEFS. Deliberately a bare `string`
 * so the ladder is pure data like every other catalog — adding a difficulty
 * means adding a def entry (and listing it in DIFFICULTY_ORDER), not editing
 * this type. The shipped ladder runs easy → medium → hard → nightmare →
 * jesus; the numbers and menu presentation live in defs/difficulties.ts.
 */
export type Difficulty = string;

/** The six trainable stats, one point awarded per level-up. */
export type StatName =
  "stamina" | "strength" | "dexterity" | "intelligence" | "speed" | "luck";

export type WeaponClass = "melee" | "ranged" | "magic";

/**
 * A suit's armor grade: how tough its plating is. Each grade maps to a soak
 * fraction and a pool size in config `ARMOR`; higher grades soak more of each
 * hit from a deeper pool. Data on the suit's gear def.
 */
export type ArmorGrade = "green" | "yellow" | "red";

/**
 * Item quality, lowest to highest: white regular, blue magic, yellow rare,
 * purple epic, orange legendary (the colors are the app's, see tiers.ts).
 * Every tier exists engine-wide; each level's loot table decides which tiers
 * can actually drop there (a level may cap the rarity it awards), and elites
 * and bosses sweeten the roll — rares are the reward for the plot fights and
 * the deeper levels, never the level-1 rank and file.
 */
export type Tier = "regular" | "magic" | "rare" | "epic" | "legendary";

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
  /**
   * Current armor points — the suit's plating pool. Soaks a grade-dependent
   * share of every physical hit until spent (see config `ARMOR`); 0 with no
   * armored suit worn. The grade and full pool are derived from the equipped
   * suit (see `armorInfo`); this is only the running remainder.
   */
  armor: number;
  /**
   * Current stamina — the sprint pool. Running spends it, walking/idling
   * refills it; an empty pool caps the top speed (see config `STAMINA`).
   */
  stamina: number;
  /** Max stamina, from the base pool + STAMINA stat (see `computeMaxStamina`). */
  maxStamina: number;
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
   * them); once true they hunt forever — no drifting back home. Minions use
   * it as their aggro latch: waking needs line of sight (some minions
   * excepted),
   * the chase then holds even through walls, and escaping the aggro radius
   * puts them back to sleep. Unused by bosses, whose wakefulness is derived
   * per tick.
   */
  awake?: boolean;
  /**
   * True once this enemy's dialogue has played (or been skipped by killing
   * the speaker mid-rush). Speakers only ever get one scene.
   */
  spoke?: boolean;
  /**
   * Evolution stage stamped on a minion when the menace meter was high at its
   * spawn (see config MENACE). Its extra hp is already baked into `hp`/`maxHp`;
   * this field is what the loot roll reads to sweeten an evolved mob's drop,
   * and the renderer reads to mark it as evolved. 0/undefined = un-evolved.
   */
  evo?: number;
  /**
   * Elite/boss power-match bookkeeping. `powerScaled` latches true the first
   * time the fight engages so the scale is applied exactly once;
   * `contactMult` is the (softened) multiplier its contact damage carries
   * afterwards. See maybePowerScale in menace.ts.
   */
  powerScaled?: boolean;
  contactMult?: number;
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
  /** Which weapon class fired it (drives sound and hit resolution). */
  weaponClass: WeaponClass;
  /** The sprite the renderer draws for this shot (staple, zap, vial…). */
  sprite: string;
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
  /** Def key for the piece (debugging/analytics); the renderer draws `sprite`. */
  kind: string;
  /** Sprite name the renderer blits — resolved from the level def. */
  sprite: string;
  pos: Vec2;
};

/**
 * A solid feature neither the player nor monsters can move through. Low ones
 * (`jumpable`) can be cleared mid-jump — monsters never jump, so a low rock
 * is a wall to the horde and a hop to the player. Tall ones block everyone.
 */
export type Obstacle = {
  id: number;
  /** Def key for the piece (analytics/debugging). */
  kind: string;
  /** Sprite name the renderer blits — resolved from the level def. */
  sprite: string;
  pos: Vec2;
  /**
   * Bounding radius in world px — the collision radius for a round obstacle,
   * and the coarse cull/spacing radius for a rectangular one (see `half`).
   */
  radius: number;
  /**
   * Rectangular footprint (half-extents in world px), present on sized rocks.
   * When set, collision, line-of-sight and shots test the box; when absent the
   * obstacle is the plain circle of `radius`.
   */
  half?: Vec2;
  /** True when a jumping player sails over it. */
  jumpable: boolean;
};

/** A fixed story prop (a lander, a flag, …) placed by the level def. */
export type Landmark = {
  kind: string;
  /** Sprite name the renderer blits — resolved from the level def. */
  sprite: string;
  /**
   * Where the sprite meets its pos: `base` pins the sprite's foot to `pos`
   * (a standing prop like a flag or mast), `center` centers it. Data, so the
   * renderer never special-cases a particular prop kind.
   */
  anchor: "base" | "center";
  pos: Vec2;
};

/**
 * How the renderer paints a level's ground. Data on the level def, so a new
 * biome is a new entry — no renderer edit. `ground.rare` scatters into
 * `ground.common` every `rareEvery`-th cell; an optional `patch` clusters a
 * second pair on a coarse grid for gravel/vent-style clumps.
 */
export type TileSpec = {
  ground: { common: string; rare: string; rareEvery: number };
  patch?: { a: string; b: string; every: number };
  /**
   * Regional overrides: inside `rect` (world px) the zone's own ground/patch
   * pair replaces the level-wide one — how a single level shifts terrain, e.g.
   * martian dust outside giving way to deck plating inside the base. Zones are
   * checked in order; the first rect containing the tile wins. Purely
   * presentational (the renderer picks tiles from it) — collision never reads
   * tiles.
   */
  zones?: {
    rect: { x: number; y: number; width: number; height: number };
    ground: { common: string; rare: string; rareEvery: number };
    patch?: { a: string; b: string; every: number };
  }[];
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
 * delivering its scene, a unique mob gasping its last words as it dies, or a
 * picked-up story item revealing its lore. The pages live on the def
 * (EnemyDef.dialogue / EnemyDef.lastWords / StoryItemDef.lore); this tracks
 * only who speaks and how far the player has tapped. `enemyDeath` carries no
 * `enemyId` — the speaker is already off the board.
 */
export type DialogueState = {
  source:
    | { kind: "enemy"; enemyId: number; defId: string }
    | { kind: "enemyDeath"; defId: string }
    | { kind: "story"; defId: string }
    /**
     * The hero's own inner monologue — a story beat pinned to an event (the
     * first kill of a given enemy on a level), not to a speaker on the board.
     * `defId` keys THOUGHT_DEFS.
     */
    | { kind: "playerThought"; defId: string };
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
  /**
   * A projectile weapon fired. `pos` is the muzzle (the shooter), `dir` the
   * unit aim — the app draws a firing flash (ranged) or a cast burst (magic)
   * oriented along it.
   */
  | { type: "shot"; weaponClass: WeaponClass; pos: Vec2; dir: Vec2 }
  /**
   * A melee weapon swung. `pos` is the swinger, `dir` the unit aim, `range`
   * the effective reach, `arc` the full cone angle (radians) that the swing
   * strikes — the app sweeps a slash across that cone at that radius (a wide
   * arc for a blade, a narrow thrust for a spear).
   */
  | { type: "swing"; pos: Vec2; dir: Vec2; range: number; arc: number }
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
  /** The player sidestepped a blow entirely (see `playerDodgeChance`). `pos`
   * is the hero — the app floats a "DODGE" tag and pips a light whiff. */
  | { type: "playerDodge"; pos: Vec2 }
  | {
      type: "itemCollected";
      kind: Item["kind"];
      tier?: Tier;
      /** Human-readable label for the "picked up X" pickup feed. */
      name?: string;
    }
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
  /**
   * The menace meter crossed into a new evolution stage — the horde has grown
   * more dangerous in answer to the player's rampage. The app sounds the
   * escalation and can flash a "the horde evolves" cue.
   */
  | { type: "menaceRose"; stage: number }
  | { type: "bossDefeated"; pos: Vec2 }
  /**
   * A fleeing unique (see `EnemyDef.flees`) was beaten down to 0 hp and
   * escaped instead of dying — off the board, loot paid, and a landmark (the
   * rift it tore open) left at `pos`. Distinct from `bossDefeated` so the app
   * can play the escape as a warp, not a death.
   */
  | { type: "bossFled"; pos: Vec2; defId: string }
  /** A speaker took the stage: the run paused into the `dialogue` phase. */
  | { type: "dialogueStarted"; speaker: string }
  /**
   * A unique mob (elite/boss) died and its parting line took the stage — the
   * run paused into the `dialogue` phase on a `enemyDeath` source. Distinct
   * from `dialogueStarted` so the app can give the death its own somber cue
   * instead of the arrival knock.
   */
  | { type: "enemyLastWords"; defId: string }
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
  /**
   * Walk throttle in [0, 1]: how hard the player is pushing the dpad (or how
   * far the cursor sits from the character). 1 = full speed; smaller values
   * ease the character into a gentle walk when the finger barely leaves the
   * dpad center. Absent (headless tests, bots) defaults to full speed.
   */
  throttle?: number;
  /** True on the step a jump was requested (tap / space edge, not hold). */
  jump: boolean;
  /**
   * True on the step the player asked to use a carried ability pickup
   * (mouse click / HUD button edge). Spends one held ability; a no-op with
   * empty hands. `useItemIndex` chooses which one.
   */
  useItem?: boolean;
  /**
   * When `useItem` is set, which banked ability to spend (index into
   * `heldAbilities`, oldest first). Tapping a powerup dock slot names its
   * index; click / E / auto-use omit it and spend the oldest (index 0). An
   * out-of-range index falls back to the oldest too.
   */
  useItemIndex?: number;
  /**
   * The world rect currently on screen (the camera view). When set, the
   * auto-weapon only targets monsters inside it — the character never
   * shoots at enemies the player cannot see yet. Absent (headless tests,
   * bots) targeting falls back to weapon range alone.
   */
  view?: { x: number; y: number; width: number; height: number };
};

/**
 * The hero's carry-over between levels: the snapshot `extractLoadout` takes
 * from a finished run — level, stats, worn equipment, bag, pocketed
 * powerups — and `createGame` dresses the next run in via `applyLoadout`.
 * The app banks one per cleared level (per difficulty); dev jumps with
 * nothing banked use `deriveArrivalLoadout`'s stand-in instead. Plain JSON
 * data so it persists in storage as-is.
 */
export type Loadout = {
  level: number;
  /** Progress into the current level (clamped below its threshold on apply). */
  xp: number;
  stats: Record<StatName, number>;
  equipment: {
    weapon: Equipment;
    suit: Equipment | null;
    charm: Equipment | null;
  };
  inventory: (Equipment | null)[];
  /** Banked ability pickups (ABILITY_DEFS ids). */
  heldAbilities: string[];
};

/** Static facts about the running level, snapshotted from its LevelDef. */
export type LevelInfo = {
  /** Key into LEVELS. */
  id: string;
  /** Story order (1-based). */
  index: number;
  name: string;
  width: number;
  height: number;
  /** Downward acceleration in world px/s² — lower gravity floats jumps. */
  gravity: number;
  /** Tileset/mood key for the renderer. */
  biome: string;
  /** How the renderer paints the ground for this level. */
  tiles: TileSpec;
  /** What the HUD calls this level's hostiles. */
  foes: string;
};

export type GameState = {
  phase: GamePhase;
  /**
   * The running prelude scene while `phase === "cutscene"` (see
   * @game/lib/cutscene and defs/cutscenes.ts); null once it played out.
   */
  cutscene: CutsceneState | null;
  /**
   * Which page of the level's opening monologue is on screen while
   * `phase === "intro"` — the hero's black-screen briefing dialogue. Turning
   * past the last page drops into the `title` card; unused in other phases.
   */
  introPage: number;
  level: LevelInfo;
  /** The run's chosen difficulty (scales spawns, hp, and loot). */
  difficulty: Difficulty;
  /**
   * The escalation meter (see config MENACE). Heated by the player's rolling
   * combat output (`combatDps` / `combatKillRate`) and jolted by overpowered
   * kills; idling bleeds it off. Read as a stage that lures, evolves, and
   * scales the horde. Starts at 0.
   */
  menace: number;
  /**
   * Rolling estimate of the player's damage-per-second, an EMA smoothed over
   * MENACE.rateWindowSec and updated each step from that step's damage. The
   * main fuel the menace meter reads: sustained high DPS heats it. Starts at 0.
   */
  combatDps: number;
  /**
   * Rolling estimate of the player's kills-per-second, an EMA smoothed over
   * MENACE.rateWindowSec and updated each step from that step's kills. Heats
   * the menace meter alongside `combatDps` — a fast clear rate escalates on top
   * of raw damage output. Starts at 0.
   */
  combatKillRate: number;
  /** Where the run begins; also the origin difficulty scales out from. */
  playerSpawn: Vec2;
  /** Story props to draw (the lander, the boss's flag, …). */
  landmarks: Landmark[];
  /** The running conversation while `phase === "dialogue"`; null otherwise. */
  dialogue: DialogueState | null;
  /** Collected story items (STORY_ITEM_DEFS ids) — keys, dossiers, the lot. */
  storyItems: string[];
  /**
   * THOUGHT_DEFS ids the hero has already thought through — each first-kill
   * inner monologue plays exactly once per run.
   */
  thoughtsSeen: string[];
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
   * Resolved kill thresholds for the level's `loot.earlyDrops` schedule,
   * parallel to it: a rolled `[min, max]` entry gets a concrete count here at
   * creation, a fixed entry keeps its number. Empty when the level has no
   * schedule.
   */
  earlyDropKills: number[];
  /**
   * Cursor into the `loot.earlyDrops` schedule: the index of the next unfired
   * entry (entries are authored in ascending kill order). Advances as each
   * scripted opening drop is handed over; equals the schedule length once they
   * have all dropped.
   */
  earlyDropCursor: number;
  stats: GameStats;
  /** Events emitted by the most recent `step()`. */
  events: GameEvent[];
  /** Monotonic id source for spawned entities. */
  nextId: number;
  /** Seeded stream for in-run rolls (crits, drops) — keeps runs replayable. */
  rng: Rng;
};
