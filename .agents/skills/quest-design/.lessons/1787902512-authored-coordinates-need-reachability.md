---
title: An errand's authored `{x,y}` must be re-homed to REACHABLE ground, not just clear ground — every mission is carved fresh
date: 2026-08-28
scope: content/quests/, engine/game/quests/
concepts: [escort, placement, generated-maps, silent-regression, reachability]
---

Every mission's map is generated per run, so an authored coordinate names a
place that no longer exists. `questSpot` (`engine/game/quests/placement.ts`) has
always nudged one out of a wall — but "clear" is not "reachable", and for a
piece on the floor that is fine while for a DESTINATION it is not: a spot in a
sealed pocket, in the annex the lift rides to, or on the dead rock past the
carve is an objective that can never be met, with a marker drawn on it and
nothing on screen to say why.

Measured on the six shipped escort errands over 24 seeds each: the authored `to`
was inside an obstacle on up to 8/24 seeds, and UNREACHABLE from the hero's
spawn on 1/24 (boot_hill) to 24/24 (goodco_hq). Every one of those is a run
with a dead entry in the log. `escortSpots` now answers it with
`nearestReachable` (`engine/game/pathfind.ts`) over the run's own nav grid.

Two things to carry:

- **Measure reachability with the engine's own router**, and use the LIVE
  obstacle field. A grid built with every door dissolved says yes to rooms this
  run may never unlock; at run start only 9–49% of a map's walkable cells are in
  the hero's component, and that number is the truth an objective has to sit
  inside.
- **A new objective kind that names a coordinate owes this call**, not
  `questSpot`. The two answer different questions and the wrong one is silent.
