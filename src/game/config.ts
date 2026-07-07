// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// GLOBAL gameplay tuning — the rules that hold across every level. Per-level
// content (geometry, gravity, spawns, loot pools) lives in defs/levels.ts;
// the enemy and equipment catalogs live in defs/enemies.ts and
// defs/equipment.ts. Units: world pixels (one sprite pixel = one world unit
// at scale 1), milliseconds, hit points.

export const PLAYER = {
  /** Base max hp before HEALTH stat points and equipment bonuses. */
  maxHp: 100,
  /**
   * Base world units per second while the pointer is held (SPEED adds). Kept
   * deliberately low to keep the horde tense — the crowd is a tide to route
   * around, not a footrace the player wins by holding one direction.
   */
  speed: 56,
  /** Collision radius. */
  radius: 10,
  /** Steering closer than this to the pointer target stops jitter. */
  arriveRadius: 4,
  /**
   * The sprite only mirrors when the horizontal share of the move direction
   * exceeds this — near-vertical steering keeps the last facing instead of
   * flip-flickering every step.
   */
  faceFlipMinX: 0.2,
} as const;

/** Projectile rules shared by every weapon (per-weapon numbers in defs). */
export const PROJECTILE = {
  /**
   * Shots fired mid-jump leave from the player's height and sink back to
   * ground level at this rate (world px/s) — purely visual; collisions stay
   * in the ground plane.
   */
  zFallSpeed: 90,
} as const;

/**
 * Jumping. Tap (screen) or space to hop. Takeoff speed is the player's —
 * gravity belongs to the LEVEL, so the same takeoff floats higher under low
 * gravity and snaps back fast under high gravity.
 */
export const JUMP = {
  /** Upward takeoff speed in world px/s. */
  velocity: 240,
  /** While `z` is above this, grounded enemies pass beneath the player: no
   * contact. */
  dodgeHeight: 12,
} as const;

/** Enemy behavior shared by every kind (per-kind numbers sit in their def). */
export const ENEMY_AI = {
  /** Per-enemy speed jitter so a pack spreads out (fraction of speed). */
  speedJitter: 0.25,
  /**
   * Enemies spawn at least this far from the player — just past the
   * phone-landscape screen edge (world half-view ≈ 211×97, see AGENTS.md),
   * so the slow horde is visible arriving within seconds instead of
   * trickling in from far off-screen.
   */
  minSpawnDistance: 150,
  /**
   * Wave spawns land in a ring [minSpawnDistance, minSpawnDistance + width]
   * around the player — just past the screen edge, never on top of them.
   * Keep ring max below the minions' aggro radii so the horde converges
   * the moment it spawns.
   */
  spawnRingWidth: 80,
  /** Pairwise push-apart distance so packs don't stack into one blob. */
  separation: 16,
  /**
   * Fraction of the separation distance mobs may overlap (0 = shoulder to
   * shoulder, 0.2 = bodies squeeze 20% into each other). Looser packing
   * lets a kited horde bunch into one clump the player can finish off
   * together — the single knob to turn if packs feel too loose or too tight.
   */
  overlapFraction: 0.2,
  /**
   * A minion counts toward the wave floor (waves.minAlive) only within this
   * distance of the player — parked spawns on the far side of the map must
   * not satisfy "there's a pack on screen".
   */
  nearRadius: 340,
} as const;

/** XP and level-ups. Each level-up grants stat points to spend. */
export const LEVELING = {
  /** Default XP granted per point of a killed monster's max hp. */
  xpPerHp: 1,
  /** XP needed to go from level 1 to 2; each next level costs ×growth. */
  baseXpToLevel: 100,
  xpGrowth: 1.65,
  statPointsPerLevel: 1,
  /**
   * XP granted by a golden arrow pickup, as a fraction of the CURRENT
   * xpToNext — a share of a level, not a flat sum, so arrows stay worth
   * chasing at level 20 exactly as much as at level 2.
   */
  arrowXpShare: 0.25,
} as const;

/**
 * Stat effects. STRENGTH scales melee weapons, DEXTERITY ranged,
 * INTELLIGENCE magic (wands); SPEED quickens the walk; LUCK finds better
 * items, lands crits, and shrugs off enemies' critical hits; HEALTH is raw
 * max hp.
 */
export const STATS = {
  /** Max hp per HEALTH point (current hp rises along with it). */
  healthPerPoint: 20,
  /** Move-speed multiplier added per SPEED point (+8% each). */
  speedPerPoint: 0.08,
  /** Damage multiplier per point of the weapon's governing stat. */
  damageBonusPerPoint: 0.12,
  /**
   * STRENGTH's melee-only perks beyond raw damage. `meleeRangePerStr` widens
   * a melee weapon's reach by this fraction of its base range per point
   * (+2.5% each), so a strong bruiser keeps the crowd a little further back.
   * `meleeSpeedPerStr` quickens the swing: each point shortens the cooldown
   * as `cooldown / (1 + str * meleeSpeedPerStr)` (+4% cadence each). Ranged
   * and magic weapons ignore both — DEX/INT only ever touch their damage.
   */
  meleeRangePerStr: 0.025,
  meleeSpeedPerStr: 0.04,
  /** Player base crit chance before LUCK and equipment. */
  baseCritChance: 0.05,
  critChancePerLuck: 0.04,
  /** Reduction of enemy crit chance per LUCK point (floored at 0). */
  critAvoidPerLuck: 0.02,
  /** Extra drop chance per LUCK point. */
  dropChancePerLuck: 0.01,
  /** Extra chance per LUCK point that a drop upgrades its tier roll. */
  tierChancePerLuck: 0.04,
  critMultiplier: 2,
} as const;

/** Loot rules that hold on every level (pools and tier odds are per level). */
export const LOOT = {
  /**
   * Base chance a regular monster drops anything (LUCK adds to it). Tuned
   * for horde scale: hundreds of kills per run, a drop every ~8 of them —
   * the steady rain of upgrades is what keeps the player ahead of the ramp.
   */
  dropChance: 0.12,
  /**
   * The share of drops that is a screen-nuke pickup — checked first, before
   * the ladder below, so it stays rare no matter how the rest is tuned.
   */
  nukeShare: 0.012,
  /** Of the remaining drops, the share that is equipment. */
  equipmentShare: 0.25,
  /** …the share that is a time-limited ability pickup… */
  abilityShare: 0.13,
  /** …the share that is a golden XP arrow… */
  xpArrowShare: 0.22,
  /** …the share that is a weapon repair kit (the rest are medkits). */
  repairShare: 0.1,
  /**
   * Clearing every regular monster on a level is guaranteed to have dropped
   * at least this much equipment (a pity roll forces the tail end; boss
   * drops come on top of it).
   */
  minEquipmentPerLevel: 2,
  /** Tier-chance bonus on the trophy the last regular monster surrenders. */
  allClearTierBonus: 0.35,
  inventorySize: 12,
} as const;

/**
 * Solid obstacles. Levels scatter them at creation (see LevelDef.obstacles);
 * nothing walks through one, and only jumpable ones can be cleared mid-air.
 */
export const OBSTACLES = {
  /** A jumpable obstacle is cleared while the player's z exceeds this. */
  clearHeight: 14,
  /** Keep obstacles at least this far from the player spawn (world px). */
  spawnClearance: 140,
  /** Minimum gap between two obstacles' edges, so lanes always exist. */
  spacing: 28,
} as const;

/**
 * In-world dialogue (elite ambushes, boss confrontations, story-item lore).
 * Speakers hold their scene until the player has tapped through every page;
 * the world freezes in the `dialogue` phase meanwhile.
 */
export const DIALOGUE = {
  /**
   * An awake speaker opens its scene once within this distance of the
   * player (world px) — inside the phone-landscape half-view (≈211×97), so
   * the speaker is visibly on screen when the world stops.
   */
  speakRadius: 96,
} as const;

/** Locked doors (LevelDef.doors), opened by story-item keys. */
export const DOORS = {
  /** Carrying the key within this distance of the door slides it open. */
  openRadius: 40,
} as const;

/** The medkit consumable: picked up on touch, never enters the inventory. */
export const MEDKIT = {
  heal: 35,
  radius: 8,
} as const;

/**
 * Ability pickups are carried, not auto-used: touching one banks it, and the
 * `useItem` input (mouse click / the HUD button) spends the
 * oldest banked one. Timing the storm for the flood is the player's call.
 */
export const HELD_ITEMS = {
  /** How many ability pickups the player can carry; extras stay grounded. */
  cap: 3,
} as const;

/**
 * Visible battle damage. Enemy sprites swap to wounded variants as hp falls:
 * every mob shows its "hurt" look at half hp, elites and bosses a heavier
 * "wrecked" look below a quarter. Purely presentational — the renderer picks
 * the sprite — but the thresholds live here so the app and any future engine
 * rule read the same numbers.
 */
export const WOUNDS = {
  /** At or below this hp fraction every mob wears its hurt sprite. */
  hurtAt: 0.5,
  /** At or below this, elites and bosses wear the wrecked sprite. */
  wreckedAt: 0.25,
} as const;

/**
 * The boss's last stand: at or below this hp fraction a boss fights like a
 * cornered animal — contact hits multiply, and the renderer swaps in the
 * "dying" sprite with a warning flicker so the spike is readable.
 */
export const LAST_STAND = {
  /** Hp fraction at or below which the last stand kicks in. */
  hpFraction: 0.1,
  /** Contact-damage multiplier while the last stand runs. */
  damageMultiplier: 1.5,
} as const;

/** Run flow. */
export const RUN = {
  /** Grace period between clearing the objective and the victory splash —
   * time enough to scoop up what the boss dropped. */
  victoryDelayMs: 5000,
} as const;
