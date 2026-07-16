---
type: Changed
title: Mobs get tougher over the game (geometric hp curve)
---

Rank-and-file mob health now scales GEOMETRICALLY with monster level
(`MENACE.mobHpGrowthPerLevel`, plateauing past a knee) instead of a gentle
linear ramp, so hits-to-kill RISE across the campaign — a couple of blows early
climbing toward ~10 by level 60 — rather than collapsing into one-shots as the
hero out-damages the horde. This kills the "rampage meter pinned at its cap even
on EASY" problem at its root: the meter only ratchets when the hero genuinely
one-shots the crop, which no longer happens by default. Kill XP keeps its own
level-priced ramp, so leveling pace is unchanged, and because the curve is keyed
to the mob's LEVEL (not the hero's gear) a good unique/legendary still DIPS
hits-to-kill below the curve. Named drops stay a bounded upgrade (under ~2.5×,
never 10×, sub-level-99). Tune and verify with the new
`scripts/mob-hp-curve.mjs` (its `--no-unique`/`--no-legendary`/`--no-sets`/
`--no-artifact` flags read the hero on normal magic/rare gear).
