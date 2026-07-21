---
title: Stamina pacing — the pool lives at exactly 0, a dry pool at full throttle never regens, and the hidden hop sources
date: 2026-07-21
---

Merged lessons from the winded WALK pacing (`walkStaminaFrac`/`walkThreatDist`)
and the "jogs around with no stamina / jumps too much on the moon" fixes:

- **The pool is bone-dry ~94% of a wave-level run, not "low".** The bot moves
  nearly every tick and stamina only refills standing still, so after the
  opening sprint the pool pins at exactly 0 (measured on `test_level`:
  18851/20000 ticks at 0, only 114 in the 0–10% band — and in every one of
  those a foe was within 150px). A "walk when low" rule therefore fires only on
  quiet clear-field traversal; don't expect it to move wave-level sim
  aggregates, and don't "fix" that by including 0.
- **A dry pool moving at full throttle NEVER regens.** step.ts re-arms the
  empty-pool regen lockout every draining frame (`if ((draining || jumping) &&
  player.stamina <= 0) staminaRegenLockMs = emptyRegenLockMs`), so a bone-dry
  hero who keeps steering above `walkThrottle` resets the 2s lockout every tick
  and jogs at `emptySpeedFactor` (0.5×) forever. The only paces that recover
  are the walk (≤ `walkThrottle`, half regen once the lockout lapses) and the
  stand (full regen) — and while the pool is AT zero even the walk crawls at
  0.25× (walk throttle × empty-pool cap), so the right read on a quiet field is
  STAND until the pool is off the floor (`bot.winded` → "CATCH BREATH"), then
  walk (`bot.recovering`), then run. Never stack a walk throttle onto an empty
  pool (`speed = playerSpeed × throttle × staminaFactor` → a 0.25× crawl broke
  the cross-the-map guardrail test); gate pacing on `stamina > 0` — at bone-dry
  the engine's jog cap IS the walk. Any deliberate stand must reset `bot.nav`
  (stuckMs/lastPos/lastTimeMs) or the unstuck stall detector reads it as a
  wedge after 2.4s and the escape sweep yanks him out of the breather.
- **Find the guilty jump branch before tuning jumps.** `survive()`'s
  clear-field macro push (`macroSteer(..., true)`) sets `jump: true` on every
  grounded tick (the travel-hop — the engine refuses any takeoff below
  `STAMINA.jumpCost`, so below that cost the request is dead and pacing can
  ignore it), and after gating the discretionary hops the remaining source was
  `unstuckInput` hopping on EVERY grounded escape tick — 17–25 hops/run on the
  moon, where scatter moonrocks (NOT jumpable) wedge often and low gravity
  stretches each takeoff into the visible floaty arc. Attribute hops with a
  per-takeoff `bot.lastThought` histogram (trace loop, break on jump-count
  change) — the sim's `j/min` column only says "too many". Escape hops now
  need a body at contact range or every probe heading blocked; a plain
  geometry wedge walks its contour on foot. Result across seeds 1–5:
  272 → 18 total jumps, kills up ~14%, more elites/bosses engaged.

Also: pace modifiers belong AFTER the decided branch, alongside the aim/potion
tweaks, and must NOT overwrite the branch's thought label — tests (and BOT
VIEW debugging) rely on macro labels like "EXPLORE FOG" surviving.
