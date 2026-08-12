---
title: To meet the garage door SHUT, clear `door.approach` every frame from an init script and park the hero clear of it — one `page.evaluate` loses the race
date: 2026-08-10
scope: [engine/game/vehicles.ts, engine/game/story.ts, content/maps/garage.yaml, pwa/src/game/render/]
concepts: [playwright, doors, collision, staging, garage, screenshots, preconditions]
---

The garage's roll-up trips at `CAR.doorReach` (130 world px from the door's
centre), which is further than the whole bay is wide — so the hero's own arrival
opens it before the player has a control, and the shut chain is a thing the
shipped run can never meet. Any probe that means to LOOK at the shut door — its
collision, or its colour — has to say so.

**Clearing `door.approach` is the right lever, but ONE `page.evaluate` is not
enough.** The arrival is still running while a probe walks the menus and clicks
through Ruth's conversation, so the write lands after the car has already
tripped it in some runs and before in others — and the doors set is rebuilt as
the level carves, so an early write can land on a chain that no longer exists.
Hold it from a `page.addInitScript` rAF loop that re-clears the flag every frame
from page load, behind a `window.__holdDoor` kill switch you turn off before
opening the door yourself — without the switch the hold loop fights your own
`approach = true` and the door never opens at all.

**And the flag alone does not hold it: `approach = false` makes the door KEYED,
and the hub hero holds the key to his own garage** (`holdsKeyFor` in
`stepDoors`), so it still opens for him inside `DOORS.openRadius` (40). Park him
further off — 110 units is comfortable, and this level's camera is clamped by
its own bounds, so moving the hero does not move the framing and two runs' crops
line up pixel for pixel.

**Assert the precondition in the probe.** `open === false` before the "shut"
screenshot, and fail loudly otherwise: an open doorway photographs as a perfectly
plausible picture of a garage, and two of this pass's runs produced confident
before/after numbers that were really an empty doorway compared with itself.

Re-adding the dropped slat obstacles from a `setInterval` is the approach that
does NOT work: it RACES `stepDoors`, which drops them again every tick, so the
chain is there on some frames and not others and a car's rest position wanders
several px between runs.

Staging the CAR, from a `?debug` page: `?scenario={"skipOpening":true,…}` lands
you in `playing`, but the garage still raises Ruth's conversation, so click the
canvas until `window.__game.phase === "playing"` before touching anything. Then
mirror `enterCar` by hand — set `car.driver = 0` and filter the `vehicle`
obstacles within `CAR.footprint.radius + 20` of the car out of `state.obstacles`
— because boarding is a TAP on the landmark, not a key. Do not click the canvas
afterwards to "focus" it: a click near the car is that same tap and it gets back
OUT. Drive with **WASD**; the arrow keys move nothing.

For a before/after on a render or engine change, `git stash` between two runs of
the same probe script is enough — Vite HMR picks the change up and the page is
loaded fresh each run.
