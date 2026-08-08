---
title: A/B a leveling faucet on KILLS-TO-A-FIXED-LEVEL, never on kills-per-ding
date: 2026-08-01
scope: scripts/simulate-run.mjs
concepts: [xp-curve, ab-testing, measurement]
---

Comparing two XP faucets across campaign sweeps, the obvious summary
(`totalKills / dings`) is **confounded and points the wrong way**. Realistic
pacing ends each run at the map's `intendedLevelByDifficulty`, so a slightly
richer faucet carries the hero one level FURTHER over the sweep — and the
levels it reaches are the expensive ones. Measuring the XP-scroll faucet against
the golden arrow it replaced, kills/ding read 108.4 (arrow) vs 98.6 (scroll),
suggesting the scroll was ~9% too generous; the arrow run also read WORSE than
the no-faucet control (104.7), which is impossible for a faucet that only adds
XP. The whole gap was the level-cost mix.

**Stitch a cumulative kills-to-level curve across the sweep instead** — walk
`run.levelUps[].kills` plus the running `run.combat.kills` total — and read the
faucet's worth as the kill saving at a level BOTH configs reached:

```js
let cum = 0, at = new Map();
for (const r of report.runs) {
  for (const lu of r.levelUps ?? []) if (!at.has(lu.level)) at.set(lu.level, cum + lu.kills);
  cum += r.combat.kills;
}
```

Always sweep a NO-FAUCET control (`--no-xp-scroll`) in the same batch: the
faucet's value is `(control − with) / control`, and without the control there is
no scale to judge "close enough" against. On that basis the same data read
arrow ≈ 14% and scroll@0.05 ≈ 17% — a couple of points apart, not nine.

Two more things that bit:

- **Early checkpoints (≤L25) are pure chaos.** One seed's L25 row had the
  no-faucet control BEATING a live faucet. Only L30+ checkpoints, where a
  thousand-plus kills have accumulated, are worth reading; take at least two
  seeds before committing a value.
- **Set the `S=...` variable OUTSIDE the backgrounded subshells** when running
  sweeps in parallel (`S=… && (…) & (…) &`): the second subshell does not
  inherit it, its `>` redirect fails, and the job still exits 0 — you get a
  missing JSON and a green-looking run.
