// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// CHOSEN STAT POINTS — the trainable point budget a hero of a given level has
// banked. A pure function of the LEVELING config and nothing else, split out of
// leveling.ts into its own LEAF module (config-only, no level catalog) so the
// weapon budget (`meleeBudgetTargets` in defs/equipment.ts) can read it without
// dragging the generated level catalog into the build-time generate scripts
// (equipment.ts is imported by generate-enemies.mjs, which runs before
// src/generated/levels.ts exists). leveling.ts re-exports both so every existing
// `from "./leveling.ts"` importer is unchanged.

import { LEVELING } from "./config.ts";

/**
 * Trainable stat points crossing INTO `level` grants: the flat base plus one
 * bonus point per full `statPointsBonusEvery` levels — 1 through the opening,
 * 2 from level 10, 5 at 40, 10 at 99. The single source of truth for the
 * ding's chooser budget, read by `grantXp` (loot.ts) and the arrival
 * derivation (arrival.ts) so a derived build banks exactly what real dings
 * would have paid.
 */
export function statPointsAt(level: number): number {
  return (
    LEVELING.statPointsPerLevel +
    Math.floor(Math.max(0, level) / LEVELING.statPointsBonusEvery)
  );
}

/**
 * The cumulative TRAINABLE stat points a hero of `level` has banked — every
 * ding's `statPointsAt` from level 2 up, summed (the chosen-point mirror of
 * `baseStatBonus`). Unlike the automatic gains this is invariant to the auto
 * dev flag; it is the pool the player distributes by hand, and the anchor the
 * weapon stat requirements are sized against (`statRequirement` in items.ts):
 * a requirement asks for a fraction of what a hero could have chosen to invest
 * by the time a weapon is wieldable. Levels stay small, so the loop is cheaper
 * than keeping a stored counter honest across saves and respecs.
 */
export function chosenStatPointsThrough(level: number): number {
  let total = 0;
  for (let l = 2; l <= level; l++) total += statPointsAt(l);
  return total;
}
