---
title: A carved map is only half-installed until every runtime read goes through it
date: 2026-07-28
---

`resolveLevelDef` is described as the ONE seam the generator hangs off, and it is
— for BUILDING the world. It is not the seam a run READS the level through. Some
fifty call sites across the engine and the app asked `levelDef(state.level.id)`
mid-run, which answers with the CATALOG def: the hand-authored map, on a run being
played on a carved one.

Nothing crashes, nothing logs, and the map looks perfect in every render — the
generator's output is fine. What breaks is everything the run asks for later:

- `insideNoSpawnZone` / the spawn-point summon spot honoured the AUTHORED safe and
  quiet zones, suppressing the horde on patches of ground picked by another map.
- `nextPathWaypoint` read the AUTHORED `path`, so the guidance arrow the whole
  feature exists to silence was still up, pointing at a landmark that isn't there.
- `stepSpawner` read the AUTHORED `waves`, so generated the_bunker ran the endless
  wave budget the carve had dropped, on top of its own knots.
- `stepLairs` index-matches `state.lairs` against the def's `lairs`; the authored
  bunker/boot_hill have none, so the doors never opened and their elites — with
  their dialogue, last words and drops — were never in the run at all.
- the `reachExit` objective, `openingStrike`'s position and the area captions all
  came from the other map's coordinates.

Grep for `levelDef(state` before believing any level-shaped behaviour on a carved
map. The fix is `runLevelDef(state)` (carve on the state, catalog as fallback).

