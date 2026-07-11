---
title: A level pool is 2 melee / 2 ranged / 2 magic
date: 2026-07-10
---

Magic shipped half-served (one base per level → 12 rungs vs 24). Bringing a
class to parity is: add one base per level pool at a stepped `levelReq`,
grade names in `grades.ts`, wire the pool array, `make assets`, LOOK. The
grade bands ([25,52] exceptional, [55,100] elite) unfold the rest — check
the `weapon-stats.mjs` per-class ladder afterwards (it must never step
down).
