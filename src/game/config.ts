// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Gameplay tuning for the first playable level. Everything the simulation
// balances on lives here so playtesting tweaks touch a single file. Units:
// world pixels (one sprite pixel = one world unit at scale 1), milliseconds,
// hit points.

export const LEVEL = {
  /** Finite level size in world units. */
  width: 960,
  height: 640,
} as const;

export const PLAYER = {
  maxHp: 100,
  /** World units per second while the pointer is held. */
  speed: 170,
  /** Collision radius. */
  radius: 10,
  /** Steering closer than this to the pointer target stops jitter. */
  arriveRadius: 4,
} as const;

/** The one enemy type: a slime that chases the player and hurts on touch. */
export const ENEMY = {
  count: 8,
  hp: 30,
  speed: 55,
  /** Per-enemy speed jitter so the pack spreads out (fraction of speed). */
  speedJitter: 0.25,
  radius: 9,
  contactDamage: 10,
  /** Minimum ms between contact hits from the same enemy. */
  contactCooldownMs: 700,
  /** Enemies spawn at least this far from the player. */
  minSpawnDistance: 220,
  /** Pairwise push-apart distance so the pack doesn't stack into one blob. */
  separation: 16,
} as const;

/** The one weapon: an auto-firing blaster targeting the nearest enemy. */
export const WEAPON = {
  cooldownMs: 380,
  range: 260,
  damage: 10,
  projectileSpeed: 420,
  projectileRadius: 3,
  /** Projectiles despawn after this long even if they hit nothing. */
  projectileLifetimeMs: 900,
} as const;

/** The one item type: a medkit restoring part of the player's health. */
export const MEDKIT = {
  count: 3,
  heal: 35,
  radius: 8,
} as const;
