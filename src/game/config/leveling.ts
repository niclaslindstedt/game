// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// XP and level-ups: the kills-per-level curve, stat-point grants, the scroll,
// and the per-map XP caps.

import type { Difficulty } from "../types/index.ts";

/** XP and level-ups. Each level-up grants stat points to spend. */
export const LEVELING = {
  /** Default XP granted per point of a killed monster's max hp. */
  xpPerHp: 1,
  /**
   * How fast a mob's XP payout grows with its level: COMPOUNDING, 8%/level
   * all the way to the cap (`mobLevelXp` = `refMobHp × (1 + this)^(mlvl−1) ×
   * xpPerHp`). Deliberately its own knob, decoupled from the LINEAR
   * `MENACE.mobHpPerLevel` hp ramp — mob toughness and mob reward scale on
   * different curves. The `content/leveling.yaml` rows are priced against
   * this same unit, so a row's kills-per-level annotation stays honest.
   */
  mobXpGrowthPerLevel: 0.08,
  /**
   * How many levels ABOVE the hero the compounding XP base keeps growing: a
   * mob further above than this pays as if it were `playerLevel + clamp`
   * (the `xpAbovePlayerPerLevel` bonus, capped at `xpAboveMaxMult`, still
   * applies on top). WoW-style boundedness — without it the 8%/level
   * compounding base would make one far-above kill worth dozens of levels
   * (a power-leveling exploit the old linear pricing never had).
   */
  xpAboveClampLevels: 5,
  /**
   * WoW-STYLE LEVEL-DIFFERENCE XP — a kill's base (level-priced) XP is scaled by
   * how the mob's level compares to the HERO's (see `levelDiffXpMult` in
   * leveling.ts, applied inside `mobLevelXp`). A mob ABOVE the hero pays a bonus
   * (`+xpAbovePlayerPerLevel` per level, capped at `xpAboveMaxMult`); a mob
   * BELOW pays a penalty (`−xpBelowPlayerPerLevel` per level) that bottoms out at
   * ZERO (the "grey" mob, `1 / xpBelowPlayerPerLevel` levels under). A mob AT the
   * hero's level is neutral (×1), so the kills-per-level curve — authored against
   * a same-level reference mob (`referenceMobXp`) — is unchanged; the multiplier
   * only bites where the difficulty's mob-level CAPS push the horde off the
   * hero's level (a floored nightmare/jesus mob pays a bonus; an out-levelled,
   * ceiling-stuck easy mob pays a pittance). Tunable at runtime with the
   * BALANCE › REST XP slider (scales both slopes together).
   */
  xpAbovePlayerPerLevel: 0.08,
  xpBelowPlayerPerLevel: 0.07,
  /** Ceiling on the above-level XP bonus multiplier — a mob far above the hero
   * pays richly, but not without bound. */
  xpAboveMaxMult: 1.5,
  /**
   * Elite/boss kill XP is MOB-PRICED — a flat multiple of the set piece's own
   * `mobLevelXp` (its `mlvl` carrying the def's `levelBonus`), authored in
   * `content/leveling.yaml` (`eliteXpMobMult` / `bossXpMobMult`, compiled into
   * `XP_TUNING`) — never a share of the hero's level bar. Mob-pricing every
   * faucet is what keeps the leveling table's kills-per-level TRUE in play; a
   * def may override with `EnemyDef.xpMobMult` (the shielded bro trio) or a
   * flat `xp`. Applied in `enemyKillXp` (loot.ts).
   */
  /**
   * The hard level cap — a Diablo-style ceiling. Once a hero hits it, XP stops
   * banking levels (the bar pins full) and the endgame becomes the hunt for
   * cap-level gear rather than the next ding. Enforced in `grantXp` (loot.ts).
   */
  maxLevel: 99,
  /**
   * The level curve itself — the XP each level costs — is DATA, not a
   * formula: `content/leveling.yaml` authors it per level up to the cap
   * (compiled to `src/generated/leveling.ts` by `make levels`), every row
   * annotated with its kills-per-level equivalent against the level-priced
   * reference minion (`referenceMobXp`, i.e. `refMobHp` compounding at
   * `mobXpGrowthPerLevel` × `xpPerHp`). See that file's header for the
   * curve's shape story (the monotone opening rise, the lane landings, the
   * endgame tail) and the `leveling-balance` skill for the retuning workflow:
   * edit the YAML, check with `scripts/leveling-curve.mjs`, verify with a
   * `simulate-run` campaign, and re-size `XP_CAP` and every level's
   * `intendedLevelByDifficulty` off the result. The two knobs below stay ON TOP of
   * the table because they aren't per-level facts of the shared curve.
   */
  /**
   * PER-TIER LEVELING SLOWDOWN — one of the two "endgame is harder" knobs (both
   * runtime-tunable on the DEVELOPER › BALANCE page). Each difficulty TIER above
   * the three bottom lanes (easy/medium/hard, which share tier 0) makes every
   * level cost this fraction MORE XP, COMPOUNDING per tier: nightmare (tier 1)
   * costs `×(1 + step)`, jesus (tier 2) `×(1 + step)²`. At the shipped 0.625 a
   * level on nightmare takes ~63% more time than the same level on a bottom
   * lane, and jesus ~2.6× — so it takes "longer and longer" the deeper you go
   * (the steep step is what holds the nightmare full-clear landing at ~57
   * against the cheap post-rework mid-curve). The
   * tier is `difficultyDef.index − 3` floored at 0; applied in `xpToLevelUp`
   * keyed on the run's difficulty (so the bar, the boss bar-shares, and
   * the kills-per-level all move together). 0 makes every difficulty level
   * alike. Turn it with the BALANCE › LEVEL SLOWDOWN slider (scales this step).
   */
  tierLevelCostStep: 0.625,
  /**
   * ENDGAME STEEPENING — an EXTRA wall on top of the authored curve. The
   * shipped endgame wall now lives IN `content/leveling.yaml` itself (the
   * kills-per-level climb steepens from level 70 to ~1000 kills at 98), so
   * the shipped rate here is 0 — the BALANCE › ENDGAME WALL slider only does
   * something if a non-zero rate is restored (it scales this rate; each
   * level past `endgameSteepenFrom` then costs an extra compounding
   * `rate`). Applied in `xpToLevelUp` for EVERY difficulty.
   */
  endgameSteepenFrom: 70,
  endgameSteepenRate: 0,
  /**
   * The hp of a "typical" rank-and-file minion — the anchor mob XP is priced
   * against (`mobLevelXp`), so a `content/leveling.yaml` row's kills-per-level
   * annotation reads as real kills when the hero fights level-appropriate
   * mobs. Keep it near the common wave minions' catalog hp.
   */
  refMobHp: 45,
  /**
   * Trainable stat points a ding grants — the BASE, plus one bonus point
   * per full `statPointsBonusEvery` levels reached (see `statPointsAt` in
   * leveling.ts): 1/ding through the opening, 2 from level 10, 5 at 40,
   * 10 at 99. Later dings pay MORE points on purpose: the level-scaled stat
   * cap (`statCap` in leveling.ts) rises by exactly this grant each ding, so a
   * hero who keeps their main stat maxed stays right at the linear ceiling —
   * the growing grant is what keeps a full SPEC realizing its raw value deep
   * into the campaign, all the way to the `STATS.statHardCap` (250) roof.
   */
  statPointsPerLevel: 1,
  statPointsBonusEvery: 10,
  /**
   * The XP SCROLL pays no XP at all — it MULTIPLIES what the hero earns for a
   * window (`scrollXpMult` × `scrollDurationMs`, authored in
   * `content/leveling.yaml` and compiled into `XP_TUNING`; see
   * `xpBoostMultiplier` in leveling.ts). No share-of-bar and no flat payout, so
   * the scroll drip can never distort the table's kills-per-level: it only ever
   * makes the same kills count twice.
   */
  /**
   * Ms the level-up celebration plays before the stat chooser interrupts:
   * the ding's blinding light explosion engulfs the hero, the horde is
   * hurled back on the shockwave, the fanfare rings, the gains tick into the
   * feed — and only then does the modal rise out of the fading glare. The
   * reward lands before the bookkeeping (the WoW ding moment). The burn
   * renders off `GameState.levelUpFxMs`, which counts this window down.
   */
  dingCelebrationMs: 1200,
  /**
   * The LEVEL-UP LIGHT SHOCKWAVE: the ding's blinding flash detonates a ring
   * of pure light off the hero that HURLS the surrounding horde back — a
   * knockback, never a wound (the light throws them; it doesn't hurt them).
   * `radius` is how far the wave reaches (world px — sized to clear a phone's
   * ~211px half-width so it visibly shoves the whole on-screen crowd), and
   * `knockbackSpeed` is the outward launch velocity at ground zero, falling off
   * to nothing at the rim. Reuses the asteroid knock machinery
   * (`knockVel`/`knockMs`, coasted by `stepKnockback`) and the shared
   * `KNOCKBACK.roleScale` so heavy elites/bosses barely budge while minions
   * sail. Applied once per ding in `grantXp` (loot.ts).
   */
  shockwave: {
    radius: 240,
    knockbackSpeed: 950,
    knockbackMs: 360,
  },
  /**
   * DEATH TOLL — the fraction of the CURRENT level's XP requirement
   * (`player.xpToNext`) a softcore hero forfeits when he dies: dying costs
   * progress, so a run isn't consequence-free. The bar drops by this share of
   * one level's worth of XP (clamped at the level floor — a death never
   * de-levels the hero or refunds banked stat/talent points). Shipped at 10%;
   * scaled at runtime by the DEVELOPER › BALANCE `deathXpLoss` knob (0× turns
   * the penalty off, higher makes death bite harder). Applied on the `defeat`
   * transition in `applyDeathXpPenalty` (loot.ts).
   */
  deathXpPenaltyFraction: 0.1,
  /**
   * Automatic base-attribute growth (WoW-style): crossing into level L
   * grants `round(rate × L)` points of each stat listed here, on its own,
   * underneath the chosen stat points — so every ding is felt in the body,
   * not just in the chooser, and the gain itself grows with the level.
   * Derived from `player.level` (see leveling.ts), never written into
   * `player.stats`: a respec refunds only the CHOSEN points. The horde's
   * hp scaling multiplies by the damage curve these rates produce
   * (`autoPowerScale` folded into `mobHpScaleFor`/`enemyPowerScale`), so
   * automatic growth alone never turns mobs into one-hit kills — chosen
   * points and gear remain what pushes the player ahead of the curve.
   */
  autoGainsPerLevel: {
    stamina: 0.4,
    strength: 0.25,
    dexterity: 0.2,
  },
} as const;

/**
 * PER-MAP XP CAPS — every (level × difficulty) pair has a hero-level ceiling
 * (see `xpLevelCap` in leveling.ts): XP earned on that map diminishes as the
 * hero closes on the cap (halving per level across the last `fadeLevels`) and,
 * past it, drops to a permanent `floor` TRICKLE — never zero, so re-running an
 * outgrown map still creeps the bar forward while it rains LOOT. This is the
 * Diablo rule softened: outleveling a zone throttles its XP to a trickle rather
 * than retiring it outright, so a determined grinder can still crawl toward the
 * global `LEVELING.maxLevel` on an old map, just achingly slowly. Each rung
 * lists the cap on its FIRST and LAST story level; intermediate maps interpolate
 * linearly. Every cap sits at least `fadeLevels` (3) ABOVE where a single FULL
 * CLEAR of that map leaves the hero (the `--by-level --clear-share 1` exit
 * level), so KILLING EVERYTHING ON A MAP ONCE never reaches — never even touches
 * the fade under — that map's cap: the story never starves and a clean clear
 * forfeits ~nothing. Only the RERUN grind, replaying an outgrown map, hits the
 * trickle. The `last` value on each bottom rung is the tier ceiling the player
 * quotes ("to level 40 / 58 / 70"): the three bottom lanes (easy/medium/hard)
 * SHARE the 40 ceiling — they run the same missions over the same band and only
 * differ in how much XP their hordes pay, so a full clear lands each a couple
 * of levels apart (33/36/38) but all under 40. NIGHTMARE tops at 60, JESUS's
 * early maps at ~68 rising to the global `LEVELING.maxLevel` on its last map —
 * the 76→99 endgame grind lives there.
 */
export const XP_CAP = {
  capByDifficulty: {
    // The per-map soft cap interpolates first (map 1) → last (map 5). The three
    // bottom lanes share the same 40 CEILING (the "to level 40" tier top): a
    // FULL CLEAR lands the hero at ~32 / 34 / 38 (easy/medium/hard — the
    // ladder's intended finishes), then the last levels to 40 are a GRIND —
    // and hitting 40 unlocks nightmare.
    // NIGHTMARE runs 40→56 (a full clear; grind 56→58 unlocks jesus). JESUS is
    // player-relative. The cap sits ABOVE each rung's full-clear finish so the
    // clear itself isn't clamped — the fade only bites in the grind stretch
    // (hard's landing at 38 deliberately brushes the shared 40 ceiling).
    easy: { first: 16, last: 40 },
    medium: { first: 17, last: 40 },
    hard: { first: 18, last: 40 },
    nightmare: { first: 49, last: 60 },
    jesus: { first: 68, last: 99 },
  } as Record<Difficulty, { first: number; last: number }>,
  /**
   * XP starts diminishing this many levels UNDER the (soft) cap: the grant is
   * multiplied by `softCapDecay` for each level past `cap − fadeLevels`,
   * tapering into the wall — not a cliff.
   */
  fadeLevels: 3,
  /**
   * The per-level XP decay through the soft cap: every level past
   * `cap − fadeLevels` multiplies the grant by this (a reverse-exponential
   * fade), so each level over the cap takes far more kills than the one before.
   * Tuned so the fade reaches the `floor` (the ~1/100 trickle) about two levels
   * PAST the cap — the point the climb slows to a pace nobody would sit
   * through, the map's effective soft cap.
   */
  softCapDecay: 0.4,
  /**
   * The never-zero TRICKLE the fade bottoms out at: once `softCapDecay` would
   * sink the multiplier below this, it holds here instead, so an outgrown map
   * keeps paying a sliver of XP forever (the "diminish, don't zero" rule)
   * rather than slamming shut — there is NO hard level wall on a map, only this
   * glacial ~1/100 pace once the hero is a couple of levels past the cap. The
   * global `LEVELING.maxLevel` is the only true ceiling.
   */
  floor: 0.01,
} as const;

/**
 * PARTY XP SHARING — how a kill's XP is divided when several heroes are
 * standing in the same fight (`xp-share.ts`, multiplayer plan §4.3).
 *
 * Both knobs are inert in a single-player run BY CONSTRUCTION rather than by a
 * special case: one hero in range takes the whole payout, and the bonus is 1 at
 * a party of one. Neither number can therefore re-tune the shipped campaign,
 * which is what makes them safe to move on measured co-op evidence alone.
 */
export const XP_SHARE = {
  /**
   * How near the kill (world px) a hero has to be to share in it.
   *
   * Measured against the reference viewport — a phone held horizontally sees
   * roughly 422×195 world units, so a hero within this radius is at most about
   * one and a half screens away: near enough to plausibly have been in the same
   * fight, far enough that a ranged build holding the back of a hall is not cut
   * out of the kills it is making. Tightening it toward one screen makes a party
   * huddle; opening it toward the map makes the proximity gate stop gating, and
   * a party's best play becomes to scatter and farm four fights at once.
   */
  radius: 700,
  /**
   * How much bigger the shared pot gets per EXTRA hero in range: at 0.1 a pair
   * divides 1.1 kills' worth of XP and a full party of eight divides 1.7.
   *
   * The lever to move if measurement says grouping is not worth it — read the
   * per-capita XP rate off a multi-player headless run, NOT the per-kill share,
   * because a party also clears faster and the two effects only show up together.
   */
  partyBonusPerHero: 0.1,
} as const;
