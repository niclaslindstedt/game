---
title: Tier-gate defaults in tests — mlvl 99 and powerScaled
date: 2026-07-10
---

`tests/engine/helpers.ts` `makeEnemy` defaults `mlvl: 99` (past every gate)
so loot-shape suites keep their pre-gate behavior; gate suites set `mlvl`
explicitly. Elite/boss mlvl is re-stamped on engage (`maybePowerScale`) —
set `powerScaled: true` when a test needs a hand-staged mlvl to survive the
first hit.
