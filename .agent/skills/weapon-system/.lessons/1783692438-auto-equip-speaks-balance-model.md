---
title: Auto-equip must speak the balance model — at realized AoE, not ceiling
date: 2026-07-10
---

When per-target damage was budget-normalized, raw dps ranking
(`weaponScore`) started shunning every AoE weapon; the score folds in
assumed targets and the crit lift now. Any future model change lands in
`weaponScore`, `weaponDps`, and the budget scripts together.

But ranged AoE is credited at what it REALIZES, not its ceiling:
`weaponAssumedTargets` is a balance-AUTHORING assumption (budget ÷ 4 for a
4-pellet gun); crediting it in full let a spread weapon with a quarter of a
single-target's per-hit damage displace it on a paper tie, which feels awful
against any lone tough foe. So `weaponScore` credits a ranged spread's extra
targets at `1 + (assumed − 1) × WEAPON.aoeRealization` beyond its first,
guaranteed hit. Melee sweeps stay credited at `maxMeleeTargets` (what INT
can cleave); only conditional ranged multipliers (pellets/pierce/chain) take
the discount. This is a RANKING tuning only — the budget scripts, item card,
and `weaponAssumedTargets` are untouched.
