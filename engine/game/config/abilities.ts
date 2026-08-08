// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Conjured powers: ability power scaling, and the granted spells & procs
// items carry.

/**
 * ABILITY POWER SCALING (see `abilityPowerScale` in abilities.ts). The
 * catalog numbers in defs/abilities.ts are authored AT LEVEL 1; without
 * scaling they decayed into noise against a horde whose healthbars grow by
 * `MENACE.mobHpPerLevel × autoPowerScale` every level. The scale is exactly
 * that minion-bar formula — so a FIRE ORB keeps meaning "the same fraction
 * of a level-appropriate healthbar" all campaign — times an INTELLIGENCE
 * term: conjured powers are magic, and INT is what deepens them.
 */
export const ABILITY = {
  /** Extra ability damage per point of effective INTELLIGENCE (+5% each). */
  intDamagePerPoint: 0.05,
  /** Extra STASIS FIELD radius per point of effective INT (world px) —
   * mirrors the magnet's `radiusPerInt`; the slow factor itself never
   * scales (a stronger slow would trivialize kiting). */
  stasisRadiusPerInt: 1.5,
} as const;

/**
 * GRANTED SPELLS & PROCS — the forever powers items carry (the `spell` /
 * `proc` affix kinds, unique/legendary authoring territory). Every damage
 * number here is authored AT LEVEL 1 and rides the SAME `abilityPowerScale`
 * the pickup powers do (level ramp × INT deepening), so a granted spell
 * keeps meaning the same fraction of a level-appropriate healthbar all
 * campaign. Each spell scales linearly with its RANK (worn sources of the
 * same spell add their ranks), and INTELLIGENCE additionally SHORTENS the
 * tick/strike intervals (`intervalPerInt`) — the "improvable by INT" half
 * the timed pickups don't get. A granted spell is deliberately weaker than
 * its pickup twin at rank 1: it never runs out.
 */
export const SPELL = {
  /** Circling flame — the forever FIRE ORBS. Rank adds orbs and per-tick
   * damage; the ring turns at the pickup's pace. */
  orbit: {
    /** Orbs on the ring at rank 1 / added per further rank. */
    count: 1,
    countPerRank: 1,
    /** Damage per tick per orb at rank 1 / added per further rank. */
    damage: 8,
    damagePerRank: 3,
    radius: 36,
    angularSpeed: 2.8,
    hitCooldownMs: 200,
    orbRadius: 8,
    sprite: "fireball",
  },
  /** The forever STORM CELL: a bolt into the nearest foe on an interval.
   * Rank raises the damage and quickens the strikes. */
  storm: {
    intervalMs: 2400,
    /** Each rank past 1 multiplies the interval by this (rank 3 ≈ ×0.72). */
    intervalPerRankMult: 0.85,
    damage: 18,
    damagePerRank: 7,
    range: 200,
  },
  /** The forever STASIS FIELD: foes inside crawl. Rank widens the field and
   * deepens the slow (floored — kiting must stay a skill). INT still widens
   * it further via `ABILITY.stasisRadiusPerInt`, like the pickup. */
  stasis: {
    radius: 46,
    radiusPerRank: 16,
    /** Enemy speed multiplier inside the field at rank 1 (higher = gentler
     * than the pickup's 0.3 — this one never expires). */
    slowFactor: 0.8,
    slowFactorPerRank: -0.07,
    slowFactorMin: 0.5,
  },
  /** SEEKER ORBS (magic-tree talent): homing arcane orbs spawn on an interval
   * and BURST on impact. Rank raises the bite and the blast, adds orbs, and
   * quickens the cadence; INT quickens it further (`intervalPerInt`). Each orb
   * homes onto the nearest foe and detonates for its full damage in `burst`. */
  seeker: {
    intervalMs: 1600,
    /** Each rank past 1 multiplies the spawn interval by this. */
    intervalPerRankMult: 0.9,
    damage: 14,
    damagePerRank: 6,
    /** Blast radius at rank 1 / added per further rank. */
    burstRadius: 26,
    burstRadiusPerRank: 4,
    /** Orb flight speed (px/s). Orbs per spawn grow with rank in
     * `seekerSpellParams` (`ceil(rank/2)`: 1 at R1–2, 2 at R3–4, 3 at R5). */
    speed: 150,
    /** Homing turn rate (rad/s). */
    homing: 4,
    radius: 5,
    lifetimeMs: 2600,
    range: 240,
    sprite: "spark",
  },
  /** ARCANE SINGULARITY (magic-tree talent): a vortex collapses on the nearest
   * foe every interval, DRAGGING the cluster into its core and crushing it.
   * Rank deepens the crush, widens the reach and the pull, and quickens the
   * cadence; INT quickens it further (`intervalPerInt`). */
  singularity: {
    intervalMs: 3200,
    intervalPerRankMult: 0.9,
    damage: 12,
    damagePerRank: 6,
    /** Pull + damage reach at rank 1 / added per further rank. */
    radius: 68,
    radiusPerRank: 8,
    /** How far foes are yanked toward the core per collapse / added per rank. */
    pull: 40,
    pullPerRank: 8,
    /** How far from the hero a seed foe may stand for a vortex to form. */
    range: 220,
  },
  /** IMMOLATION AURA (magic-tree talent): a burning ring around the hero
   * scorches everything inside it on a fast tick. Rank widens the ring and
   * deepens the burn; INT quickens the tick (`intervalPerInt`). The magic
   * tree's stand-in-the-horde core. */
  immolation: {
    radius: 40,
    radiusPerRank: 8,
    /** Damage per tick at rank 1 / added per further rank. */
    damage: 5,
    damagePerRank: 3,
    tickMs: 500,
  },
  /** The BOLT proc: lightning into the struck/killed enemy (or the nearest
   * foe to the trigger, if it fell). Rank sizes the hit. */
  bolt: {
    damage: 26,
    damagePerRank: 10,
    /** How far from the trigger point a replacement victim may stand. */
    range: 120,
  },
  /** The NOVA proc: a damage ring bursting around the trigger point. */
  nova: {
    radius: 56,
    radiusPerRank: 8,
    damage: 22,
    damagePerRank: 8,
  },
  /**
   * INT's interval lever on GRANTED spells: each point of effective
   * INTELLIGENCE trims orbit tick cooldowns and storm intervals by this
   * fraction, floored at `intervalFloor` of the authored value — a
   * scholar's forever spells genuinely fire faster.
   */
  intervalPerInt: 0.006,
  intervalFloor: 0.5,
} as const;
