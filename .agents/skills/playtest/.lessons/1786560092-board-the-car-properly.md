---
title: Board a vehicle through `enterCar`, never by writing `driver` — the parked blockers shove the body a whole car length
date: 2026-08-12
scope: engine/game/vehicles.ts, pwa/scripts/playtest.mjs
concepts: [probes, staging, vehicles, playwright, measurement]
---

A parked car blocks the floor with its own obstacle chain (`vehicleFootprint`),
and `enterCar` is what takes that chain OFF the field. A probe that shortcuts
boarding with `window.__game.vehicles.find(...).driver = 0` leaves it on, so the
first tick of `collideCarBody` resolves the body against its own furniture and
teleports it ~48 px — a whole car — before the player has touched the throttle.

That is not a visible failure. The car drives away perfectly well from wherever
it was flung, so every timing read off the run is wrong by the distance and
every screenshot is of a car that is not where the game would have put it. It
cost this session two confident and completely false diagnoses (a bumper
"beating the roll-up by 228 ms" that in truth cleared it by 156, and a film of
the wagon passing a half-open door that never happens).

Board it the way the app does: stand the hero on the car
(`g.players[0].pos = car.pos`) and TAP it — `page.mouse.click` at the screen
centre, and if that misses, sweep a few ±10 px offsets, because the tap is
checked against the LANDMARK's world position. Then assert `car.driver !== null`
and fail loudly if it is still null, rather than carrying on with a state the
game could not have reached.

**THE LANDMARK IS WHY A RELOCATED CAR CANNOT BE BOARDED.** Boarding hit-tests
the landmark (the parking spot); only getting back OUT hit-tests the machine
(`player-input.ts`). So a probe that stands the car somewhere else to photograph
it — the shortcut for "a running car on ground the bay's strip lights are not
on", since a driven car is not steerable from Playwright's mouse or keyboard —
has to move `state.landmarks`' `car` entry with it, or the tap lands on an empty
bay and the probe throws.
