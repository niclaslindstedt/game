---
title: Put the hero where a cue needs him with `?scenario={"place":{x,y}}` — writing `window.__game` does not stick
date: 2026-08-09
concepts: [staging, scenario, playwright, screenshots]
---

Anything gated on the hero's distance (the car's boardable halo at
`CAR.boardRadius` + 40, a merchant greeting, a door's approach) is dark or off
in a default `--strategy idle` run, and the screenshot then shows the absence of
the thing you came to look at.

Mutating the live state from Playwright does NOT work — `page.evaluate(() => {
window.__game.players[0].pos.x = 150 })` reported the hero back at his spawn on
the next read. Use the app's own staging param instead:
`?scenario=%7B%22place%22%3A%7B%22x%22%3A140%2C%22y%22%3A198%7D%7D`
(`{"place":{"x":140,"y":198}}`), which `playtest.mjs` also forwards as
`--scenario`.

Worth knowing for the hub specifically: the garage's `playerSpawn` and the car's
landmark are the SAME point, but the car's footprint blockers push the hero
clear at the first tick, so he starts ~65 px away — outside the halo's full
strength and just inside its fade. "Spawns at the car" is not "stands at the
car".
