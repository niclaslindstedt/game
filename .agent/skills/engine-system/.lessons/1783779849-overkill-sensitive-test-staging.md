---
title: Stage test kills as wounded mobs, not sledgehammer one-shots
date: 2026-07-11
---

Many suites kill staged mobs with `hitEnemy(state, enemy, 1_000_000)` or park
1-hp/1-maxHp fodder for speed. Any rule keyed to the killing blow's OVERKILL
(`overkillEfficiency` scales xp and the minion drop roll by `maxHp / damage`)
silently guts those tests — drops collapse, xp vanishes, and the failure looks
like a loot/leveling regression. Stage a WOUNDED mob instead: low `hp` under a
tall `maxHp` (e.g. `hp: 45, maxHp: 200`) so one modest blow still kills in one
hit but never exceeds the full bar. Beware the flip side: a tall `maxHp` pays
real xp on death, so long massacre loops must auto-spend stat points
(`allocateStat`) or the `levelup` phase freezes the run mid-test.
