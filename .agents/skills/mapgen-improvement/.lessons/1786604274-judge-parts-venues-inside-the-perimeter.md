---
title: On a parts venue, judge emptiness INSIDE the perimeter — and verify dressing by emitted count
date: 2026-08-13
scope: content/maps/, engine/game/mapgen/parts.ts
concepts: [parts, perimeter, densities, judging, critters]
---

A sewn plan does not tile its canvas: everything outside the perimeter walls is
sealed void the player never reaches, so a whole-map render makes a parts venue
look far emptier than it plays. Crop INSIDE rooms before judging, and verify a
dressing pass by printing the emitted def (`resolveLevelDef(id, seed)` →
obstacle line counts, fauna lines) rather than by crop luck — densities price
over each AREA's floor, which on a parts venue is a fraction of the canvas, so
a density that sounds thick lands a handful of pieces. Two schema facts that
bite here: a critter's id doubles as its sprite stem, so a critter whose sprite
already exists as a decor id takes `sprite:` (boot_hill's `tumbleweed_roll`),
and props/critters restricted to `space:`-declared districts need the matching
`space:` on their own sprite YAML.
