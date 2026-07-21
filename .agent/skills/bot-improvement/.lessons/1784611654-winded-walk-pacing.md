---
title: The bot's sprint pool lives at exactly 0 on wave levels — pace rules must exclude bone-dry, and macro travel requests a jump every grounded tick
date: 2026-07-21
---

Three traps hit while adding the winded WALK pacing (`walkStaminaFrac`/`walkThreatDist`):

- **The pool is bone-dry ~94% of a wave-level run, not "low".** The bot moves
  nearly every tick and stamina only refills standing still, so after the
  opening sprint the pool pins at exactly 0 (measured on `test_level`:
  18851/20000 ticks at 0, only 114 in the 0–10% band — and in every one of
  those a foe was within 150px). A "walk when low" rule therefore fires only on
  quiet clear-field traversal; don't expect it to move wave-level sim
  aggregates, and don't "fix" that by including 0.
- **Never stack a walk throttle onto an empty pool.** The engine already caps
  an empty-pool hero to `STAMINA.emptySpeedFactor` (0.5); `speed = playerSpeed
  × throttle × staminaFactor`, so throttle 0.5 on top makes a 0.25× crawl —
  it broke the cross-the-map guardrail test. Gate pacing on `stamina > 0`; at
  bone-dry the engine's jog cap IS the walk.
- **`survive()`'s clear-field macro push (`macroSteer(..., true)`) sets
  `jump: true` on every grounded tick** (the travel-hop). A naive "don't pace a
  jump input" guard therefore never paces travel — the one place pacing
  matters. The engine refuses any takeoff below `STAMINA.jumpCost` (10% of the
  pool), so below that cost the jump request is dead anyway and pacing can
  safely ignore it; only back off for a hop the pool can still pay for.

Also: pace modifiers belong AFTER the decided branch, alongside the aim/potion
tweaks, and must NOT overwrite the branch's thought label — tests (and BOT
VIEW debugging) rely on macro labels like "EXPLORE FOG" surviving.
