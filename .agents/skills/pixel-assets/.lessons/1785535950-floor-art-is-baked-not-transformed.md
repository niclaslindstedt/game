---
title: Art that lies on the FLOOR is baked through the projection, never drawn through it
date: 2026-08-01
scope: content/sprites/
concepts: [floor-plane, projection, baking]
---

A pass that blits pixel art inside `applyWorldProjection` is resampled every
frame, and a nearest-neighbour squash picks which rows to drop from the
DESTINATION offset. At the shipped pitch (0.75) a world unit of northward travel
moves that offset three quarters of a pixel, so every piece re-picks its dropped
rows at its own moment and the art visibly WOBBLES against the baked ground
layer — while walking east or west looks perfect, because there the projection is
the identity and `computeCamera` rounds to a whole world unit. That asymmetry is
the tell, and it is why the blood floor and the boot prints read as "wobbles on
some axes" rather than as a resample.

Bake it instead: `bakeFlat` (render/caches.ts) squashes the art once, and
`drawFloorDecal` (render/plane.ts) blits it in SCREEN space at the piece's own
`bodyAnchor*` seat. Hold the bake in the pass's own cache and drop that cache on
a `projectionKey()` change, as `flatSprite` does — DEVELOPER → VISUALS is a pair
of sliders, so keying per projection would mint a canvas per pixel of drag.
