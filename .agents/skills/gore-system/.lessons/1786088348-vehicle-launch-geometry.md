---
title: Remains thrown by a VEHICLE need one launch vector, a carry fraction under 1, and a lift ceiling
date: 2026-08-07
scope: engine/game/drive/eject.ts, engine/game/drive/remains.ts, tests/engine/drive_fleet_test.ts
concepts: [drive, collision, launch, head-on, eject, remains]
---

Four geometry rules, each of which was wrong once and none of which fails a test
when it is:

- **ONE VECTOR, NOT TWO LADDERS.** When a collision carries remains at the
  vehicle's pre-impact speed inside a bounded elevation cone, choose one
  magnitude and one angle and derive x and z from that vector
  (`headOnPieceLaunch`). Independent x/z formulas each look reasonable and
  together produce nearly vertical pieces. Test the pure launch vector BEFORE
  gravity and road bounces alter the observed angle.
- **THE "OVER THE ROOF" READ IS A CARRY FRACTION BELOW 1** (`overRoofCarry`,
  0.62), not an animation. Launch the upper half SLOWER along the road than the
  car and the wagon overtakes it while it is airborne; the eye supplies the rest.
  Nudge it over 1 and the half lands in front of the car and is run over again —
  a fine picture, the wrong one, and no test fails.
- **THE DRAG POINT IS PINNED BETWEEN TWO WALLS.** The body is 48 px, so a piece
  attached anywhere inside about ±20 is drawn entirely under the wagon and the
  drag is a sound with no visible cause; past ±24 it is outside the footprint
  `crushRemains` tests, so the wheels never find it when the drag lets go.
  `dragAlongPx` is −22: visible, still under the axle.
- **A LIFT CEILING IS A SEPARATE FIX FROM A FORCE CEILING.** `remainForce` needed
  the clamp `wreckForce` already had (`DRIVE.gore.maxForce`) — it prices a
  collision in a BODY's currency, and a CAR collision priced in one lands at ten
  to fifty rather than one to six. Clamping the force is not enough on its own:
  every burst is over quickly or it is not a burst.
