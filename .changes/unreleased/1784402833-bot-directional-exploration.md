---
type: Changed
title: Bot explores directionally before the boss
---

The autopilot now eagerly DISCOVERS the map before the boss — sweeping its own
side, then the middle, via a spawn→boss axis read — up to a coverage target
(~55%, leaving the boss's side dark until the approach), and engages the boss at
level parity rather than under-levelled. All tunable in `bot.yaml`
(`exploreReach`, `exploreBands`, `exploreTargetFrac`, `bossEngageMargin`).
