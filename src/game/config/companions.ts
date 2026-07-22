// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The recruited party: formation, engagement, leveling, and revives.

/**
 * COMPANIONS — the recruited party (see companions.ts). A spareable unique
 * (`EnemyDef.spareable`) beaten to 0 hp offers the SPARE-or-KILL choice;
 * spared, it joins the hero as a companion: follows him, fights with its own
 * equipped weapon, wears a helmet and chest piece (never legs or feet), and
 * rides the loadout to the next level. Companions are beaten DOWN, never
 * killed — at 0 hp one kneels out of the fight and recovers on its own.
 */
export const COMPANIONS = {
  /** How far behind the hero the formation point sits (world px). */
  followDistance: 34,
  /** Sideways gap between companions in the follow formation (world px). */
  spacing: 24,
  /** Companions only engage foes within this distance of the HERO (world
   * px) — the party fights around him, it never runs off to clear the map. */
  engageRadius: 230,
  /** Beyond this distance from the hero a companion abandons its target and
   * regroups (world px). */
  leashRadius: 320,
  /** Left further behind than this (world px, off-screen at phone zoom), a
   * companion slips through the noise and rejoins the formation outright —
   * a party member, never an escort quest. */
  catchUpDistance: 420,
  /**
   * Screen-edge FOLLOW latch: while the hero is on the move, a companion that
   * drifts within this many world px of the camera's edge (or past it) stops
   * fighting and commits to moving WITH him — the party keeps up with a hero
   * ranging across the map rather than planting to trade shots and sliding
   * off the screen. The latch releases when the hero stops moving (see
   * `stepCompanion`). Only applied when the app hands the engine a `view`
   * (headless/bot runs, with no camera, keep the plain formation behaviour).
   */
  screenEdgeMargin: 32,
  /** A companion holds at this share of its weapon's range, like the bots. */
  holdFraction: 0.75,
  /** How many foes a companion's melee swing may cleave at once. */
  meleeTargets: 2,
  /**
   * Global scale on a companion's weapon damage — the party fights at the
   * looted-weapon damper (WEAPON.damageMult's sibling) so a recruited elite
   * supports the hero instead of clearing the field for him.
   */
  damageMult: 0.5,
  /** Companion damage grows with its OWN level (it trains by fighting — see
   * `companion-stats.ts`), NOT the hero's. */
  damagePerLevel: 0.04,
  /** Companion max hp grows with its OWN level, same rationale. */
  hpPerLevel: 0.1,
  /**
   * COMPANION LEVELING (see `companion-stats.ts`). A companion earns its OWN
   * levels from its OWN kills, decoupled from the hero: it starts trained to
   * the hero's level when recruited and climbs from there, forever (the level
   * rides the loadout, so it persists across every level AND difficulty). The
   * curve is authored in KILLS, like the hero's (`xpToLevelUp`): a level costs
   * `levelKills` of a reference-mob's worth of XP, growing gently per level, so
   * a companion levels a handful of times a map early and slows as it climbs.
   * The kill reward is the same figure the hero earns (`enemyKillXp`), so an
   * elite finish lurches a companion's bar the way it does the hero's.
   */
  levelKills: 14,
  /** Geometric growth of the per-level kill cost (mirrors the hero's gentle
   * `killsPerLevelGrowth`). */
  levelKillsGrowth: 1.04,
  /** A companion levels up to here and no further — set high enough to read as
   * "indefinite" without risking an unbounded loop on a colossal XP grant. */
  maxLevel: 999,
  /** Ms a downed companion kneels before getting back up on its own — but only
   * counted down while OUT of combat (see `downedCombatRadius`). */
  reviveMs: 12_000,
  /**
   * A downed companion's revive count only ticks while the field around IT is
   * clear: a live foe within this many world px freezes the count, so a
   * companion beaten down in the middle of a swarm STAYS down until the area
   * clears — or the hero speaks to a merchant, who stands the whole party back
   * up (`reviveDownedCompanions`). A companion downed in a quick scrap still
   * pops back up on its own once the mob is dead.
   */
  downedCombatRadius: 140,
  /** Fraction of max hp a companion stands back up with. */
  reviveHpFraction: 0.5,
  /**
   * Out-of-combat healing: a companion that hasn't swung at a foe or taken a
   * blow for `regenCalmMs` knits itself back up at `regenPerSec` of its max hp
   * each second — the party mends between fights instead of bleeding down over
   * a level with no way to recover short of a full down. Combat (a live target
   * in the hero's engage bubble, or a contact hit) resets the calm timer; a
   * downed companion recovers only via its kneel/revive, never this.
   */
  regenPerSec: 0.08,
  /** Ms of quiet (no swing made, no hit taken) before out-of-combat regen
   * begins — a companion mid-fight is not "out of combat". */
  regenCalmMs: 3_000,
  /** Chance a companion's kill floats one of its def's `killQuotes`. */
  quoteChance: 0.35,
  /** Minimum ms between one companion's quotes — banter, not a ticker. */
  quoteCooldownMs: 6_000,
} as const;
