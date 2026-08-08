// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The recruited party: the ONE companion, formation, engagement, leveling, and
// what it costs to put a fallen one back on its feet.

/**
 * COMPANIONS — the recruited party (see companions.ts). A spareable unique
 * (`EnemyDef.spareable`) beaten to 0 hp offers the SPARE-or-KILL choice;
 * spared, it joins the hero as a companion: follows him, fights with its own
 * equipped weapon, wears a helmet and chest piece (never legs or feet), and
 * rides the loadout to the next level. At 0 hp it goes DOWN and STAYS down —
 * nothing in the world stands it back up but a bottle of SMELLING SALTS off
 * the trader's counter, and nothing mends it but the hero's own medkits.
 */
export const COMPANIONS = {
  /**
   * How many companions the hero may keep — ONE, Diablo 2's mercenary rule.
   * A party of four is a second hero rather than a friend: it out-damages the
   * things it is meant to help with, and nothing that happens to any single
   * member of it matters. With one, the recruit has a name the player learns,
   * its death is an event, and the SPARE-or-KILL verdict is a real trade
   * rather than a collection. Sparing a second one RETIRES the first
   * (`recruitCompanion`) — the same swap hiring a new mercenary makes.
   */
  maxParty: 1,
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
   * Global scale on a COMPANION's weapon damage — the party fights at half
   * weight so a recruited elite supports the hero instead of clearing the
   * field for him. This is a rule about companions, not about weapons: the
   * hero's own blows carry the catalog damage verbatim (see `WEAPON`), and
   * this damper is what keeps a party from doing his job.
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
  /**
   * The share of its bar a companion wakes with when the SMELLING SALTS are
   * broken under its nose (`spendReviveItem`). Deliberately a sliver: waking
   * is the expensive half of the errand, but a friend who came back at full
   * strength would make the MEDKITS that top it up decoration. Groggy and
   * standing is the state the heal exists to answer.
   */
  saltsHpFraction: 0.2,
  /**
   * The share of the companion's OWN bar one of the hero's medkits mends,
   * scaled by that kit's quality (`MEDKIT.tiers[].healPct` — a LIGHT kit
   * mends less than a SUPERIOR one, exactly as it does for the hero). Held
   * under 1 so topping a badly-beaten friend up costs more than one kit: the
   * bag's supply is the price of keeping it standing.
   *
   * There is no passive regen to fall back on. A companion that took a beating
   * carries it until the hero spends something on it — which is what makes the
   * party a resource he manages rather than a turret that mends itself.
   */
  medkitHealFraction: 0.8,
  /** Chance a companion's kill floats one of its def's `killQuotes`. */
  quoteChance: 0.35,
  /** Minimum ms between one companion's quotes — banter, not a ticker. */
  quoteCooldownMs: 6_000,
} as const;
