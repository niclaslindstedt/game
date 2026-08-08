---
title: JESUS is not a rung you tune — its uncapped menace balances it
date: 2026-07-28
scope: engine/game/defs/difficulties.ts
concepts: [difficulty, jesus, menace]
---

Do NOT reach for the mob-hp knobs when a sweep reports JESUS walling or
melting. JESUS is the one rung with no `menaceStageCap`
(`engine/game/defs/difficulties.ts` — easy 3, medium 5, hard 10, nightmare 100,
JESUS omits the knob and stays uncapped), so its horde EVOLVES without a roof
to answer whatever the hero brings: extra hp is baked in at spawn as the meter
climbs, and the ratchet floor makes it permanent. That is the design — the
"abandon all hope" terminus regulates itself, which is also why its `mercy`
block is all zeroes.

So a JESUS row in the VERDICT is not a balance defect to fix; hand-tuning
`hp:` for it in `content/ladder.yaml` double-counts against a system already
doing the job. **Balance the CAPPED rungs (easy → nightmare) and let menace
own JESUS.** When sweeping, prefer `--difficulty medium,nightmare` for tuning
reads and treat any JESUS numbers as observational.

Corollary for reading a sweep: a JESUS run in the default (realistic-pacing)
sim often pins the hero at the level his arrow cap stops him at while mob
levels keep climbing, so its `Blows-to-kill` and `Δilvl` columns read alarming
by construction. Judge those two off the capped rungs.
