// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The one seam GENERATED MAPS hangs off. (The blueprint REGISTRY itself is the
// leaf `blueprints.ts`, re-exported here, so the def registry can swap a mod's
// recipes in without importing the carve.)
//
// `createGame` used to read `levelDef(levelId)` directly. It now asks
// `resolveLevelDef`, which carves the mission's map fresh from its blueprint on
// the run's own seed. That is the whole integration: one call site, and every
// system downstream reads a plain `LevelDef` with no idea where it came from.
//
// The compiled blueprints live in `engine/generated/map-blueprints.ts` (gitignored,
// regenerated on build from `content/maps/*.yaml` by
// `scripts/generate-maps.mjs`), and NOTHING outside a run imports this module —
// the title menu reaches levels through `defs/levels/summary.ts`, so the
// generator's bytes stay off the app's critical path.

import { handAuthoredLevel, levelDef } from "../defs/levels/index.ts";
import type { LevelDef } from "../defs/levels/types.ts";
import { mapBlueprint } from "./blueprints.ts";
import { generateLevel } from "./generate.ts";

// The registry itself lives in the import-free leaf `blueprints.ts`, so the def
// registry can swap a mod's blueprints in without dragging the generator along.
export {
  hasMapBlueprint,
  mapBlueprint,
  MAP_BLUEPRINTS,
  setMapBlueprints,
} from "./blueprints.ts";
export { generateLevel } from "./generate.ts";
export {
  carveChambers,
  doorDistances,
  planChambers,
  wallSegments,
} from "./rooms.ts";
export { parseRegion, regionRect } from "./regions.ts";
export type {
  MapBlueprint,
  MapObject,
  MapObjectType,
  MapPlan,
  MapSetPiece,
  MapSizeSpec,
} from "./types.ts";

/**
 * The level a run is built from: a chamber grid carved from the mission's
 * blueprint, on the run's own seed.
 *
 * The seed is the run's own, so the map and the run replay together — a bug
 * found on a carve is reproducible from `?seed=` exactly like one found on a
 * hand-drawn map used to be.
 *
 * A mission with NO blueprint is answered with itself, and that is the narrow
 * door rather than a fallback: only a synthetic catalog installed through
 * `registerDefs` (the engine fixtures, a mod that hand-draws a venue) can be
 * one, and `handAuthoredLevel` refuses it if it has no map either.
 *
 * @param levelId the mission
 * @param seed    the run seed `createGame` was handed
 */
export function resolveLevelDef(levelId: string, seed: number): LevelDef {
  const base = levelDef(levelId);
  const blueprint = mapBlueprint(levelId);
  if (!blueprint) return handAuthoredLevel(base);
  // A pinned blueprint (`carveSeed`) carves on its constant rather than the
  // run's seed — the STATIC hub. The run itself still lives on `seed`.
  const carveSeed = blueprint.carveSeed ?? seed;
  return generateLevel(blueprint, base, carveSeed);
}
