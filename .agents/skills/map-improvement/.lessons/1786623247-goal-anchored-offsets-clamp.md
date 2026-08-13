---
title: Moving a blueprint's `goal` room moves every `at: goal` fixture with it — and an offset that lands off-map is silently CLAMPED, not rejected
date: 2026-08-13
scope: content/maps/, engine/game/mapgen/
concepts: anchors, offsets, landmarks, plan-rooms, silent-clamp
---

Moving the garage's rocket meant moving the `pad` room its `plan.goal` names —
which is right, because the burnt patch, the ring of trees, the yard light and
the ship are all `at: goal` and have to travel together. The trap is what
happens to the ones whose authored `offset` then points off the map:
`anchorPos` in `engine/game/mapgen/generate.ts` clamps the result to
`[0, width] × [0, height]`, so a tree authored 140 px west of a goal that now
sits 80 px from the edge does not fail the build — it stands ON the boundary,
stacked with anything else that overflowed the same way. `make levels` is
green and the layout render is the only thing that shows it.

So after moving a `goal` (or any anchor), walk EVERY object anchored to it and
add its offset by hand before rendering: any coordinate outside the map is a
piece that needs re-homing, and a piece whose NAME encodes the old geometry
(`lawn_tree_west`, once the pad is in the west) needs renaming with it.
`node scripts/map-layout.mjs <id>` is the check — its grid is world
coordinates, so a fixture pinned against the edge reads immediately.
