---
title: Per-hit variance draws off state.fxRng, a SECOND stream — never state.rng
date: 2026-07-10
---

This is the trick that let damage ranges land with zero seeded-loot-test
churn: the loot/crit stream sequence is untouched, so drop determinism
holds. `fxRng` is seeded off the same seed (repro-safe) and IS persisted
(saved-run snapshots `fxRngState` too, so resume is lossless — the
persistence test enforces exact-sequence resume). Any future combat-flavor
randomness (screen shake, spark counts) belongs on `fxRng`, not `rng`.
