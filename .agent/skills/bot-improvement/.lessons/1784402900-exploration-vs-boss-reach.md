---
title: Coverage/level gates on macro exploration must have a stall safety or a bogged run never reaches the boss
date: 2026-07-18
---

`macroTarget` in `bot.ts` gates fog exploration so the bot discovers the map
before the boss. Two traps learned the hard way:

- **A coverage-only gate deadlocks combat-bogged seeds.** If the rule is "explore
  until N% of the map is uncovered, then boss", a run that gets pinned by the
  horde never reaches N% coverage (it crawls at ~38-40%) and so *never commits to
  the boss* — it loops on fog for the whole clock. Measured on `spacez_hq` easy:
  seeds that WON at baseline turned into timeouts that never even reached MUSKRAT.
- **Boss-level parity (`bossEngageMargin: 0`) re-opens the same trap.** Waiting
  for the hero to match the boss's level before engaging is what the owner wants,
  but a run that can't level to parity (low kills/min) then has neither trigger —
  not parity, not coverage — and loops forever.

The fix that keeps both: a **coverage-stall detector** (`trackExploreStall` /
`bot.explore`, mirroring `trackContentAbandon`). If map coverage hasn't grown by
~3% in ~15 s, latch `done` and commit to the boss regardless of level/coverage.
Verify with `simulate-run --max-minutes 8` across seeds 1-5 and read the "MUSKRAT
… not reached" line — a good change reaches the boss on most seeds. Note the sim's
`--max-minutes` cap is an artifact: parity runs legitimately take 7-8+ min (farm
to boss level), so a "timeout" that *reached* the boss is fine; a "not reached" is
the real failure.
