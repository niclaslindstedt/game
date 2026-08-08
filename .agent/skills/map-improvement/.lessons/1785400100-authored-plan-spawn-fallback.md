---
title: Widening an authored-plan map can move the hero's landing — the LONG WALK fallback overrules `spawn: false`
date: 2026-08-01
scope: src/game/mapgen/
concepts: [spawn, authored-plan, hero-landing]
---

`pickSpawnChamber` (`src/game/mapgen/generate.ts`) treats an area's
`spawn: false` as a PREFERENCE. If the winner among the eligible cells is closer
to the goal than a third of the map's diagonal, it throws the preference away and
re-picks from **every** chamber — the LONG WALK rule, there so a rolled carve that
came out with almost none of the landing district cannot open with the boss in
plain sight.

On an AUTHORED plan (`MapBlueprint.plan`) that rescue has nothing to rescue and
quietly overrules the author. It is also **distance-triggered, so it fires on a
change that looks unrelated**: adding an 80 px strip of road down one edge of the
garage stretched `hypot(width, height) / 3` past the bay-to-lawn gap, and the hub
started the hero standing in the middle of the public highway — with the garage
door, which is hung across the doorways of the SPAWN chamber, gone from the level
entirely (a road cell has no doorways).

Fixed in the generator: `pickSpawnChamber` takes a `planned` flag and skips the
fallback under a plan, the same way `plan.goal` beats the rolled goal.

**The general lesson: after ANY change to a plan's extents, dump the carve, not
just the render.** `map-layout.mjs` draws the landmarks where they land, so this
was visible in it — but only if you know the hub's landmarks by heart. A
five-line script through `resolveLevelDef` printing `playerSpawn`, `landmarks`,
`doors` and `tiles.zones` says it outright, and catches the `doors: undefined`
that no picture shows at all.
