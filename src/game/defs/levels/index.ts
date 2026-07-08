// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The level registry: one LevelDef per file under this directory (spacez_hq,
// moon, …), merged into LEVELS here and ordered by LEVEL_ORDER. This split
// keeps each level's ~250 lines of geometry, walls, waves, and loot in its
// own file so the catalog scales to 20+ levels without any file passing the
// source-size cap. Merging throws loudly on a duplicate id.

import type { LevelDef } from "./types.ts";

import { MARS } from "./mars.ts";
import { MOON } from "./moon.ts";
import { THE_RIFT } from "./rift.ts";
import { SPACEZ_HQ } from "./spacez_hq.ts";

export type { LevelDef, SpawnSpec, WaveBudget, WaveSpec } from "./types.ts";

/**
 * The levels in story order. Adding a level = a new file + one entry here;
 * `index.ts` keeps the order and the merged map in one place so the app,
 * the campaign progression, and the tests all read the same source.
 */
const ORDERED: LevelDef[] = [SPACEZ_HQ, MOON, MARS, THE_RIFT];

/** Merge the ordered defs into one registry, failing loudly on a duplicate
 * id so a clash surfaces at module load, not as a silently shadowed level. */
function mergeLevels(ordered: LevelDef[]): Record<string, LevelDef> {
  const merged: Record<string, LevelDef> = {};
  for (const def of ordered) {
    if (def.id in merged) {
      throw new Error(`duplicate level id "${def.id}"`);
    }
    merged[def.id] = def;
  }
  return merged;
}

export const LEVELS: Record<string, LevelDef> = mergeLevels(ORDERED);

/** Story order of the levels shipped so far. */
export const LEVEL_ORDER: string[] = ORDERED.map((def) => def.id);

// Active registry the accessor reads (defaults to the shipped catalog;
// tests swap in fixtures via `registerDefs`). See src/index.ts.
let activeLevels: Record<string, LevelDef> = LEVELS;

/** Test/authoring hook: replace the active level catalog. */
export function setLevelDefs(defs: Record<string, LevelDef>): void {
  activeLevels = defs;
}

/** Look up a level def; throws on a broken id so bugs surface loudly. */
export function levelDef(levelId: string): LevelDef {
  const def = activeLevels[levelId];
  if (!def) throw new Error(`unknown level "${levelId}"`);
  return def;
}

/**
 * Every active level with a LOWER story index than `levelId`, ascending —
 * the campaign the hero has already cleared by the time this level opens.
 * Reads the active registry, so tests that install fixture catalogs get
 * fixture answers.
 */
export function levelsBefore(levelId: string): LevelDef[] {
  const target = levelDef(levelId);
  return Object.values(activeLevels)
    .filter((def) => def.index < target.index)
    .sort((a, b) => a.index - b.index);
}
