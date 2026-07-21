---
title: A dry pool moving at full throttle NEVER regens — and the unstick escape was the hidden hop source
date: 2026-07-21
---

Two mechanics behind "the bot jumps too much on the moon and jogs around with
no stamina":

- **step.ts re-arms the empty-pool regen lockout every draining frame.**
  `if ((draining || jumping) && player.stamina <= 0) staminaRegenLockMs =
  emptyRegenLockMs` — so a bone-dry hero who keeps steering at full throttle
  (any throttle above `walkThrottle`) resets the 2s lockout every tick and
  NEVER regains a drop: he jogs at `emptySpeedFactor` (0.5×) forever. The only
  paces that recover are the walk (≤ `walkThrottle`, half regen after the
  lockout lapses) and the stand (full regen) — and while the pool is AT zero
  even the walk crawls at 0.25× (walk throttle × empty-pool cap), so the
  right read on a quiet field is STAND until the pool is off the floor
  (`bot.winded` → "CATCH BREATH"), then walk (`bot.recovering`), then run.
  Any deliberate stand must reset `bot.nav` (stuckMs/lastPos/lastTimeMs) or
  the unstuck stall detector reads it as a wedge after 2.4s and the escape
  sweep yanks him out of the breather.

- **After gating the discretionary hops, the remaining jump source was
  `unstuckInput`** — it hopped on EVERY grounded escape tick
  (`steer(state, target, player.z === 0)`), and moon runs wedge often enough
  (scatter moonrocks, which are NOT jumpable) that this alone was 17–25
  hops/run (measured: seeds 2–3, 8 min). The visible symptom is worst on the
  moon because low gravity stretches each takeoff into a long floaty arc —
  "he bounces away from the chest loot". Attribute hops before tuning them:
  a per-takeoff `bot.lastThought` histogram (trace loop, break on jump-count
  change) finds the guilty branch in one run; the sim's `j/min` column only
  says "too many". Escape hops now need a body at contact range or every
  probe heading blocked — a plain geometry wedge walks its contour on foot
  (jumps couldn't clear those walls anyway). Result across seeds 1–5:
  272 → 18 total jumps, kills up ~14%, more elites/bosses engaged.
