---
title: A map's intended hero level is a tunable, not a target to protect — and moving it cascades through every following map
date: 2026-07-18
---

When the hero's leveling pace doesn't line up with a map's `intendedLevel` /
ladder `hero:` band, don't assume the pace is the only thing to move. The
intended level itself is a balance knob and can be the thing that's wrong — it's
all one balancing act (XP curve ↔ kills-per-level ↔ per-map XP cap ↔ the ladder's
intended level ↔ the boss's authored level).

Because levels carry the hero's level + gear forward, the intended-level bands are
a COUPLED CHAIN across the campaign (see `website/scripts/ladder.yaml`). Retuning
one map's intended/boss level shifts the arrival level of every map after it, so
any such change must be extended down the whole campaign and re-verified with a
carry-over `simulate-run` (easy→JESUS, whole chain) so the maps stay beatable in
sequence — never a single-level tweak. This lives in `level-design` too; keep
both in mind when a leveling-pace fix tempts you to move a level number.
