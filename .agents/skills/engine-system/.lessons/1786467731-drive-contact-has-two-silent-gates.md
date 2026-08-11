---
title: A drive collision that "does nothing" is one of two independent gates swallowing it, and neither is the response code
date: 2026-08-11
scope: engine/game/drive/impact.ts, engine/game/drive/collide.ts
concepts: [drive, collision, contact-test, geometry, flakiness]
---

"Hitting a car does nothing" on the road is almost never the ANSWER being weak
(`hurtTraffic` writes off any closed car on any contact). It is one of two gates
in `solveImpact` deciding there was no real collision, and they fail in
different ways:

- **The contact test never fires.** `DRIVE.impact.bodyBandFrac` scales the
  reach ACROSS the road. It sat at 0.6 of the two footprints' sum — about 11 px
  against a 26-px lane — so a bumper that visibly overlapped the car in front
  passed through it. The radii it multiplies (`DriveVehicleDef.radiusPx`)
  already describe only what is on the tarmac, so the shrink was the
  perspective correction applied twice.
- **The contact fires and reads as a graze.** A tick at road speed covers ~12 px
  against a ~10 px reach, so the frame that first sees two cars touching almost
  always sees them ALREADY OVERLAPPED (`nx === 0`) — the tunnelling branch. That
  branch had a `REAR_END_BAND` of 0.3 (~3 px), and outside it the answer was the
  pure lateral one: squareness 0, no speed lost, no damage, no punt. Which
  branch a given hit landed in was effectively a coin flip, and the two answers
  were "a fifth of the wagon" and "nothing" — that IS the flakiness.

So when a collision reads wrong, print the `Impact` before touching `collide.ts`:
`squareness`, `joules` and whether `solveImpact` returned null at all. And note
the two branches must AGREE — the non-overlapped case (`nx !== 0`) already
treated any end contact as a full crash at any lateral offset, so leaving the
overlapped case narrow made the model disagree with itself frame to frame.
