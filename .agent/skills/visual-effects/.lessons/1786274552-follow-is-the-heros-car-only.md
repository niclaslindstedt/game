---
title: The drive's `follow` flag means THE HERO'S CAR — an effect raised for another vehicle that sets it is drawn on the player's bonnet
date: 2026-08-09
scope: pwa/src/game/drive-screen/drive-fx.ts, pwa/src/game/drive-screen/loop.ts
concepts: [drive, camera, world-anchored, wiring, silent-failure]
---

`DriveFx.follow` reads as "track the thing that made me" and does not: `drawDriveFx`
is handed exactly ONE live position (`drive.car.pos`, from `DriveScreen`), so every
following effect is pinned to the hero's wagon whoever raised it. `driveBreakdown`
sets it — correct for the `breakdown` event, which IS the hero's engine — and the
`trafficWrecked` handler reused the same function, so every car the player finished
lit a dark plume over HIS OWN bonnet and left the wreck in the road perfectly clean.
Nothing catches it: the smoke is real, it is just on the wrong car, and in a
screenshot that reads as the hero's own wagon smoking.

So: an effect that must track a body other than the hero's car cannot use `follow`.
Issue it on a CADENCE at the body's current position instead, from a pass that walks
the road on the fixed step (`wreck-smoke.ts`, drained beside `stepSkids`). That also
buys the thing a single burst never can — a wreck slides, stops and then sits, so its
cloud has to be a trail, then a pall, then a wisp.
