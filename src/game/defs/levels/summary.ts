// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The level catalog as anything OUTSIDE a run sees it: the story order, the
// secret venues, and the name/`foes` label of each level.
//
// A LEAF next to `index.ts` — it reads `generated/level-index.ts` (the compiled
// summaries) and nothing else, where its neighbour reads the whole compiled
// catalog: every wall, spawner, wave budget, loot table and decor prop of every
// map. The difficulty ladder, the level picker, the high-score board and a
// saved run's id check need none of that, so they come here and the maps stay
// out of the app's startup chunk (see pwa/scripts/check-seo.mjs's critical-path
// budget). Inside a run, `levelDef()` next door still answers with the whole
// def.
//
// `setLevelSummaries` keeps the `registerDefs` seam honest: a fixture catalog
// installed through `setLevelDefs` pushes its summaries here too, so a swapped
// catalog answers for itself on both sides.

import {
  GENERATED_CAMPAIGN_ORDER,
  GENERATED_LEVEL_SUMMARIES,
  GENERATED_SECRET_ORDER,
  type GeneratedLevelSummary,
} from "../../../generated/level-index.ts";

/** A level as the menus see it: what to call it, and what it is full of. */
export type LevelSummary = GeneratedLevelSummary;

/**
 * Story order of the campaign levels (see SECRET below). Compiled from each
 * YAML level's `campaign: true` flag, sorted by story `index`.
 */
export const LEVEL_ORDER: string[] = GENERATED_CAMPAIGN_ORDER;

/**
 * SECRET venues: playable levels deliberately OUTSIDE the campaign order — no
 * unlock chain, no NEXT LEVEL slot, no per-level achievement badge, no "beaten
 * difficulty" trigger. They resolve through `levelDef` like any level, but only
 * a travel gate (or a dev warp) reaches them. Compiled from each YAML level's
 * `secret: true` flag; the dev warp picker's extra rows.
 */
export const SECRET_LEVEL_ORDER: string[] = GENERATED_SECRET_ORDER;

// The active summaries (defaults to the shipped catalog; `setLevelDefs`
// re-derives them when a fixture catalog is installed).
let activeSummaries: Record<string, LevelSummary> = GENERATED_LEVEL_SUMMARIES;

/** Test/authoring hook, driven by `setLevelDefs` — never called directly. */
export function setLevelSummaries(
  summaries: Record<string, LevelSummary>,
): void {
  activeSummaries = summaries;
}

/** Whether the active catalog carries `levelId` — the check a stored id needs
 * (a save may name a level a later content revision retired). */
export function hasLevel(levelId: string): boolean {
  return levelId in activeSummaries;
}

/** A level's menu-facing summary; throws on a broken id, like `levelDef`. */
export function levelSummary(levelId: string): LevelSummary {
  const summary = activeSummaries[levelId];
  if (!summary) throw new Error(`unknown level "${levelId}"`);
  return summary;
}
