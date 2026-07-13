---
title: The BOSS ENCOUNTERS table keys off engagement (first blow), not spawn — elites/bosses are placed at map load
date: 2026-07-13
---

`simulate-run.mjs`'s boss table (and `LevelReport.bosses` in
`src/sim/simulate.ts`) records where the hero MEETS each elite/boss. The trap:
most elites/bosses are PLACED at level creation, so they already sit in
`state.enemies` on the very first tick — a spawn-based "met" reads every boss
as `met 0.0 min, heroL 1`, which is useless for pacing.

The encounter is therefore booked on ENGAGEMENT — the first `enemyHit`/
`enemyKilled` event for that boss's defId (`engageBoss` in `playRun`) — and the
hero level/time/hp/gear are read THEN. A boss the run never reached stays
`engaged: false` with zeroed pacing fields and renders `not reached`; the
`--verdict` boss-level and bosses-felled checks only count engaged bosses, so a
time-boxed run that never got to a boss doesn't false-fail. When adding a new
"met the X" signal to any sim, gate it on a hero-interaction event, never on
the entity appearing.

Also: `--balance key=×` applies the DEVELOPER→BALANCE knobs via
`setBalanceTuning` and RESTORES the prior global tuning in a `finally` — tests
that call `simulateLevel({ balance })` still want an `afterEach(resetBalanceTuning)`
guard in case a future change throws before the restore.
