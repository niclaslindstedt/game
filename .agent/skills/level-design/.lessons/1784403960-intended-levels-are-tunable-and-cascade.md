---
title: intendedLevel and the ladder bands are BALANCE knobs, not ground truth — and a change to one map cascades down the whole campaign
date: 2026-07-18
---

`website/scripts/ladder.yaml` (the per-difficulty × per-map `hero:` / `mob:`
bands) and the resulting `intendedLevel` stamped on each level def are NOT facts
to reason FROM — they are themselves part of the balancing act and can be wrong.
When something downstream (a boss that's too hard/easy, a bot that can't reach
the boss's level, drops that don't fit) points at a level number, do not treat
`intendedLevel` (or the boss's authored `level`) as fixed and tune everything
else around it — the number itself is a candidate for the fix.

The catch that makes this delicate: **the hero carries level + gear forward
between maps**, so each map's band assumes an arrival level set by the PREVIOUS
map. The bands form a chain (easy: `spacez_hq 6 → moon 10 → mars 18 →
the_rift 25 → eastworld 31 → the_bunker 28`). Change one map's `hero:`/boss level
and every following map is now entered under- or over-levelled — so a
level-range change is NEVER a one-level edit. Re-flow it through all following
maps AND every difficulty column, then re-verify the campaign is beatable
back-to-back (`simulate-run` across the chain with loadout carry) before shipping.

Corollary for tuning the autopilot: `bossEngageMargin` (bot.yaml) reads the
boss's level, and on most maps the boss level already equals `intendedLevel` — so
"engage at parity" is often the DESIGNED intent. But if the intended level is
itself mis-set, parity inherits the mistake; fix the ladder, don't just bend the
bot around a wrong number.
