// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The level registry: one LevelDef per file under this directory (spacez_hq,
// moon, …), merged into LEVELS here and ordered by LEVEL_ORDER. This split
// keeps each level's ~250 lines of geometry, walls, waves, and loot in its
// own file so the catalog scales to 20+ levels without any file passing the
// source-size cap. Merging throws loudly on a duplicate id.

import type { LevelDef } from "./types.ts";

import { THE_BUNKER } from "./bunker.ts";
import { EASTWORLD } from "./eastworld.ts";
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
const ORDERED: LevelDef[] = [SPACEZ_HQ, MOON, MARS, THE_RIFT, EASTWORLD];

/**
 * SECRET levels: playable venues deliberately OUTSIDE the campaign order —
 * no unlock chain, no NEXT LEVEL slot, no per-level achievement badge, no
 * "beaten difficulty" trigger. They resolve through `levelDef` like any
 * level, but only a travel gate (or a dev warp) reaches them. Each shares a
 * story `index` with its campaign peer so `levelPosition`'s interpolation
 * axis (the per-map XP caps) never shifts under the shipped maps.
 */
const SECRET: LevelDef[] = [THE_BUNKER];

/** Merge the defs into one registry, failing loudly on a duplicate
 * id so a clash surfaces at module load, not as a silently shadowed level. */
function mergeLevels(defs: LevelDef[]): Record<string, LevelDef> {
  const merged: Record<string, LevelDef> = {};
  for (const def of defs) {
    if (def.id in merged) {
      throw new Error(`duplicate level id "${def.id}"`);
    }
    merged[def.id] = def;
  }
  return merged;
}

export const LEVELS: Record<string, LevelDef> = mergeLevels([
  ...ORDERED,
  ...SECRET,
]);

/** Story order of the levels shipped so far (campaign only — see SECRET). */
export const LEVEL_ORDER: string[] = ORDERED.map((def) => def.id);

/** The secret venues' ids — the dev warp picker's extra rows. */
export const SECRET_LEVEL_ORDER: string[] = SECRET.map((def) => def.id);

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
 * Every GEAR id some ACTIVE level's travel gate opens with
 * (`LevelDef.gates[].opensWith`) — the keys the scrap sweep must never treat
 * as junk, however worthless their stats read. Reads the active registry so
 * fixture catalogs answer for themselves.
 */
export function gateKeyIds(): string[] {
  return Object.values(activeLevels).flatMap((def) =>
    (def.gates ?? []).map((g) => g.opensWith),
  );
}

/**
 * Where `levelId` sits in the ACTIVE story order: its 0-based position among
 * the distinct story indexes, and how many there are — the interpolation axis
 * per-map rules (the XP caps in leveling.ts) scale along. Variants sharing an
 * index (fixture catalogs do this) count once, like `deriveArrivalLoadout`.
 */
export function levelPosition(levelId: string): {
  position: number;
  total: number;
} {
  const target = levelDef(levelId);
  const indexes = [
    ...new Set(Object.values(activeLevels).map((def) => def.index)),
  ].sort((a, b) => a - b);
  return { position: indexes.indexOf(target.index), total: indexes.length };
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
