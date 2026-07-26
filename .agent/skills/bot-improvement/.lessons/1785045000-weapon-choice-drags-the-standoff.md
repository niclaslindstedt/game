---
title: A weapon-pick change is a POSITIONING change — the standoff is derived from the held weapon's range
date: 2026-07-26
---

Making the pocket arsenal context-aware (single-target round at a boss, spread
across a mass — `src/game/bot/weapon-swap.ts`) looked like a pure damage-model
change. It is not: `survive()` derives `engageDist` from the **held** weapon's
range, so every swap moves where the hero STANDS. Trading a 240-reach gun for a
160-reach spread walks him 80px deeper into the pack for the rest of the fight.

Measured on `spacez_hq` easy, balanced, 10 seeds × 8 min, class `ranged`:

- Context re-picks with no reach rule: kills −1%, damage taken +6%, **deaths
  15 → 26**. The hero kept trading down into short-range crowd guns.
- Same change with the trade rule "asking for the hysteresis margin ONLY when
  the pick gives up reach — reaching farther is free": kills **+10%**, level
  13.5 → 13.7, damage taken +3.6%, dps flat. Melee at the same setting: dps
  +3%, clears 9/10 → 10/10.

Two smaller findings from the same pass:

- **A longer re-pick gap made it worse, not better.** Suspecting churn (swaps
  went 2/min → 21/min on the ranged build), the obvious fix was a separate,
  longer cooldown for context re-picks (2000ms vs the positional 400ms).
  Result: ranged clears 10/10 → 6/10, dps −20%. Holding the wrong tool longer
  costs more than the churn does; fix WHICH trades are allowed, not how often.
- **One-sided hysteresis is a flap channel.** Waiving the margin whenever the
  banked weapon merely out-scores the hand (`weaponScore(pick) >
  weaponScore(held)`) opens a cheap door back: A→B needs 1.25×, B→A is free, so
  the pair trades on every context wobble. Require the same bar on the neutral
  score too (`> held × MARGIN`), or give the cheap direction a stable
  preference (here: toward more reach), so it converges instead of oscillating.

Instrumentation note: `(run.weaponTimeline || []).length` from
`simulate-run --json` is the swap counter — swaps/min next to dps/kills is what
tells churn apart from good tool selection.
