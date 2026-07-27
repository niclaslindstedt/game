---
title: A reader's map is the place drawn, not a diagram of it
date: 2026-07-27
---

The plan's open question — which map render the mission pages use — offered two
options, and both were wrong in the same way: the developer render with its
instrumentation stripped, or a fresh schematic of walls, a route and markers.
A schematic tells a reader the SHAPE of a place and nothing about the place. It
also invites exactly the creep the pages should avoid — labels, legends, con
colours — because once you are drawing symbols there is always one more worth
adding.

What a reader wants is the level DRAWN: the ground the renderer tiles, the
decor, the walls and buildings, the landmarks and the horde, at true world
coordinates, shrunk until it fits. `scripts/level-render.mjs` already did that
for art passes — check the repo for the picture you want before building one.

Two things make it truthful rather than merely pretty:

- Draw the DORMANT population too (`--dormant`): the sleeping packs and each
  spawn point's queued mobs, capped at the point's own alive cap and drawn at
  its own scatter radius. `createGame` only mints the opening scatter and the
  pinned set pieces, so without them a busy venue renders as empty ground.
- Say in the caption which parts are a likeness: the built geometry is exact,
  the scatter re-rolls every run. One fixed seed keeps the picture stable across
  builds.

Downscale with a real resample, not nearest-neighbour. Past about half scale,
picking one pixel in n drops every thin wall and most of the rubble.
