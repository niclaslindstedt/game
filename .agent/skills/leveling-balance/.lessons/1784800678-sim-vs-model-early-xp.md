---
title: Opening-map XP runs 2–3× richer than kill counts — tune early rows against the simulator
date: 2026-07-23
---

The analytic calculator (`leveling-curve.mjs`) prices levels in reference-mob
kills, but the opening map pays far more XP per kill than that unit suggests:
above-level vanguard mobs (level-diff bonus), six elite bar-shares, and the
golden-arrow drip all land in the first minutes. Measured with
`simulate-run`, the hero completed the L1–4 stretch with ~2.4–3.2× fewer
kills than the authored kills-per-level implied. So when pacing the EARLY
game, set the `content/leveling.yaml` opening rows from the simulator's
`levelUps` ding timestamps (minutes), never from the model's kill counts —
and expect lane landings in the sim to run a couple of levels above the
`--by-level --clear-share 1` model for the same reason (the per-map
`arrowCapByDifficulty` and XP caps are what actually bound them).
