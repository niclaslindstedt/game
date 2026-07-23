// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// XP and level-ups: the kills-per-level curve, stat-point grants, arrow XP,
// and the per-map XP caps.

import type { Difficulty } from "../types/index.ts";

/** XP and level-ups. Each level-up grants stat points to spend. */
export const LEVELING = {
  /** Default XP granted per point of a killed monster's max hp. */
  xpPerHp: 1,
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
   * Elite and boss kills pay XP as a SHARE OF THE HERO'S CURRENT LEVEL BAR —
   * a flat fraction of `xpToLevelUp(player.level)` — rather than the
   * hp-proportional rule the rank and file ride (`xpPerHp`). A set-piece kill
   * is meant to visibly LURCH the bar (the "boss = a real chunk of a level"
   * reward), and only a bar-share does that CONSISTENTLY across every map and
   * difficulty: a flat number tuned for the first easy encounter would collapse
   * to a rounding error by the time the same elite is re-fought fifty levels
   * later, and an hp-proportional reward swings wildly between a squishy moon
   * elite and a bunker bullet-sponge. Reading the live level instead makes the
   * lurch the same 12%/20% wherever and whenever the elite/boss dies — and
   * because it flows through `grantXp`, the per-map XP cap still fades it to
   * nothing on an outgrown replay, so boss farming never over-levels the hero.
   * A def may override its own share with `EnemyDef.xpBarShare` (the shielded
   * grok trio each pay less, being a three-part guardian gauntlet). Elites aim
   * at the 10–15% "noticeable move" band; bosses deliberately reach past it as
   * the campaign's climactic kills.
   */
  eliteXpBarShare: 0.12,
  bossXpBarShare: 0.2,
  /**
   * The hard level cap — a Diablo-style ceiling. Once a hero hits it, XP stops
   * banking levels (the bar pins full) and the endgame becomes the hunt for
   * cap-level gear rather than the next ding. Enforced in `grantXp` (loot.ts).
   */
  maxLevel: 99,
  /**
   * The level curve is authored in KILLS PER LEVEL, not raw XP, so pacing is
   * legible and stays put no matter how the horde's hp scales. `xpToLevelUp`
   * (leveling.ts) sets each level's cost to `killsPerLevel(L) × a reference
   * mob's XP at L`, where the reference mob's toughness mirrors `mobHpScaleFor`
   * (the flat per-level ramp × the auto-stat damage curve). Because the SAME
   * `autoPowerScale` sits in both the cost and the mobs' hp, it cancels: the
   * kills a level takes are invariant to the auto-stat dev flag and to how much
   * the hero's damage grows — only the difficulty's mob-level offset nudges it.
   * The count rises with level on a gentle geometric, so leveling tapers from
   * ~10–20/day early to ~2/day near the cap.
   *
   * The base/growth are tuned against a FULL CLEAR (kill the whole roster, no
   * deaths) so the caps are ceilings the hero lands UNDER, not targets: on the
   * CRITICAL PATH — one bottom lane (easy/medium/hard) → nightmare → jesus,
   * three playthroughs, not five — a full clear leaves the hero at ~33/35/36
   * (easy/medium/hard), ~51 after nightmare (entering at ~34), and ~69 after
   * jesus (entering at ~56), each UNDER that tier's XP cap (40 / 58 / 70), then
   * the steep endgame grind to the cap. The bottom lanes DIFFER on purpose
   * (medium/hard field bigger, higher-level hordes than easy — `mobCountMult` ×
   * the difficulty `mobLevelOffset` — so their clears pay more XP and land a
   * level or two higher). The upper tiers level SLOWER by design: `xpToLevelUp`
   * charges nightmare/jesus `tierLevelCostStep` more per level (compounding per
   * tier), and past level 70 `endgameSteepenRate` walls the curve up — so it
   * takes "longer and longer" the deeper you go. Read the per-map full-clear
   * landings off `node scripts/leveling-curve.mjs --by-level --clear-share 1`
   * (a full clear; the default 0.5 models a half clear; `--tier-entry` sets the
   * nightmare/jesus entry levels). XP_CAP bands, the WORLD_DROP gates, and every
   * level's arrowCapByDifficulty are sized off that table; `--start <lane>`
   * checks each bottom lane. Real play (a PARTIAL clear) lands the hero under
   * these full-clear numbers — under the caps by even more, which is the design
   * intent. Whenever base/growth, the tier knobs, or the roster move, re-run the
   * view and re-read the caps/gates; don't tune by feel.
   */
  killsPerLevelBase: 150,
  killsPerLevelGrowth: 1.041,
  /**
   * PER-TIER LEVELING SLOWDOWN — one of the two "endgame is harder" knobs (both
   * runtime-tunable on the DEVELOPER › BALANCE page). Each difficulty TIER above
   * the three bottom lanes (easy/medium/hard, which share tier 0) makes every
   * level cost this fraction MORE XP, COMPOUNDING per tier: nightmare (tier 1)
   * costs `×(1 + step)`, jesus (tier 2) `×(1 + step)²`. At the shipped 0.15 a
   * level on nightmare takes 15% more time than the same level on a bottom lane,
   * and jesus ~32% more — so it takes "longer and longer" the deeper you go. The
   * tier is `difficultyDef.index − 3` floored at 0; applied in `xpToLevelUp`
   * keyed on the run's difficulty (so the bar, the arrow/boss bar-shares, and
   * the kills-per-level all move together). 0 makes every difficulty level
   * alike. Turn it with the BALANCE › LEVEL SLOWDOWN slider (scales this step).
   */
  tierLevelCostStep: 0.15,
  /**
   * ENDGAME STEEPENING — the second "harder" knob. Past `endgameSteepenFrom`,
   * every level costs an extra `endgameSteepenRate` COMPOUNDING on TOP of the
   * base geometric `killsPerLevelGrowth`, so the last stretch to the cap turns
   * into a wall (Diablo 2's 90→99). At the shipped 5%/level from 70, level 80
   * costs ~1.6× and level 99 ~2.6× what the base curve alone would ask. Applied
   * in `xpToLevelUp` for EVERY difficulty (it is the shared level curve). Set
   * the rate to 0 for a pure geometric tail. Turn it with the BALANCE › ENDGAME
   * WALL slider (scales the rate); the threshold stays config-only.
   */
  endgameSteepenFrom: 70,
  endgameSteepenRate: 0.05,
  /**
   * Onboarding ramp: the opening levels cost only a FRACTION of their curve
   * value so the first ding lands in a handful of kills — the level-up, the
   * stat chooser, the golden burn all get shown off in the first minute — and
   * the cost eases up to full by `earlyRampLevels`. `earlyRampStart` is level
   * 1's fraction (≈a tenth, so ~a dozen kills to level 2); it lerps linearly to
   * 1.0 across the ramp, after which the normal slow curve takes over. This
   * only touches the first few levels — the long-game taper is unchanged.
   */
  earlyRampLevels: 6,
  earlyRampStart: 0.025,
  /**
   * The hp of a "typical" rank-and-file minion — the anchor the kills-per-level
   * accounting is stated against, so `killsPerLevelBase` reads as real kills
   * when the hero fights level-appropriate mobs. Keep it near the common wave
   * minions' catalog hp.
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
   * XP granted by a golden arrow pickup, as a fraction of the CURRENT
   * xpToNext AT LEVEL 1 — a share of a level, not a flat sum, so an arrow
   * still triggers dings deep into a run instead of fading into noise. The
   * share is not flat, though: it TAPERS with level (see `arrowXpShareTaper`
   * and `arrowXpShareAt` in leveling.ts) so arrows carry the early game and
   * then quietly recede, letting the kill grind own the long climb to the cap.
   */
  arrowXpShare: 0.25,
  /**
   * How fast the arrow's share of a level decays as the hero climbs: the
   * effective share is `arrowXpShare / (1 + arrowXpShareTaper × (level − 1))`,
   * a harmonic taper from the full share at level 1 toward a thin sliver near
   * the cap (0.1 → ~13% at L10, ~9% at L20, ~2% at L99). Bigger = arrows fade
   * faster. Zero restores the old flat share. The leveling-curve calculator
   * folds this into its arrow accounting (see scripts/leveling-curve.mjs).
   */
  arrowXpShareTaper: 0.1,
  /**
   * The COLD arrow payout, in reference-mob kills. A golden arrow is a
   * CATCH-UP faucet: while the hero is still under the level a normal run of
   * the current map/difficulty leaves him at (`LevelDef.loot.arrowCapByDifficulty`),
   * it pays the share-of-bar above; ONCE HE HITS THAT CAP the arrow goes cold
   * and pays a flat `arrowColdMobXpMult × referenceMobXp(level)` instead —
   * ~5 mob kills' worth, a rounding error against a whole level, so grinding
   * old content can't arrow-boost the hero past where that content belongs.
   * Levels with no cap entry (test fixtures, un-tuned maps) never go cold.
   */
  arrowColdMobXpMult: 5,
  /**
   * Ms the level-up celebration plays before the stat chooser interrupts:
   * the ding's golden burn wreathes the hero, the fanfare rings, the gains
   * tick into the feed — and only then does the modal open. The reward
   * lands before the bookkeeping (the WoW ding moment). The burn renders
   * off `GameState.levelUpFxMs`, which counts this window down.
   */
  dingCelebrationMs: 1000,
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
 * differ in how much XP their hordes pay, so a full clear lands each a level or
 * two apart (33/35/36) but all under 40. NIGHTMARE tops at 58, JESUS's early
 * maps at ~68 rising to the global `LEVELING.maxLevel` on its last map — the
 * 67→99 endgame grind lives there.
 */
export const XP_CAP = {
  capByDifficulty: {
    // The per-map soft cap interpolates first (map 1) → last (map 5). The three
    // bottom lanes share the same 40 CEILING (the "to level 40" tier top): a
    // FULL CLEAR lands the hero at ~34 / 36 / 38 (easy/medium/hard), then the
    // last few levels to 40 are a GRIND — and hitting 40 unlocks nightmare.
    // NIGHTMARE runs 40→56 (a full clear; grind 56→58 unlocks jesus). JESUS is
    // player-relative. The cap sits ABOVE each rung's full-clear finish so the
    // clear itself isn't clamped — the fade only bites in the grind stretch.
    easy: { first: 15, last: 40 },
    medium: { first: 15, last: 40 },
    hard: { first: 16, last: 40 },
    nightmare: { first: 47, last: 60 },
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
