---
title: A `LevelDef` afterProgress gate must LATCH, or it arms for a ninth of the run
date: 2026-08-12
scope: engine/game/defs/levels/, engine/game/hazards.ts, engine/game/martyrs.ts
concepts: [level-def, gating, hazards, measurement]
---

`afterProgress` reads as "not until the player is this far in", and the obvious
implementation — compare `heroRunProgress(state)` against it every tick — is a
different rule: it asks where the hero is STANDING. A hero who pushes to the
boss and then walks back up the aisles to the trader turns the beat off again.

Measured on GOODCO with the live read, the gate was open for 6,204 of 56,250
ticks (11% of the run) and the beat fired 3 times in 15 minutes at a 20–37 s
cadence. Latching it (`state.martyrsArmed`, set once and never cleared) took the
same run to 24.

Two things follow. A new latch is a new `GameState` field, so it owes
`tests/saved_run_test.ts`'s shape guard a row AND a default in
`pwa/src/game/saved-run.ts` (`?? false` beats a `SAVE_VERSION` bump that bins
every parked run). And `LevelDef.stampedes` still reads its gate live — it ships
on no level today, so it was left alone, but the same fix applies if it comes
back.
