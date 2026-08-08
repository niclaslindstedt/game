// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE BLUEPRINT REGISTRY — which mission may be carved, and out of whose recipe.
//
// A LEAF on purpose. Its only import that carries bytes is the compiled
// blueprint catalog itself, so `defs/registry.ts` can hand a MOD's blueprints in
// (`registerDefs({ blueprints })`) without the def registry pulling `generate.ts`
// — the carve, the dressing passes and the whole area rule engine — in behind
// it. The same move `flags.ts` makes for the engine's runtime toggles: the STATE
// lives where nothing else does, and the module that does the work reads it.
//
// The registry is MUTABLE for exactly one reason: a mod may ship
// `maps/<id>.yaml` beside its `levels/<id>.yaml`, so its venue is carved fresh
// per run like a shipped one rather than being permanently hand-drawn. It is
// swapped through `registerDefs` alongside the level catalog, and restored with
// it when a modded run ends (pwa/src/game/mods.ts) — a mod applies to a RUN,
// never to the install.

import { GENERATED_MAP_BLUEPRINTS } from "../../generated/map-blueprints.ts";
import type { MapBlueprint } from "./types.ts";

/** Merge the compiled blueprints into one registry, failing loudly on a
 * duplicate id (which the compile step already rejects — this is the belt to
 * its braces, mirroring `mergeLevels`). */
function mergeBlueprints(defs: MapBlueprint[]): Record<string, MapBlueprint> {
  const merged: Record<string, MapBlueprint> = {};
  for (const def of defs) {
    if (def.id in merged)
      throw new Error(`duplicate map blueprint "${def.id}"`);
    merged[def.id] = def;
  }
  return merged;
}

/** Every mission the GAME ships a generator blueprint for, keyed by level id.
 * The shipped catalog, never the active one — `mods.ts` reads it to know what
 * to merge a mod's onto and what to put back afterwards. */
export const MAP_BLUEPRINTS: Record<string, MapBlueprint> = mergeBlueprints(
  GENERATED_MAP_BLUEPRINTS,
);

// The active registry the accessors read (defaults to the shipped catalog; mods
// and tests swap it via `registerDefs`). See engine/game/defs/registry.ts.
let activeBlueprints: Record<string, MapBlueprint> = MAP_BLUEPRINTS;

/** Mod/test hook: replace the active blueprint catalog. */
export function setMapBlueprints(defs: Record<string, MapBlueprint>): void {
  activeBlueprints = defs;
}

/** The blueprint for a level, or null when the mission has none (in which case
 * GENERATED MAPS simply plays the hand-authored map). */
export function mapBlueprint(levelId: string): MapBlueprint | null {
  return activeBlueprints[levelId] ?? null;
}

/** Whether a generated run of this mission is possible at all. */
export function hasMapBlueprint(levelId: string): boolean {
  return levelId in activeBlueprints;
}
