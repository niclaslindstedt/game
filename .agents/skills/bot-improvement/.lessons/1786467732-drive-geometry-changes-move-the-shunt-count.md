---
title: A change to the drive's collision GEOMETRY moves the shunt count ~3x and must be paid back on `impact.trafficWearScale`, re-measured per rung
date: 2026-08-11
scope: engine/game/drive/, scripts/drive-bench.mjs, tests/engine/drive_driver_test.ts
concepts: [drive, ab-testing, arrival-rate, balance, drive-bench, collision]
---

Widening what counts as a contact on the road (`impact.bodyBandFrac` 0.6 → 1,
`REAR_END_BAND` 0.3 → 1) did not change what a collision COSTS and still took
MEDIUM from 25/25 arrivals at 29% ending wear to 26/30 at 50%: the same driving
simply books about three times the contacts. The knob that pays it back is
`DRIVE.impact.trafficWearScale` — a cost PER CONTACT — and 2.6 → 1.1 restored
the whole ladder (easy 12%, medium 36%, hard 49%, nightmare 60%, jesus 71%,
against 10/29/41/58/68 before).

Two things that saved time and one that wasted it:

- **Sweep the knob with `node scripts/drive-bench.mjs --seeds 25 --difficulty
  <rung>` and read line 5**, one rung at a time. 25 seeds is enough to separate
  the rungs; 8 seeds in a hand-rolled probe put two of them on the wrong side of
  "arrives".
- **Bisect the change before tuning.** Stashing and re-applying one edit at a
  time showed the band was the whole cost and the rear-end band was nearly free
  — without that the temptation is to soften both.
- **The bench table in `DRIVE.coursePx`/`trafficWearScale`'s own doc is the
  deliverable**, not a nicety: it is the only record of what the rungs measured
  at, and the next pass re-takes it with the same command.
