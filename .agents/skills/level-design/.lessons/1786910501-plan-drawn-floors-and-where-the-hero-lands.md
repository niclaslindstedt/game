---
title: A floor spelled as several plan rectangles needs `ragged: false`, and `landing: true` pins the hero's CELL rather than his spot
date: 2026-08-12
scope: content/maps/, engine/game/mapgen/
concepts: [blueprint, plan, ragged, landing, player-spawn]
---

Two things bite when an authored `plan:` draws one surface as several
rectangles (the garage's lawn, the display case's hall):

- **An open district's floor is emitted RAGGED by default**, so adjacent
  rectangles of the SAME area stop short of one another and leave seams of bare
  ground running across the middle of what should read as one floor. Set
  `ragged: false` on any BUILT surface — it is what the garage's staff lot
  already does, and the map-layout render is where the seams show up.
- **`landing: true` pins the CELL, not the point.** `playerSpawn` is
  `pointIn(spawn, rng, …)` — a roll anywhere inside the landing chamber — so a
  hero landing in a 2400x1600 hall can come down against a wall. Pin it with a
  SMALL district of its own drawn where he should stand; give it the same
  `ground` and `label` and `enclosure: none` as the floor around it and the seam
  is invisible.

And the wall rule to keep in mind while drawing: two adjacent plan rooms of the
same **hard** area get a CLOSED border (a wall) unless `plan.doors` names the
pair; two `none` rooms always meet open.
