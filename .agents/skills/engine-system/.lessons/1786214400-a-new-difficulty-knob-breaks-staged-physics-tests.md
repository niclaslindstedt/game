---
title: A knob added to DifficultyDef that CLAMPS the sim breaks every test that stages a value by hand — clamps are set by the pedal, not read from it
date: 2026-08-08
scope: engine/game/defs/difficulties.ts, engine/game/drive/, tests/engine/
concepts: [difficulty-ladder, engine-system, staged-tests, clamps, test-fragility]
---

Adding a rung knob that becomes a CEILING (the drive's `rungTopSpeedPx`, which
caps the wagon at 120 mph on EASY) breaks tests in a way a knob that only
scales a number does not: a suite that writes `state.car.speed = <big>` and then
ticks with the pedal down has the number taken straight back, because
`applyCarPedal` is `Math.min(topSpeed, …)` — a clamp as well as a shove. Stage
the speed and then COAST (`pedal: 0`); at road speed a closed throttle is the
air alone, well under a px/s per frame, so the staged number survives exactly.

Two more things surfaced the moment the road's tuning moved, and both were
latent bugs in the tests rather than in the change:

- **A suite that pre-rolls real road and then plants a blow is measuring the
  spawner.** `tests/engine/drive_fleet_test.ts` drove five seconds to clear
  `crowdStartPx`, so its "square head-on" landed with the hero's nose already
  folded and somebody else's motorcycle already in `remains` — `remains[0]` was
  another vehicle's and "did the drive ever say `windscreenOut`" was answered by
  the warm-up. Clear the road at the staging point (`haltTraffic` plus emptying
  `traffic`/`pedestrians`/`props`/`remains` and the event log); the engine
  exports `haltTraffic` for exactly this.
- **A ladder assertion measured over a long clock is measuring saturation.**
  "A harder rung breaks the car more" ran 20 s of pedal-down-no-steering, by
  which point every rung sits between half dead and finished, so it was really
  reading which car broke first — 4 of 6 seeds at baseline, i.e. a coin flip
  wearing a green tick. Shorten the clock until nothing has saturated (8 s here)
  and the ladder is unanimous.

The general rule: when a ladder knob moves, re-run the suites that stage the
ladder's own units and read WHY each failure moved before touching a threshold.
Two of the four failures here were the change working; two were tests that had
been passing on the seed's goodwill.
