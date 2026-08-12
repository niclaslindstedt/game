---
title: Changing a drive SPAWN RATE reshuffles the whole seeded road, so seeded drive tests move — tell a re-roll from a real change with `make drive-bench`
date: 2026-08-12
scope: engine/game/drive/
concepts: [determinism, seeded-rng, drive, tuning, benchmarks]
---

Every spawner on the road draws from the one `state.rng` stream in a fixed
order, so raising a RATE (`DRIVE.pavementPerKPx`, `pedestriansPerKPx`, a lane
gap) changes how many draws are spent before every later draw — and the road a
seed lays down is a different road, body for body. Expect two or three seeded
suites to fail on numbers that have nothing to do with what you changed
(`drive_fleet_test.ts` stages a collision at whatever x 3 s of driving reached;
`drive_ai_test.ts` averages a chaotic fraction over a seed list).

DO NOT re-baseline those numbers by eye. `make drive-bench ARGS="--seeds 24"`
is the instrument: it plays every rung with the auto-driver and prints
ARRIVED / TRIP / BODIES / SHUNTS / END WEAR. If those columns are unmoved, the
road's difficulty is unmoved and the failing test is measuring the re-roll —
fix the test's measurement or its sample size. If they move, the tuning moved
and that is the thing to argue about.
