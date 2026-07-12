---
title: Class-based crit re-budgets fast/slow weapons — re-center the drifters
date: 2026-07-12
---

Crit damage moved from cadence-weighted (`weaponCritMult(def)`: fast 1.6 /
medium 2.0 / slow 2.5) to a flat CLASS base (`baseCritMult`: physical ×2,
magic ×1.5) plus stat scaling (STR on melee, INT on magic; ranged flat). The
live per-swing multiplier is now `weaponCritMult(state, weapon)` in items.ts;
the budget model and all three scripts price crit off the pure `baseCritMult`.

Consequence when you change the crit reference: the budget's `critLift` shifts
per class, so a weapon's SUGGESTED damage moves even though its def didn't.
Fast physical (old 1.6 → 2.0) and slow physical (old 2.5 → 2.0) and all magic
(→ 1.5) drift in OPPOSITE directions. Most stay inside the ±12% budget
tolerance, so `weapon-budget --strict` only flagged a few — but two subtler
checks bit that `--strict` did not:

- **The weapon-stats class ladder** (`--coverage --strict`) is order-sensitive:
  a fast weapon nudged UP and a slower one nudged DOWN can CROSS a rung
  ("leveling up should pay") while both are still individually in-tolerance.
  Re-center BOTH onto their budgets, not just the `--strict` failures.
- **A boss-trophy ≥ elite invariant** (story_test): a cone boss trophy pinned
  at its budget can fall UNDER a single-target elite that rose with the new
  crit weight. Fix by trimming the elites onto/under budget, not by pushing the
  trophy over tolerance.

So after any crit-model change, run the FULL battery (`item-forge check`) AND
`npx vitest run` — the budget checker alone is not enough; the ladder and the
content invariants catch the crossings it tolerates.
