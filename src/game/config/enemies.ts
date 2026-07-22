// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Enemy behavior shared by every kind: the chase/flank/work/patrol AI,
// ranged shooters, apparitions, wound sprites, and the boss last stand.

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
   * shoulder, 0.5 = bodies squeeze halfway into each other). Loose packing is
   * a deliberate design choice: a kited horde bunches into one tight clump the
   * player can lure together and finish off with a high-INT AoE weapon —
   * overlapping bodies are the whole point, not a defect. The single knob to
   * turn if packs feel too loose or too tight.
   */
  overlapFraction: 0.5,
  /**
   * A minion counts toward the wave floor (waves.minAlive) only within this
   * distance of the player — parked spawns on the far side of the map must
   * not satisfy "there's a pack on screen".
   */
  nearRadius: 340,
  /**
   * SMARTER MOBS up the ladder — FLANKING: from this difficulty INDEX
   * (hard = 3) a chasing minion steers toward a point rotated off the direct
   * player bearing, each mob to its own deterministic side, so the pack
   * ENVELOPS instead of forming a straight-line conga the hero mows down a
   * rank at a time. The rotation eases out as the mob closes (it converges
   * on the player for the bite) — see `flankTarget` in step.ts.
   */
  flankFromIndex: 3,
  /** The flank rotation at full distance (degrees off the direct bearing). */
  flankAngleDeg: 35,
  /**
   * The DORMANT "AT WORK" stroll (`EnemyDef.ai.idle === "work"` — see
   * working.ts): instead of standing frozen at its post, an unaggroed mob
   * potters around its `home` — walk a short leg, stand a beat, walk again —
   * so a staffed venue (the SpaceZ night shift) reads as people working the
   * floor, not statues waiting for a fight. Purely a dormant behavior: waking
   * (aggro + line of sight, wounds) is untouched, and a woken mob fights
   * exactly as before.
   */
  work: {
    /** Fraction of the mob's speed while strolling — a shuffle, not a chase. */
    speedFactor: 0.35,
    /** Stroll-leg reach [min, max] (world px out from `home`). */
    range: [12, 48] as [number, number],
    /** Pause between legs [min, max] (ms) — standing at the bench, "working". */
    idleMs: [1200, 4200] as [number, number],
    /** Leg time-budget slack: a leg wedged on furniture times out and
     * re-rolls after `distance / strollSpeed × this`. */
    legSlackMult: 1.6,
  },
  /**
   * PATROL ROUTES (a pinned spawn's `patrol` waypoints — see working.ts): a
   * dormant mob WALKS its authored route back and forth, WoW-style, instead
   * of standing at (or pottering around) a post — the roaming OPTIMUSK unit
   * sweeping a build bay, the manager walking his floor. Purely a dormant
   * behavior: aggro/LOS waking is untouched, and a broken chase resumes the
   * route.
   */
  patrol: {
    /** Fraction of the mob's speed on the route — a deliberate walk, slower
     * than its hunt but brisker than the work shuffle. */
    speedFactor: 0.55,
    /** Waypoint arrival slop (world px). */
    reach: 3,
    /** No net progress toward the waypoint for this long → wedged on
     * scattered furniture: skip to the next waypoint and walk on. */
    stuckMs: 2500,
  },
} as const;

/**
 * Ranged enemies (`EnemyDef.ranged`) — shooters that fire hostile projectiles
 * at the player and, with `takesCover`, play hide-and-peek behind the level's
 * solid obstacles between shots (the per-enemy numbers — damage, cooldown,
 * range, projectile — live on the def; this is the shared choreography).
 * Units: world px, ms, fractions.
 */
export const ENEMY_RANGED = {
  /**
   * The share of its firing range a shooter tries to hold from the player:
   * closer than this it backs away (a gunslinger keeps its distance), further
   * it advances until the player is in range and sight.
   */
  holdRangeFraction: 0.7,
  /**
   * With this much (or less) of the reload left, a covering shooter steps
   * back out of hiding to line up the next shot — the "peek" of the
   * hide-and-peek dance. Longer = more brazen, shorter = more cowardly.
   */
  peekWindowMs: 700,
  /**
   * How far around itself a covering shooter looks for a solid (non-jumpable)
   * obstacle to hide behind. Nothing in reach = it just backs off to its hold
   * range instead.
   */
  coverSearchRadius: 260,
  /** Gap kept between the shooter's edge and its cover rock's edge. */
  coverGap: 4,
  /**
   * SMARTER MOBS up the ladder — TARGET LEADING: from `leadFromIndex`
   * (hard = 3) shooters aim ahead of a RUNNING hero by `leadFactor` of the
   * full firing solution (`player.vel × time-of-flight`), and from
   * `leadFullFromIndex` (nightmare = 4) by the whole thing — a standing hero
   * is aimed at dead-on either way. Below the gate shots fly at where the
   * hero WAS: the strafe-to-dodge freebie the gentle rungs keep.
   */
  leadFromIndex: 3,
  leadFullFromIndex: 4,
  leadFactor: 0.5,
} as const;

/**
 * Apparitions — dialogue-only figures (EnemyDef.apparition). One seeks the
 * player out for its scene like any elite speaker, but nothing in the world
 * touches it (weapons, abilities, hazards) and its own touch is cold air.
 * Once its scene has played it walks off and dissolves.
 */
export const APPARITION = {
  /**
   * Ms between the scene ending and the figure leaving the board (the
   * renderer reads the enemy's `vanishMs` against this for the fade-out).
   */
  lingerMs: 2600,
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
