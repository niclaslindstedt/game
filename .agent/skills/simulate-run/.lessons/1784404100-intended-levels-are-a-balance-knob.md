---
title: When a run stalls/races or meets the boss off-level, suspect the ladder's intended levels themselves — and remember a change cascades campaign-wide
date: 2026-07-18
---

A big thing every balance pass must look at: the ladder numbers
(`scripts/ladder.yaml` `hero:` / `mob:` bands and the resulting
`intendedLevel` on each level def, plus the boss's authored `level`) are
themselves tunables that can be WRONG — not ground truth to tune everything else
around. If a `simulate-run` shows the hero stalling, racing, or reaching the boss
badly under/over-levelled, hold the intended level as a prime candidate for the
fix, not just the XP curve / mob hp / drops.

The coupling that makes it delicate: the hero carries level + gear FORWARD between
maps, so each map's band assumes an arrival level from the previous one (easy:
`spacez_hq 6 → moon 10 → mars 18 → the_rift 25 → eastworld 31 → the_bunker 28`).
Change one map's intended/boss level and every following map is entered off-level
— so re-flow the change through all maps AND all difficulty columns, then
re-verify with a carry-over campaign `simulate-run` (easy→JESUS) that the chain
stays beatable in sequence. Never a single-level tweak. (Mirrored in the
`level-design` and `leveling-balance` skills.)
