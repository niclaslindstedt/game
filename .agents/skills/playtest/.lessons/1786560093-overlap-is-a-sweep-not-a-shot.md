---
title: "Does the drawn thing sit inside the drawn thing" is a headless geometry sweep, not a screenshot
date: 2026-08-12
scope: engine/game/obstacles.ts, engine/game/vehicles.ts
concepts: [probes, measurement, screenshots, rendering, collision]
---

A report of the shape "X is clipping into Y" is answered by sweeping the
resting positions headlessly and printing the WORST overlap in world px, not by
cropping frames. A screenshot says something looks wrong; it cannot say by how
much, cannot separate a collision bug from correct 2.5D occlusion (a tall sprite
in FRONT of a wall legitimately paints over its face), and cannot be re-run
against the fix as a number.

The cheap rig: `createRunFromParams({seed, levelId, difficulty})` through
`scripts/game-alias-loader.mjs`, then push the body along in 0.5 px steps
through the same resolver the run uses, over a spread of lanes AND a spread of
lateral drifts — the drift is what finds the case, because head-on a chain of
discs and a box agree and only the DIAGONAL tells them apart. Report
`min(overlapX, overlapY)` against each blocker's own drawn square. Here it
turned "the car looks like it clips the jamb" into "1.94 px, at the last stone
of a wall run" and then into 0, and it caught that squaring the CAR alone did
nothing — the wall's drawn square also sticks out past its inscribed collision
circle, so both sides had to be squared.

Keep the screenshots for judging whether the fixed picture reads well. Use the
sweep for whether it is fixed.
