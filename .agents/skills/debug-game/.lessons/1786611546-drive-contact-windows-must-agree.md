---
title: Two passes on the drive decide "are these touching", and the wider one silently swallows the collision — a speedometer pinned at exactly 25 mph is `pushFloorPx`, not a crash
date: 2026-08-13
scope: engine/game/drive/push.ts, engine/game/drive/impact.ts
concepts: [drive, collision, physics, symptom-far-from-cause, contact-test]
---

`collide.ts` asks `solveImpact` whether the bumper reached something;
`push.ts` asks its own `pushGripPx`/`pushBandPx` window whether the wagon is
shoving something. They were never held against each other, so between them sat
a crescent — a couple of px across the road, more at an along-road gap — in
which a car was picked up, carried, had its speed OVERWRITTEN and taxed the
throttle with **no collision booked at all**: no wear, no `trafficHit`, no
sound, the victim unmarked. An ONCOMING car caught in it was turned round and
driven back up its own lane for free, because the pressing test read
`Math.abs(other.speed)` and a car closing at 300 looks merely "slower than me"
on magnitude.

**The tell is a number, and it is on the dashboard.** `pushFloorPx` is 130 px/s
and `DRIVE_UNITS.mPerPx` makes that exactly 25 mph. A report of "I hit it at
speed and just stopped" whose screenshot reads 25 MPH is the push, never a
crash — no collision pass produces a floor.

The rule now: a push is the CONTINUATION of a contact, so its window is
`contactReach()` (exported from `impact.ts`) narrowed by the push's own slack
and never widened by it. Anything else that grows a second "are they touching"
test owes the same intersection.

**How to see it in seconds, without a browser.** Stage the pair yourself rather
than driving a road: `createDrive` → `skipDriveOpening` → `haltTraffic` →
`createTraffic` at a chosen `dy`, then **re-pin both `pos.y` every tick** and
sweep `dy` in half-px steps. Unpinned, the other driver's AI steers a pixel or
two out of the hole and it never reproduces — which is exactly why the crescent
survived. `tests/engine/drive_push_test.ts` is that sweep, kept.
