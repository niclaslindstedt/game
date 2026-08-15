---
title: A district's floor is grown out to the 16 px tile grid, so a plan row landing mid-tile is claimed by BOTH sides — and every unclaimed tile shows the MISSION's ground
date: 2026-08-15
scope: content/maps/, content/levels/, engine/game/mapgen/place.ts
concepts: [ground, districts, plan-rooms, tile-grid, ragged, false-green]
---

Two coupled facts settle how a seam between two grounds actually draws, and
missing either produces the same symptom: a patch of the wrong ground smeared
where nothing put it.

**Zone rects are snapped OUTWARD** (`snapToTiles`, `GROUND_TILE = 16`). So a
plan row boundary at an odd y — the garage's was 280 — is inside a tile row, and
BOTH the district above and the one below grow into it. Which one draws is
`groundTileName`'s first-match over `tiles.zones`, i.e. chamber order, which is
not a thing a blueprint author is thinking about. Put a boundary the player will
SEE on a multiple of 16 and the ambiguity is gone: a bite can then only snap
back to the boundary it was taken from.

**An open district's floor is also emitted RAGGED** (`raggedRects`) — columns
bitten top and bottom — and a bite bigger than a tile leaves a genuine gap. What
shows through that gap is `MissionDef.tiles.ground`, the level-wide ground. So
that field must be the venue's OUTDOOR ground; a room's floor there (the garage
had `cement_0`) paints slabs of garage floor out on the lawn at every seam. A
built surface — a driveway, a car park, a road — sets `ragged: false` and keeps
its kerb.

Judge this by dumping the drawn tile per cell through `groundTileName`, not by
reading `tiles.zones`: the zones deliberately overlap, so a check that reads the
list agrees with itself and misses the whole class.
