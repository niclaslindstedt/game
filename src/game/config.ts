// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// GLOBAL gameplay tuning — the rules that hold across every level. Per-level
// content (geometry, gravity, spawns, loot pools) lives in defs/levels.ts;
// the enemy and equipment catalogs live in defs/enemies.ts and
// defs/equipment.ts. Units: world pixels (one sprite pixel = one world unit
// at scale 1), milliseconds, hit points.

export const PLAYER = {
  /** Base max hp before HEALTH stat points and equipment bonuses. */
  maxHp: 100,
  /** World units per second while the pointer is held. */
  speed: 170,
  /** Collision radius. */
  radius: 10,
  /** Steering closer than this to the pointer target stops jitter. */
  arriveRadius: 4,
} as const;

/**
 * Jumping. Tap (screen) or space to hop. Takeoff speed is the player's —
 * gravity belongs to the LEVEL (the moon's ~1/6 g carries the same takeoff
 * six times higher than earth's will).
 */
export const JUMP = {
  /** Upward takeoff speed in world px/s. */
  velocity: 240,
  /** While `z` is above this, ghosts drift beneath the player: no contact. */
  dodgeHeight: 12,
} as const;

/** Enemy behavior shared by every kind (per-kind numbers sit in their def). */
export const ENEMY_AI = {
  /** Per-enemy speed jitter so a pack spreads out (fraction of speed). */
  speedJitter: 0.25,
  /** Enemies spawn at least this far from the player. */
  minSpawnDistance: 240,
  /** Pairwise push-apart distance so packs don't stack into one blob. */
  separation: 16,
} as const;

/** XP and level-ups. Each level-up grants stat points to spend. */
export const LEVELING = {
  /** Default XP granted per point of a killed monster's max hp. */
  xpPerHp: 1,
  /** XP needed to go from level 1 to 2; each next level costs ×growth. */
  baseXpToLevel: 60,
  xpGrowth: 1.5,
  statPointsPerLevel: 1,
} as const;

/**
 * Stat effects. STRENGTH scales melee weapons, DEXTERITY ranged,
 * INTELLIGENCE magic (wands); LUCK finds better items, lands crits, and
 * shrugs off enemies' critical hits; HEALTH is raw max hp.
 */
export const STATS = {
  /** Max hp per HEALTH point (current hp rises along with it). */
  healthPerPoint: 20,
  /** Damage multiplier per point of the weapon's governing stat. */
  damageBonusPerPoint: 0.12,
  /** Player base crit chance before LUCK and equipment. */
  baseCritChance: 0.05,
  critChancePerLuck: 0.04,
  /** Reduction of enemy crit chance per LUCK point (floored at 0). */
  critAvoidPerLuck: 0.02,
  /** Extra drop chance per LUCK point. */
  dropChancePerLuck: 0.03,
  /** Extra chance per LUCK point that a drop upgrades its tier roll. */
  tierChancePerLuck: 0.04,
  critMultiplier: 2,
} as const;

/** Loot rules that hold on every level (pools and tier odds are per level). */
export const LOOT = {
  /** Base chance a regular monster drops anything (LUCK adds to it). */
  dropChance: 0.1,
  /** Of those drops, the share that is equipment (the rest are medkits). */
  equipmentShare: 0.45,
  inventorySize: 12,
} as const;

/** The medkit consumable: picked up on touch, never enters the inventory. */
export const MEDKIT = {
  heal: 35,
  radius: 8,
} as const;

/** Run flow. */
export const RUN = {
  /** Grace period between clearing the objective and the victory splash —
   * time enough to scoop up what the boss dropped. */
  victoryDelayMs: 5000,
} as const;
