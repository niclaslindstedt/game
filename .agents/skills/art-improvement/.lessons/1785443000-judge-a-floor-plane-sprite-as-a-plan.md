---
title: Check `plane:` before judging a building — a floor-plane sprite is a PLAN, not a facade
date: 2026-07-30
scope: content/sprites/
concepts: [floor-plane, judging, buildings]
---

Boot Hill's houses, `storefront`, `lair_house` and `wagon` all carry
`plane: floor`, so they are authored TOP-DOWN and the renderer lays them flat
through the projection. Read one as an elevation and every judgement is wrong:
"a plank shed with a black door slot" is actually a roof band over a plan view,
and a "redraw" that makes it a better FACADE would fight the camera.

So: `grep -l '^plane: floor' content/sprites/<family>/*.yaml` before Phase 1's
survey, and read the sprite's own `description` — the floor-plane ones say
"seen top-down" out loud.

The second half of this is more useful: a family usually already contains ONE
floor-plane building somebody took seriously, and it is the quality bar for the
rest. Here `lair_house` had diagonal shingle courses, a painted eave band,
weathered plank speckle, shuttered windows and porch lamps, while the three
`house_*` sprites next to it had a flat roof, a uniform wall and one black
door. Diff the weak ones against the good one before sketching anything — the
brief writes itself, and the result lands in the family's existing style
instead of inventing a second one.
