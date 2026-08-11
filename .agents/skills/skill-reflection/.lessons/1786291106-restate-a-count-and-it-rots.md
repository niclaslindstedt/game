---
title: A skill that RESTATES a count or a symbol list rots; point at the command or module that prints the live one
date: 2026-08-09
scope: .agents/skills
concepts: [staleness, skill-writing, verification, counts]
---

A 2026-08 audit of all 38 skills found that nearly every wrong claim was a
NUMBER or a LIST somebody had transcribed out of the tree: "35 uniques"
(149), "~10 balance knobs" (22 in `BalanceTuning`), "nine reference viewports"
(ten in `pwa/scripts/ui-shots.mjs`), "39 errands" (42 files), "six missions"
(seven blueprints), "three widgets" (five), "five bot strategies" (eight in
`BOT_STRATEGIES`). None of them had drifted by much when written; all of them
were wrong within a release or two, and nothing fails when they go wrong.

So when a skill needs a count or a roster, name the ONE place that answers it
and quote the live figure as an illustration, not as the claim —
`node scripts/unique-check.mjs`'s header line, `BALANCE_TUNING_DEFAULTS`,
`VIEWPORTS` in `ui-shots.mjs`, `BOT_STRATEGIES` in `engine/game/bot/state.ts`,
`content/ladder.yaml`'s own header. A reader who has the pointer can re-derive;
a reader with only the number cannot tell it has gone stale.
