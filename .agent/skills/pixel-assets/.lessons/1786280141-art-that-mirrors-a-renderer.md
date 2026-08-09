---
title: Art depicting something the RENDERER also draws must take its colours from that renderer's table
date: 2026-08-09
scope: content/sprites/scenes/
concepts: [drift, palette, reuse, testing, cutscenes]
---

`content/sprites/scenes/road_lane.yaml` drew the road past the hero's lot in
six greys invented for the tile — while the drive minigame paints the SAME road,
thirty seconds later, as flat fills in its own four (`ROAD_INK`,
`pwa/src/game/drive-screen/scenery.ts`). Two tarmacs, two traffic whites, one
road. Nobody notices until both are on screen inside a minute, which the garage
scenes and the drive's opening are.

When authored art depicts a thing the game also draws in code, take the code's
colours hex for hex, name the constant in the palette comments, and PIN the pair
with a test (`tests/content/road_ink_test.ts`) — a sprite cannot import a
constant, so the test is the only seam there is. Match the code's other
decisions too: the drive's tarmac is a flat fill with no aggregate speckle, so
the tile's speckle was not extra detail, it was a second road.

Where a rhythm has to repeat across tiles, round the code's own figure to a
cycle the tile's width divides (the drive's 12-on/14-off centre line became
12-on/16-off on a 56-px tile) — otherwise a row of tiles comes out as a line
with a stutter in it every tile.
