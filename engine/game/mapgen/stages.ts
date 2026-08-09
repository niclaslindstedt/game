// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE VENUE LOOKS LIKE BY NOW — the blueprint's staged dressing, resolved
// against the run's own memory BEFORE a single cell is carved.
//
// IT IS A PRE-PASS ON PURPOSE, and that is the whole of the design. The
// alternative — teaching `generate.ts` to ask "which rung are we on" wherever it
// reads a ground pair or a sprite — would put the campaign's memory inside the
// carve, where it is one forgotten branch away from changing an rng draw. Here
// it cannot: `resolveStages` hands `generateLevel` a plain blueprint with the
// rungs already picked, so the carve is the same carve on every rung and the
// only difference between a green lawn and a burnt one is which tile name the
// floor was laid with.
//
// That property is load-bearing twice over. It is what keeps the hub's trees
// standing in the same places all campaign (a lot whose furniture moved when it
// burnt would read as a different lot), and it is what makes the whole feature
// safe in a session: the host and an arriving client derive their tags from the
// same session parameter (`RunParams.clearedLevels`), so they resolve the same
// blueprint and carve the same world — and even a client that somehow did not
// would still get a world of the same SHAPE, differing only in paint.

import type { MapArea, MapStage } from "./areas.ts";
import { stageApplies } from "./areas.ts";
import type { MapBlueprint, MapObject } from "./types.ts";

/** The rungs that hold for this run, in author order — the LAST one wins per
 * field, so a ladder is written worst-last and reads as one. */
function held(
  stages: MapStage[] | undefined,
  tags: readonly string[],
): MapStage[] {
  if (!stages || stages.length === 0) return [];
  return stages.filter((s) => stageApplies(s, tags));
}

/** An area wearing whatever floor the campaign has left it. */
function stageArea(area: MapArea, tags: readonly string[]): MapArea {
  const rungs = held(area.stages, tags);
  if (rungs.length === 0) return area;
  let out = area;
  for (const rung of rungs) {
    if (rung.ground) out = { ...out, ground: rung.ground };
    if (rung.patch) out = { ...out, patch: rung.patch };
  }
  return out;
}

/** …and a palette entry wearing whatever the campaign has left IT. */
function stageObject(obj: MapObject, tags: readonly string[]): MapObject {
  const rungs = held(obj.stages, tags);
  if (rungs.length === 0) return obj;
  let out = obj;
  for (const rung of rungs) {
    if (rung.sprite) out = { ...out, sprite: rung.sprite };
  }
  return out;
}

/**
 * The blueprint this run should be carved from, given what the hero has already
 * put behind him.
 *
 * `tags` are the run's own — `cleared:<levelId>` per level cleared, the same
 * list a cutscene's props are matched against (`createGame`). Handed none,
 * every ladder answers as though nothing has happened yet, which is the right
 * reading for a fresh hero AND for anything asking about a venue outside a run
 * (the roster estimate, the map tooling, a test).
 *
 * A blueprint with no ladders anywhere is handed back UNTOUCHED rather than
 * cloned — which is every venue in the game but the hub, and is why this pass
 * costs nothing on the other six.
 */
export function resolveStages(
  bp: MapBlueprint,
  tags: readonly string[] = [],
): MapBlueprint {
  const staged =
    bp.areas.some((a) => a.stages?.length) ||
    bp.objects.some((o) => o.stages?.length);
  if (!staged) return bp;
  return {
    ...bp,
    areas: bp.areas.map((a) => stageArea(a, tags)),
    objects: bp.objects.map((o) => stageObject(o, tags)),
  };
}
