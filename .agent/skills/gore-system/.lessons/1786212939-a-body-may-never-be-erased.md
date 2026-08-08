---
title: On the road, CAUGHT implies CRUSHED — so any rule that erases a body has to be read at the SLOWEST collision
date: 2026-08-08
scope: src/game/drive/, pwa/src/game/drive-screen/
concepts: [drive, gore-density, thresholds, remains, measurement]
---

`DRIVE.gore.dragAlongPx` parks a caught piece two px INSIDE the footprint
`crushRemains` tests, deliberately, so that anything the car catches is under
the axle the instant the drag lets go. That makes `catchOnCar` → `crushed` a
CHAIN rather than two independent outcomes: whatever is caught is run over,
about a quarter of a second later, every time.

Compose that with a renderer that draws a crushed piece as nothing — which was
reasonable on its own, since `gib_road_paste_1` IS a whole person pressed into
the road — and the pair silently DELETED the victim on every collision under
the split line. Anything from about 12 mph (`dragMinSpeedPx`) to about 60
(`splitJoules`) left a pool of blood with nobody in it, which covers most of a
carefully-driven leg. Both halves looked right in isolation and neither had a
test.

Two things to take from it:

- **Read a gore ladder from the BOTTOM.** Every threshold on this road is
  written for the top of the dial and every exhibit stages one there, so the
  gentle rung is the one nobody looks at — and it is the rung a cautious player
  spends the leg in. The shelf now has `drive-body-slow` for exactly that.
- **A per-speed table of WHAT IS LEFT ON THE ROAD is the instrument this
  system lacked.** Plant one body, step the road at ten fractions of the top
  speed, print the surviving `DriveRemain.part` counts (plus `crushed`) and the
  events booked. It takes twenty lines against `createDrive`/`stepDrive` and it
  showed the hole immediately, where a staged diorama at 174 showed a perfect
  collision.

The fix keeps both rules and adds the missing one: a body the BUMPER only
knocked down is not caught at all, and the WHEELS take a whole body in two
where it lies (`severUnderWheel`) rather than erasing it. A bumper going
through somebody is a question about the BLOW; a wheel rolling over somebody
already down is not, and needs no speed whatsoever.
