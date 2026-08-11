---
title: To see a shut APPROACH door's collision, clear `door.approach` — the opener always wins the race
date: 2026-08-10
scope: [engine/game/vehicles.ts, engine/game/story.ts, content/maps/garage.yaml]
concepts: [playwright, doors, collision, staging, garage]
---

The garage's roll-up trips at `CAR.doorReach` (130 world px from the door's
centre), which is further than the whole bay is wide — so a driven car opens it
on the first tick it has a control, and the shut chain is a thing the shipped
hero can never drive into. Any probe that means to LOOK at that collision has to
say so.

Two ways to hold it shut, and only one of them works. Re-adding the dropped slat
obstacles from a `setInterval` RACES `stepDoors`, which drops them again every
tick: the car then collides against a chain that is there on some frames and not
on others, and the rest position wanders several px between runs. Setting
`window.__game.doors[0].approach = false` instead takes the OPENER off and leaves
everything else — the chain stays hung, `driveCar` and `stepDoors` both skip it,
and the numbers repeat exactly. The same line is what a test needs
(`garage_door_test.ts`).

Staging the car at all, from a `?debug` page: `?scenario={"skipOpening":true,…}`
lands you in `playing`, but the garage still raises Ruth's conversation, so click
the canvas until `window.__game.phase === "playing"` before touching anything.
Then mirror `enterCar` by hand — set `car.driver = 0` and filter the `vehicle`
obstacles within `CAR.footprint.radius + 20` of the car out of `state.obstacles`
— because boarding is a TAP on the landmark, not a key. Do not click the canvas
afterwards to "focus" it: a click near the car is that same tap and it gets back
OUT. Drive with **WASD**; the arrow keys move nothing.

For a before/after on an engine constant, `git stash push -- <files>` between two
runs of the same probe script is enough — Vite HMR picks the change up and the
page is loaded fresh each run.
