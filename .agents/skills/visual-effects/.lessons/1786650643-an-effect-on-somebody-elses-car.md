---
title: An effect on somebody else's car needs `DriveFx.rider` — `follow` means the HERO'S wagon, and a cadence alone only marks where the car WAS
date: 2026-08-09
scope: pwa/src/game/drive-screen/drive-fx.ts, pwa/src/game/drive-screen/burning.ts, pwa/src/game/drive-screen/wreck-smoke.ts
concepts: [drive, camera, world-anchored, wiring, silent-failure, fire]
---

The drive has two ways to make an effect track a body, and the third thing you
would reach for is a trap.

`DriveFx.follow` reads as "track whatever made me" and does not: `drawDriveFx`
is handed exactly ONE live position (`drive.car.pos`), so a following effect is
pinned to the hero's wagon whoever raised it. `driveBreakdown` sets it correctly
— that IS the hero's engine — and the `trafficWrecked` handler once reused it,
so every car the player finished lit a plume over HIS bonnet and left the wreck
perfectly clean.

A CADENCE — re-issuing the effect at the body's current place from a fixed-step
walk (`stepWreckSmoke`, `stepBurning`) — fixes the ownership and only half the
tracking. It puts the effect where the car was AT THE ISSUE, and issues
deliberately outlive the cadence so consecutive ones overlap; at 400 px/s that
is a fire trailing a car's length behind its car, and a wreck launched into a
cartwheel burns on the tarmac it is spinning above.

So an effect that belongs to the BODY rather than to the road also carries
`DriveFx.rider` (a traffic id) and is re-seated every fixed step (`carryBurns`)
with three things, not one: the position, the vehicle's HEIGHT (`z` — a
launched car is drawn that far above the point the physics holds it at) and its
`angle`, so a spread laid along a four-metre car turns with the car.

Which effects want it is the split "does this belong to the car or to the
road": a burn does; sparks, shards, glass and dust are thrown off and LEFT
BEHIND, and a fuel tank goes off where the tank was.
