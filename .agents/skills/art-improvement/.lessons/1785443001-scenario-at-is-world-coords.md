---
title: A scenario spawn's `at` is WORLD coordinates, and a landing zone will shove staged mobs off their marks
date: 2026-07-30
scope: content/levels/
concepts: [scenario, world-coords, staging]
---

Phase 4 step 7's pose check takes `"spawns":[{"enemy":"x","at":{...}}]`, and
`at` is an **absolute world position**, not an offset from the hero. Passing
small signed numbers (`{"x":-90,"y":-30}`, the natural guess) puts every mob
off the map and the screenshot comes back empty with no error — the run looks
like it worked. Read the level's `playerSpawn` from
`content/levels/<id>.yaml` and place them around it (Boot Hill's is
`{x: 300, y: 800}`).

Even then, expect them not to hold their marks: a map's landing usually sits
in a QUIET or SAFE zone, and a SAFE one actively repels minions to its edge,
so a row placed neatly in front of the hero slides off to one side. Don't chase
it — place them, take the shot, and CROP the cluster (`sharp(...).extract().resize(..., {kernel:'nearest'})`)
to judge the read. Two or three mobs seen properly over real ground at the
phone viewport is the check; a tidy row is not.
