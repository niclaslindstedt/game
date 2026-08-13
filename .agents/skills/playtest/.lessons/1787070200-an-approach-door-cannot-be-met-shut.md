---
title: To meet the garage door SHUT, clear `door.approach` every frame from an init script and park the hero clear of it — one `page.evaluate` loses the race
date: 2026-08-10
scope: [engine/game/vehicles.ts, engine/game/story.ts, content/maps/garage.yaml, pwa/src/game/render/]
concepts: [playwright, doors, collision, staging, garage, screenshots, preconditions]
---

The garage's roll-up trips at `CAR.doorReach` (130 world px from the door's
centre), which is wider than the bay — so the hero's own arrival opens it and
the shut chain is a thing the shipped run can never meet. A probe that means to
look at the shut door has to say so.

**Clear `door.approach` from a `page.addInitScript` rAF loop, not one
`page.evaluate`.** The arrival runs while the probe walks the menus, and the
doors set is rebuilt as the level carves, so a single write lands before or
after the trip depending on the run. Put a `window.__holdDoor` kill switch on
the loop and turn it off before opening the door yourself, or the hold fights
your own `approach = true`.

**The flag alone is not enough: `approach = false` makes the door KEYED, and
the hub hero holds the key to his own garage** (`holdsKeyFor` in `stepDoors`),
so it still opens within `DOORS.openRadius` (40). Park him ~110 units off; this
level's camera is clamped by its own bounds, so moving him does not move the
framing and two runs' crops line up pixel for pixel.

**Assert `open === false` before the "shut" screenshot.** An open doorway
photographs as a perfectly plausible garage, and two runs of this pass produced
confident before/after numbers that were an empty doorway compared with itself.

Re-adding the dropped slat obstacles on a `setInterval` does NOT work: it races
`stepDoors`, which drops them again every tick.

Staging the CAR: `?scenario={"skipOpening":true,…}` lands in `playing`, but the
hub still raises Ruth's conversation — click the canvas until
`window.__game.phase === "playing"`. Then call `enterCar` rather than mirroring
it by hand (the parked blockers are laid on a lift now, so no radius around the
anchor finds them). Do not click the canvas afterwards to "focus" it — that tap
gets you back out. Drive with **WASD**; the arrow keys do nothing.
