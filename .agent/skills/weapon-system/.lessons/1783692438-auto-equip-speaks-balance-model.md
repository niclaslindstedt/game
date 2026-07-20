---
title: Auto-equip must speak the balance model — at realized AoE, not ceiling
date: 2026-07-10
---

When per-target damage was budget-normalized, raw dps ranking
(`weaponScore`) started shunning every AoE weapon; the score folds in
assumed targets and the crit lift now. Any future model change lands in
`weaponScore`, `weaponDps`, and the budget scripts together.

AoE is credited at what it REALIZES, not a ceiling. The counts are now
CALIBRATED (not the old cone-4 / full-5 buckets): melee reads the swept-area
`WEAPON.meleeAoe` model, ranged reads `WEAPON.rangedAoe`. Two ranking nuances
live in `weaponScore` and nowhere else:

- A ranged SPREAD's extra pellets are situational (they burst on one body at
  point-blank, fan wide at range), so it ranks at `1 + (count − 1) ×
  WEAPON.rangedAoe.spreadRankDamp` — crediting the full `count` let a spread
  with a quarter of a single-target's per-hit displace it on a paper tie.
- MELEE ranks at the hero's LIVE reach/cone
  (`meleeRealizedTargets(weaponSweepHalfAngle, weaponRangeFor)` capped by
  `maxMeleeTargets`), because the ranking runs with real stats — whereas the
  BUDGET (`weaponAssumedTargets` → `meleeBudgetTargets`) estimates the
  realistic stats for the weapon's `levelReq`.

These are RANKING tunings — the budget scripts and item card use the raw
`weaponAssumedTargets`.
