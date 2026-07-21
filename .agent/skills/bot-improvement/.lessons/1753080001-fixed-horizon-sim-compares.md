---
title: Compare sim runs only at the SAME --max-minutes — the cap is part of the run's dynamics
date: 2026-07-21
---

`scripts/simulate-run.mjs --max-minutes` is NOT just a cutoff: the same seed
at `--max-minutes 8` and `--max-minutes 10` produces a completely different
run (different boss-reach, kills, deaths). A baseline captured at one horizon
compared against a candidate at another is apples-to-oranges and will
manufacture phantom regressions/wins. Always A/B with identical flags,
including `--max-minutes`.

Per-seed boss-reach on a wave map is also extremely noisy — any tick-level
decision change reshuffles which seeds land. Judge a change on ≥10 seeds at a
fixed horizon (reach count + kill/death aggregates), never on one seed.
