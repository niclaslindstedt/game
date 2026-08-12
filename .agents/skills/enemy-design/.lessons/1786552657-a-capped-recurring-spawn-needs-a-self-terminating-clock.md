---
title: A capped recurring spawn needs a self-terminating clock, or one stuck body ends the beat
date: 2026-08-12
scope: engine/game/, content/levels/
concepts: [spawn-cadence, hazards, jam, level-def, measurement]
---

Any beat that mints a mob on a timer and caps how many may be alive
(`MARTYRS.maxAlive`, and the same shape a stampede or a spawn point has) can
JAM. A body that never resolves — wedged on a machine, or simply outrun by a
hero at 84 px/s who never stops moving — holds a slot for ever, and after
`maxAlive` of those the cadence has quietly ended with every test green.

The fix is a clock ON THE MOB that resolves it whatever happens
(`martyr.lifeMs`: the switch closes wherever he is). Design the beat so the
terminal state is reachable without the player's cooperation, and prefer one
countdown that is CUT by the trigger over two fields — the mob then has one
number, and "is it the short kind now?" is a predicate everything else asks
(`martyrLit`) rather than a second flag to keep in step.

Measure it rather than reasoning about it: `node scripts/simulate-run.mjs
--level <id> --difficulty medium --full` prints a `spawned` column per mob. If
the count is far under `run minutes / cadence`, something is jamming or gating.
