---
title: A drive auto-driver arrival is a multi-seed rate, not a promise about one road
date: 2026-08-11
scope: engine/game/drive/, tests/engine/drive_driver_test.ts, scripts/drive-bench.mjs
concepts: [drive, ab-testing, seeds, arrival-rate]
---

A collision-physics correction made one formerly cheap offset crash terminal on seed 4242, while `drive-bench --seeds 100` still measured 99/100 MEDIUM arrivals and healthy rates across the ladder. Keep a multi-seed test as the arrival gate; tests that need to inspect a completed road should use an explicitly arriving fixture seed instead of forcing every deterministic road to arrive or retuning the driver around one outlier.
