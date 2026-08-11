---
title: A carve must still find a hero who never moves
date: 2026-07-31
scope: engine/game/mapgen/
concepts: [carve, verification, balance-test]
---

`tests/content/balance_test.ts` guards one design promise — doing nothing loses
on MEDIUM and up — and a carve can break it without breaking any generator
invariant. The horde is finite KNOTS that arm on APPROACH (default trigger
300 px), and the landing cell is deliberately QUIET, so its own knot is anchored
at the cell's FAR SIDE. In a cell wider than the trigger, a player who plants his
feet is never approached by anything: only the map's scripted pins ever reach
him, and on MEDIUM his auto-swinging blade beats those and then nothing else
comes, for ever. Measured, one goodco_hq seed survived past a full minute.

Two things follow:

- **Any change that re-rolls where the hero LANDS re-rolls this.** Slack-widening
  in `pickSpawnChamber`, a new area's `spawn: false`, a district weight — all of
  them move the landing, and the difference between 287 px and 303 px from the
  nearest knot is the difference between dying in 15 s and surviving the window.
  A green `generated_maps_test.ts` says nothing about it; run
  `tests/content/balance_test.ts` and read its printed time-to-death TABLE.
- **The fix belongs in the carve, not in the test's cap.** The opening knot is
  widened to reach the pad (`generate.ts`, right after `buildSpawners`), which
  costs the arrival nothing — the mobs still have the whole room to cross, which
  IS the breather — and keeps the promise. Do not "fix" a red bar here by raising
  `OVERRUN_CAP_MS`; the seconds are a playtest call, the death is not.

The sibling trap: a test that parks a mob at a fixed offset from the hero
(`pos.x + 280`) is measuring nothing on a carved map — the spot lands inside a
prop on some seeds and the collision pass ejects the mob a hundred px on the
first tick. `openSpotNear` in `tests/helpers.ts` is the fix.
