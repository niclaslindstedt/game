---
title: A turn-rate limiter must only hold back NEAR-180° reversals, and never commit to one tick's sampled heading
date: 2026-07-25
---

Killing the autopilot's left/right/up/down jitter (`limitTurnRate` in
`src/game/bot/nav.ts`: choosing a direction starts a `turnCooldownMs` clock and
an about-face has to wait it out, standing still meanwhile) has two traps, both
measured on `goodco_hq` easy, seeds 1–5:

- **Hold back too WIDE a band and survival craters.** Gating every swing past
  120° cost deaths 8 → 16 and dmgIn/min 202 → 255 vs baseline: a genuine
  sidelong retreat is often 120–150° off the press, so the wait caught real
  escapes. Gating only ≥150° (within 30° of a true reversal — the literal
  "opposite direction") beat baseline instead: deaths 8 → 3, dmgIn/min 202 →
  171, k/min 68.7 → 72.7, every seed clearing to the intended exit level. Also:
  a mere COURSE CORRECTION (inside ~60°) must not re-stamp the clock, or the
  march's constant fidgeting keeps it from ever running out and a reversal is
  forbidden forever.
- **Never commit to the heading of the tick that happened to win.** The
  per-tick decision is noisy (measured on `test_level`: the ADVANCE heading
  swinging 15° → 89° → −22° as the fog target re-picks), and the old
  every-tick re-steer effectively AVERAGED that noise into a straight line.
  Freezing whichever sample arrived when the clock expired turned the march
  into a 2 Hz random walk — the melee grind test went from closing inside its
  44px blade reach to drifting out to 104px. Either leave sub-reversal turns
  free (what shipped) or commit to a rolling average of the wanted heading, but
  don't give one outlier tick half a second of authority.

Instrumentation worth rebuilding: a temporary counter inside `limitTurnRate`
plus one `console.log(globalThis.__turn)` appended to `scripts/simulate-run.mjs`
prints tick-to-tick reversals per run — the money metric (seed 1: 2485 → 544
reversals, ~7.8/s → ~1.6/s, with ~18% of ticks now spent deliberately standing).
Revert both patches before committing.
