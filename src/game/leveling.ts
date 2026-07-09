// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Automatic base-attribute growth: the WoW-style gains leveling ITSELF grants,
// underneath the chosen stat points (config LEVELING.autoGainsPerLevel).
// Everything here is DERIVED from `player.level` — nothing is ever written
// into `player.stats`, so a respec refunds only the points the player chose.
// Kept in its own module (config + types only) so both items.ts (effective
// stats) and menace.ts (mob hp keeping pace) can read it without a cycle.

import { LEVELING, STATS } from "./config.ts";
import type { StatName } from "./types.ts";

const AUTO_GAINS: Partial<Record<StatName, number>> =
  LEVELING.autoGainsPerLevel;

/**
 * The automatic points of `stat` that crossing INTO `level` grants:
 * `round(rate × level)`, so each ding pays a little more than the last —
 * the gain scales with the level, like the level-up itself should feel.
 * Zero for stats the config leaves off the auto-growth list.
 */
export function autoGainAt(level: number, stat: StatName): number {
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
