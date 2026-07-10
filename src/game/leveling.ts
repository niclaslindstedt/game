// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Automatic base-attribute growth: the WoW-style gains leveling ITSELF grants,
// underneath the chosen stat points (config LEVELING.autoGainsPerLevel).
// Everything here is DERIVED from `player.level` — nothing is ever written
// into `player.stats`, so a respec refunds only the points the player chose.
// Kept in its own module (config + types only) so both items.ts (effective
// stats) and menace.ts (mob hp keeping pace) can read it without a cycle.

import { LEVELING, MENACE, STATS } from "./config.ts";
import type { StatName } from "./types.ts";

const AUTO_GAINS: Partial<Record<StatName, number>> =
  LEVELING.autoGainsPerLevel;

// Developer feature flag (website settings `autoLevelStats`, applied via the
// `setAutoStatGainsEnabled` setter): whether the automatic per-level base-stat
// growth is active. Flipping it off makes `autoGainAt` return 0, which
// CASCADES through every derivation in this module — `baseStatBonus`,
// `levelStatGains`, and `autoPowerScale` all fall to their neutral values — so
// the hero stops banking free stats AND the horde's compensating hp scale
// (menace.ts folds `autoPowerScale` into `mobHpScaleFor`/`enemyPowerScale`)
// drops in lockstep, keeping the balance consistent. The engine default is on
// (the standalone/test baseline when no app configures it); the shipped app
// makes the flag opt-in and applies `setAutoStatGainsEnabled(false)` on load
// unless the developer turns it on. Tests toggle it and must restore it.
let autoStatGainsEnabled = true;

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
 * The damage-output multiplier the AUTOMATIC gains alone hand a hero of
 * `level`: the STR damage curve times the DEX cadence curve, exactly as
 * `weaponDamage`/`weaponCooldownFor` would apply those points. The horde's
 * hp scaling multiplies by this same number (`mobHpScaleFor`,
 * `enemyPowerScale` in menace.ts), so the free growth cancels out against
 * the crowd and only CHOSEN points, gear, and skill move the player ahead
 * of the curve — the ding feels mighty without turning the campaign into
 * one-hit kills.
 */
export function autoPowerScale(level: number): number {
  return (
    (1 +
      baseStatBonus(level, "strength") * STATS.damageBonusPerPoint.strength) *
    (1 + baseStatBonus(level, "dexterity") * STATS.attackSpeedPerStat)
  );
}

/**
 * The share of the CURRENT level bar a golden arrow grants at `level`: the
 * base share (`LEVELING.arrowXpShare`) decayed harmonically by
 * `LEVELING.arrowXpShareTaper`, so arrows pay a full quarter-level early and a
 * thin sliver near the cap. The single source of truth for the arrow payout,
 * read by the pickup handler (step.ts) and the leveling-curve calculator
 * (scripts/leveling-curve.mjs) alike, so the model and the game never drift.
 */
export function arrowXpShareAt(level: number): number {
  const l = Math.max(1, level);
  return LEVELING.arrowXpShare / (1 + LEVELING.arrowXpShareTaper * (l - 1));
}

/**
 * The XP needed to cross OUT of `level` (from L to L+1) — the single source of
 * truth for the level curve, walked by `grantXp` (loot.ts), the initial bar
 * (create.ts), and the arrival derivation (arrival.ts).
 *
 * The curve is authored in KILLS, not raw XP: each level costs
 * `killsPerLevel(L)` of a reference mob's worth of XP, where that mob's
 * toughness mirrors `mobHpScaleFor` at the neutral offset — the flat per-level
 * hp ramp (`MENACE.mobHpPerLevel`) times the automatic-stat damage curve
 * (`autoPowerScale`). Kill XP is hp-proportional, so the `autoPowerScale`
 * factor here CANCELS against the same factor in the mobs the hero is killing:
 * the number of kills a level takes is invariant to the auto-stat dev flag and
 * to how hard the hero hits, and rises only on the gentle geometric
 * `killsPerLevelGrowth`. That is what makes leveling taper predictably —
 * ~10–20 levels/day early, easing to ~2/day near the cap — instead of the old
 * pure-exponential bar that raced early then walled.
 */
export function xpToLevelUp(level: number): number {
  const l = Math.max(1, level);
  // Onboarding ramp: the opening levels cost a fraction of the curve so the
  // first ding is quick, easing to full by `earlyRampLevels`.
  const ramp = Math.min(
    1,
    LEVELING.earlyRampStart +
      ((1 - LEVELING.earlyRampStart) * (l - 1)) / LEVELING.earlyRampLevels,
  );
  const kills =
    LEVELING.killsPerLevelBase *
    Math.pow(LEVELING.killsPerLevelGrowth, l - 1) *
    ramp;
  const referenceMobXp =
    LEVELING.refMobHp *
    (1 + (l - 1) * MENACE.mobHpPerLevel) *
    autoPowerScale(l) *
    LEVELING.xpPerHp;
  return Math.round(kills * referenceMobXp);
}
