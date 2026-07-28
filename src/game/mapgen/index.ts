// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The MAP BLUEPRINT registry and the one seam GENERATED MAPS hangs off.
//
// `createGame` used to read `levelDef(levelId)` directly. It now asks
// `resolveLevelDef`, which answers with the hand-authored map unless the
// developer flag is on AND the mission ships a blueprint — in which case it
// carves a fresh one from the run's own seed. That is the whole integration: one
// call site, one flag, and every system downstream keeps reading a plain
// `LevelDef` with no idea which kind it got.
//
// The compiled blueprints live in `src/generated/map-blueprints.ts` (gitignored,
// regenerated on build from `content/maps/*.yaml` by
// `scripts/generate-maps.mjs`), and NOTHING outside a run imports this module —
// the title menu reaches levels through `defs/levels/summary.ts`, so the
// generator's bytes stay off the app's critical path.

import { GENERATED_MAP_BLUEPRINTS } from "../../generated/map-blueprints.ts";
import { levelDef } from "../defs/levels/index.ts";
import type { LevelDef } from "../defs/levels/types.ts";
import {
  generatedMapSizeSetting,
  isGeneratedMapsEnabled,
  type MapSizeName,
} from "../flags.ts";
import { generateLevel, resolveMapSize } from "./generate.ts";
import type { MapBlueprint } from "./types.ts";

export { generateLevel, resolveMapSize } from "./generate.ts";
export { carveChambers, doorDistances, wallSegments } from "./rooms.ts";
export { parseRegion, regionRect } from "./regions.ts";
export type {
  MapBlueprint,
  MapObject,
  MapObjectType,
  MapSetPiece,
  MapSizeName,
  MapSizeSpec,
} from "./types.ts";

/** Merge the compiled blueprints into one registry, failing loudly on a
 * duplicate id (which the compile step already rejects — this is the belt to
 * its braces, mirroring `mergeLevels`). */
function mergeBlueprints(defs: MapBlueprint[]): Record<string, MapBlueprint> {
  const merged: Record<string, MapBlueprint> = {};
  for (const def of defs) {
    if (def.id in merged) throw new Error(`duplicate map blueprint "${def.id}"`);
    merged[def.id] = def;
  }
  return merged;
}

/** Every mission that ships a generator blueprint, keyed by level id. */
export const MAP_BLUEPRINTS: Record<string, MapBlueprint> = mergeBlueprints(
  GENERATED_MAP_BLUEPRINTS,
);

/** The blueprint for a level, or null when the mission has none (in which case
 * GENERATED MAPS simply plays the hand-authored map). */
export function mapBlueprint(levelId: string): MapBlueprint | null {
  return MAP_BLUEPRINTS[levelId] ?? null;
}

/** Whether a generated run of this mission is possible at all. */
export function hasMapBlueprint(levelId: string): boolean {
  return levelId in MAP_BLUEPRINTS;
}

/**
 * The level a run should be built from: the hand-authored map, or a chamber grid
 * carved from the mission's blueprint when GENERATED MAPS is on.
 *
 * The seed is the run's own, so the map and the run replay together — a bug
 * found on a generated map is reproducible from `?seed=` exactly like one found
 * on an authored map.
 *
 * @param levelId the mission
 * @param seed    the run seed `createGame` was handed
 * @param size    override the setting's size (the preview tooling passes one)
 */
export function resolveLevelDef(
  levelId: string,
  seed: number,
  size?: MapSizeName,
): LevelDef {
  const base = levelDef(levelId);
  if (size === undefined && !isGeneratedMapsEnabled()) return base;
  const blueprint = mapBlueprint(levelId);
  if (!blueprint) return base;
  const carved =
    size ?? resolveMapSize(blueprint, generatedMapSizeSetting(), seed);
  return generateLevel(blueprint, base, seed, carved);
}
