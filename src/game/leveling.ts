// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Automatic base-attribute growth: the WoW-style gains leveling ITSELF grants,
// underneath the chosen stat points (config LEVELING.autoGainsPerLevel).
// Everything here is DERIVED from `player.level` — nothing is ever written
// into `player.stats`, so a respec refunds only the points the player chose.
// Kept in its own module (config, types, and the pure-data level catalog
// only) so both items/derived.ts (effective stats) and menace.ts (mob hp keeping
// pace) can read it without a cycle.

import { XP_TO_NEXT } from "../generated/leveling.ts";
import { LEVELING, STATS, XP_CAP } from "./config/index.ts";
import { difficultyDef } from "./defs/difficulties.ts";
import { levelPosition } from "./defs/levels/index.ts";
import { chosenStatPointsThrough, statPointsAt } from "./stat-points.ts";
import { BALANCE } from "./tuning.ts";
import type { Difficulty, StatName } from "./types/index.ts";

const AUTO_GAINS: Partial<Record<StatName, number>> =
  LEVELING.autoGainsPerLevel;

// Developer feature flag (pwa settings `autoLevelStats`, applied via the
// `setAutoStatGainsEnabled` setter): whether the automatic per-level base-stat
// growth is active. Flipping it off makes `autoGainAt` return 0, which
// CASCADES through every derivation in this module — `baseStatBonus`,
// `levelStatGains`, and `autoPowerScale` all fall to their neutral values — so
// the hero stops banking free stats AND the horde's compensating hp scale
// (menace.ts folds `autoPowerScale` into `mobHpScaleFor`/`enemyPowerScale`)
// drops in lockstep, keeping the balance consistent. Auto-stat growth is an
// EXPERIMENTAL, opt-in feature: the engine default is OFF, matching the shipped
// app (which only flips it on when the developer enables `autoLevelStats`), so
// the standalone/test/sim baseline calibrates against the same auto-OFF regime
// the player actually runs. Tests toggle it and must restore it.
let autoStatGainsEnabled = false;

/**
 * Toggle the automatic per-level base-stat growth (a developer flag). Off
 * strips both the hero's free gains and the mob hp scaling that compensates
 * them (they derive from the same `autoGainAt`), so the balance stays whole.
 */
export function setAutoStatGainsEnabled(enabled: boolean): void {
  autoStatGainsEnabled = enabled;
}

/**
 * The automatic points of `stat` that crossing INTO `level` grants:
 * `round(rate × level)`, so each ding pays a little more than the last —
 * the gain scales with the level, like the level-up itself should feel.
 * Zero for stats the config leaves off the auto-growth list, and zero for
 * every stat while the auto-growth flag is off (see `setAutoStatGainsEnabled`).
 */
export function autoGainAt(level: number, stat: StatName): number {
  if (!autoStatGainsEnabled) return 0;
  const rate = AUTO_GAINS[stat] ?? 0;
  return rate > 0 ? Math.round(rate * level) : 0;
}

/**
 * The cumulative automatic bonus a hero of `level` has banked in `stat`:
 * every ding's `autoGainAt` from level 2 up, summed. Levels stay small
 * (a campaign tops out in the teens), so the loop is cheaper than keeping
 * a stored counter honest across saves and respecs.
 */
export function baseStatBonus(level: number, stat: StatName): number {
  let total = 0;
  for (let l = 2; l <= level; l++) total += autoGainAt(l, stat);
  return total;
}

/**
 * The per-stat gains ONE ding into `level` grants, listed for the app's
 * ding readout (the `levelUp` event carries this so the feed can print
 * "+2 STAMINA" without re-deriving the rule). Zero-gain stats are omitted.
 */
export function levelStatGains(
  level: number,
): { stat: StatName; amount: number }[] {
  const gains: { stat: StatName; amount: number }[] = [];
  for (const stat of Object.keys(AUTO_GAINS) as StatName[]) {
    const amount = autoGainAt(level, stat);
    if (amount > 0) gains.push({ stat, amount });
  }
  return gains;
}

/**
 * The per-stat effective CEILING at `level`: what a hero could reach by pouring
 * every chosen point into one stat (`statCeilingBase + chosenStatPointsThrough`),
 * rising with level and hard-capped at `STATS.statHardCap` (250). This is the
 * level-scaled cap `diminishStat` bends the stat pile toward — chosen points get
 * full linear value up to it, gear diminishes past it.
 */
export function statCap(level: number): number {
  return Math.min(
    STATS.statHardCap,
    STATS.statCeilingBase + chosenStatPointsThrough(level),
  );
}

/**
 * DIMINISHING RETURNS on stat points — the single curve every effective-stat
 * read runs through (`effectiveStat` in items/derived.ts) and `autoPowerScale` mirrors.
 * LINEAR up to the level-scaled `statCap(level)` — so a full spec realizes its
 * raw value and one stat can dominate — then each raw point PAST the cap pays
 * less (`cap + over/(1 + statTaper·over)`): that over-cap region is where GEAR
 * (and the auto gains / head-start) lands, so an endgame loadout is felt but
 * never gets the undiminished linear value chosen points do. The cap rises with
 * level toward 250, so specs and gear stay relevant to the endgame instead of
 * flattening at a fixed ceiling.
 */
export function diminishStat(points: number, level: number): number {
  const cap = statCap(level);
  if (points <= cap) return points;
  const over = points - cap;
  return cap + over / (1 + STATS.statTaper * over);
}

/**
 * The damage-output multiplier the AUTOMATIC gains alone hand a hero of
 * `level`: the STR damage curve times the DEX cadence curve, exactly as
 * `weaponDamage`/`weaponCooldownFor` would apply those points — including
 * the diminishing-returns curve (`diminishStat`) those reads run through, so
 * the horde's compensation never overshoots what the hero actually realizes.
 * The horde's hp scaling multiplies by this same number (`mobHpScaleFor`,
 * `enemyPowerScale` in menace.ts), so the free growth cancels out against
 * the crowd and only CHOSEN points, gear, and skill move the player ahead
 * of the curve — the ding feels mighty without turning the campaign into
 * one-hit kills. And because chosen points and gear stats stack ON TOP of
 * the auto gains — deeper into the flat tail of the diminishing curve — each
 * new level realizes a little LESS of that edge than the last: leveling
 * alone slowly loses ground to the horde's ramp, by design.
 */
export function autoPowerScale(level: number): number {
  return (
    (1 +
      diminishStat(baseStatBonus(level, "strength"), level) *
        STATS.damageBonusPerPoint.strength) *
    (1 +
      diminishStat(baseStatBonus(level, "dexterity"), level) *
        STATS.attackSpeedPerStat)
  );
}

// `statPointsAt` / `chosenStatPointsThrough` now live in the LEAF module
// `stat-points.ts` (config-only, no level catalog) so defs/equipment.ts can
// read the chosen-point budget without dragging the generated level catalog
// into the build-time generate scripts. Imported above for local use (statCap)
// and re-exported here so every existing `from "./leveling.ts"` importer is
// unchanged.
export { chosenStatPointsThrough, statPointsAt };

/**
 * The share of the CURRENT level bar a golden arrow grants at `level`: the
 * base share (`LEVELING.arrowXpShare`) decayed harmonically by
 * `LEVELING.arrowXpShareTaper`, so arrows pay a full quarter-level early and a
 * thin sliver near the cap. The single source of truth for the arrow payout
 * WHILE HOT, read by the pickup handler (step/) and the leveling-curve
 * calculator (scripts/leveling-curve.mjs) alike, so the model and the game
 * never drift.
 */
export function arrowXpShareAt(level: number): number {
  const l = Math.max(1, level);
  return LEVELING.arrowXpShare / (1 + LEVELING.arrowXpShareTaper * (l - 1));
}

/**
 * The XP a rank-and-file minion of monster level `mlvl` pays — a function of
 * its LEVEL ONLY, never its hp. A "reference" minion (`LEVELING.refMobHp`
 * grown by the COMPOUNDING `mobXpGrowthPerLevel` — 8%/level all the way to
 * the cap) priced at `LEVELING.xpPerHp` sets the scale, so a mob's XP is
 * exactly what a typical minion of that level would be worth — a
 * bullet-sponge tank and a squishy of the same level pay the SAME, and an
 * evolved (extra-hp) minion pays no more than an un-evolved one. The
 * compounding base clamps at `playerLevel + xpAboveClampLevels` — a mob far
 * above the hero pays a bounded premium (the clamp plus the capped
 * `levelDiffXpMult` bonus), never a compounding windfall. No
 * `autoPowerScale` (that stays a mob-HP/damage factor), and deliberately NOT
 * the linear `MENACE.mobHpPerLevel` hp ramp — reward and toughness scale on
 * their own curves. The authored `content/leveling.yaml` rows are priced
 * against this same unit, so a row's XP divided by this is literally its
 * kills-per-level, whatever the auto-stat dev flag says. The per-mob spawn
 * band (see `spawnEnemy`) rolls `mlvl` up or down, so a hotter mob is worth
 * proportionally more.
 */
export function mobLevelXp(mlvl: number, playerLevel: number): number {
  // The compounding base is CLAMPED a few levels above the hero (WoW-style):
  // a far-above mob pays as a (hero + clamp)-level mob times the capped
  // above-level bonus, so cross-level kills can't power-level the hero.
  const baseLevel = Math.min(
    Math.max(1, mlvl),
    Math.max(1, playerLevel) + LEVELING.xpAboveClampLevels,
  );
  return (
    LEVELING.refMobHp *
    Math.pow(1 + LEVELING.mobXpGrowthPerLevel, baseLevel - 1) *
    LEVELING.xpPerHp *
    levelDiffXpMult(mlvl, playerLevel)
  );
}

/**
 * WoW-STYLE LEVEL-DIFFERENCE XP multiplier (config `xpAbove/BelowPlayerPerLevel`,
 * dev knob `BALANCE.restXp`): a mob ABOVE the hero pays a bonus
 * (`+xpAbovePlayerPerLevel` per level, capped at `xpAboveMaxMult`); a mob BELOW
 * pays a penalty (`−xpBelowPlayerPerLevel` per level) down to ZERO — the "grey"
 * mob a full `1 / xpBelowPlayerPerLevel` levels under the hero. A mob AT the
 * hero's level is neutral (×1), so `referenceMobXp` (the curve's anchor) is
 * untouched — this only reshapes XP where a difficulty's mob-level CAPS push the
 * horde off the hero's level.
 */
export function levelDiffXpMult(mlvl: number, playerLevel: number): number {
  const diff = Math.max(1, mlvl) - Math.max(1, playerLevel);
  const rest = Math.max(0, BALANCE.restXp);
  if (diff >= 0) {
    return Math.min(
      LEVELING.xpAboveMaxMult,
      1 + diff * LEVELING.xpAbovePlayerPerLevel * rest,
    );
  }
  return Math.max(0, 1 + diff * LEVELING.xpBelowPlayerPerLevel * rest);
}

/**
 * A reference minion's worth of XP at `level`: `mobLevelXp` for a mob AT the
 * hero's own level. This is the "typical mob" unit the KILLS-per-level curve
 * is authored against (see `xpToLevelUp`), reused as the COLD arrow's payout
 * unit so "5 mob kills" means the same thing to the game and the calculator.
 */
export function referenceMobXp(level: number): number {
  const l = Math.max(1, level);
  return mobLevelXp(l, l);
}

/**
 * The COLD golden-arrow payout at `level`: a flat `arrowColdMobXpMult` mob
 * kills' worth of XP (see `referenceMobXp`). Handed out instead of the
 * share-of-bar once the hero passes the current map/difficulty's
 * `arrowCapByDifficulty` — a catch-up faucet that runs dry once the content
 * has given all the levels it is meant to. Read by the pickup handler and the
 * calculator alike.
 */
export function arrowColdXp(level: number): number {
  return Math.max(
    1,
    Math.round(LEVELING.arrowColdMobXpMult * referenceMobXp(level)),
  );
}

/**
 * The XP needed to cross OUT of `level` (from L to L+1) — the single source of
 * truth for the level curve, walked by `grantXp` (loot.ts), the initial bar
 * (create.ts), and the arrival derivation (arrival.ts).
 *
 * The curve is DATA, not a formula: `content/leveling.yaml` authors the raw XP
 * for every level up to the cap (compiled to `src/generated/leveling.ts` by
 * `make levels`), each row annotated with its kills-per-level equivalent
 * against the level-priced reference minion (`referenceMobXp` — `mobLevelXp`
 * for a mob at the hero's own level). Two knobs still apply ON TOP of the
 * table, because they aren't per-level facts of the shared curve: the
 * per-difficulty `tierLevelCostMult` (nightmare/jesus rungs cost more) and the
 * `endgameSteepenMult` wall past level 70 — both runtime-tunable on the
 * DEVELOPER → BALANCE page. Levels at/past the cap read the last row (the bar
 * pins full there anyway — `grantXp` stops banking at `maxLevel`).
 */
export function xpToLevelUp(level: number, difficulty?: Difficulty): number {
  const l = Math.max(1, level);
  const xp = XP_TO_NEXT[Math.min(l, XP_TO_NEXT.length) - 1] ?? 1;
  return Math.round(xp * endgameSteepenMult(l) * tierLevelCostMult(difficulty));
}

/**
 * ENDGAME STEEPENING factor for a level (config `endgameSteepenFrom`/Rate, dev
 * knob `BALANCE.endgameSteepen`): 1 up to the threshold, then a compounding
 * `(1 + rate)` per level past it, so the last stretch to the cap walls up.
 * Shared by every difficulty — it is a property of the level curve itself.
 */
export function endgameSteepenMult(level: number): number {
  const over = level - LEVELING.endgameSteepenFrom;
  if (over <= 0) return 1;
  const rate = LEVELING.endgameSteepenRate * BALANCE.endgameSteepen;
  return Math.pow(1 + Math.max(0, rate), over);
}

/**
 * PER-TIER leveling slowdown for a difficulty (config `tierLevelCostStep`, dev
 * knob `BALANCE.levelingSlowdown`): `(1 + step)^tier`, where the tier is the
 * difficulty's rung above the three bottom lanes (`difficultyDef.index − 3`,
 * floored at 0 — easy/medium/hard share tier 0, nightmare 1, jesus 2). So a
 * level costs progressively more the deeper the difficulty. No difficulty (the
 * bare curve, e.g. the companion/derivation reads) is tier 0 → ×1.
 */
export function tierLevelCostMult(difficulty?: Difficulty): number {
  if (!difficulty) return 1;
  const tier = Math.max(0, difficultyDef(difficulty).index - 3);
  if (tier === 0) return 1;
  const step = Math.max(
    0,
    LEVELING.tierLevelCostStep * BALANCE.levelingSlowdown,
  );
  return Math.pow(1 + step, tier);
}

/**
 * The hero-level CEILING this (level × difficulty) pair can pay XP toward —
 * the per-map cap (config `XP_CAP`): the rung's `first`…`last` band
 * interpolated across the story order, so each map on a difficulty tops out
 * a little higher than the one before it. Re-running an outgrown map still
 * rains loot; past the cap it only trickles XP (see `xpCapMultiplier`, applied
 * in `grantXp`), never levels at pace. A difficulty outside the shipped ladder
 * (fixture rungs) is uncapped — the global `LEVELING.maxLevel` still holds in
 * `grantXp`.
 */
export function xpLevelCap(levelId: string, difficulty: Difficulty): number {
  const band = XP_CAP.capByDifficulty[difficulty];
  if (!band) return LEVELING.maxLevel;
  const { position, total } = levelPosition(levelId);
  const t = total > 1 ? position / (total - 1) : 0;
  return Math.min(
    LEVELING.maxLevel,
    Math.round(band.first + (band.last - band.first) * t),
  );
}

/**
 * How much of an XP grant a hero of `level` still collects against a map's SOFT
 * `cap` (see `xpLevelCap`): full value up to `cap − XP_CAP.fadeLevels`, then
 * decayed by `XP_CAP.softCapDecay` per level (a reverse-exponential taper — each
 * level over the cap banks a fraction of what the last did), bottoming out at
 * the never-zero `XP_CAP.floor` TRICKLE once the decay would sink below it. The
 * cap is a slope, not a wall: it slows to a glacial ~1/100 pace about two
 * levels past the cap and holds there — the grind still creeps forward forever,
 * it never slams shut. So an outgrown map rains loot and only crawls XP; the
 * global `LEVELING.maxLevel` is the only true level ceiling.
 */
export function xpCapMultiplier(level: number, cap: number): number {
  const over = level - (cap - XP_CAP.fadeLevels);
  if (over <= 0) return 1;
  return Math.max(XP_CAP.floor, Math.pow(XP_CAP.softCapDecay, over));
}
