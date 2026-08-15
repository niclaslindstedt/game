---
title: EVERY drive auto-driver measurement is a multi-seed rate, not a promise about one road — arrival, and speed over a window alike
date: 2026-08-11
scope: engine/game/drive/, tests/engine/drive_driver_test.ts, scripts/drive-bench.mjs
concepts: [drive, ab-testing, seeds, arrival-rate, false-green]
---

A collision-physics correction made one formerly cheap offset crash terminal on seed 4242, while `drive-bench --seeds 100` still measured 99/100 MEDIUM arrivals and healthy rates across the ladder. Keep a multi-seed test as the arrival gate; tests that need to inspect a completed road should use an explicitly arriving fixture seed instead of forcing every deterministic road to arrive or retuning the driver around one outlier.

The same is true of any SPEED sample, and there it is easier to be fooled because the assertion looks like a fact about the driver. A change that left more wreckage lying in the road took seed 4242's mean speed over the first twelve seconds of town from 261 to 182 px/s and its peak from 334 to 300 — which read as a clear regression until the same window was sampled over twelve seeds: the peak-clearing rate was 8/12 both before and after, and the WORST mean across the sample improved (132 → 173). One seed had simply swapped sides. Take a dozen before concluding anything, and note that `make drive-bench`'s ARRIVED and TRIP columns can be flat while a single seed's local window moves by a third.

One test bug this exposed, now fixed: the driver floors its target on `rungTopSpeedPx(difficulty) * floorFrac`, not on `DRIVE.topSpeedPx * floorFrac`. Asserting the latter holds a MEDIUM road to the JESUS floor (208 px/s against a promised 162) and passes only while the sampled seed happens to be clear.
