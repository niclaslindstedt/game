---
title: Arm defensive positioning reads on HP, not body count — and never A/B a bot change on one seed
date: 2026-07-20
---

Two lessons from adding the escape-route guard (`escapeLaneMin`) and the
kite-backward drift (`retreatBackBias`):

- **Preemptive caution gated on packed-body count alone kills wave levels.**
  On a wave map 3-5 bodies packed close is the STEADY STATE, so "retreat
  backward when a pack presses" fired on nearly every give-ground and bled the
  macro march dry — every seed that won at baseline turned into a
  boss-not-reached timeout, even after tightening the count gate to the
  posture's surround number. The gate that works is **HP pressure**: arm the
  defensive reads only once the fight is actually going badly
  (`OVERWHELMED_HP_FRAC` ~0.7, above the posture `fleeHp` bail). A healthy
  hero keeps the forward-pressing game; a chewed-up one starts protecting his
  exits. That restored boss conversion while keeping the requested behavior.

- **A single-seed sim A/B is loot-luck noise.** One "victory" flipped entirely
  on a 65-dps PLASMA CUTTER drop; any positioning change perturbs RNG
  consumption and reshuffles every later roll. Sweep 5+ seeds and read
  boss-reach, elite engagement (the BOSS ENCOUNTERS table), deaths, and kills
  — not the outcome column of one run.

Smaller notes: the bot steers its own weapon targeting via `GameInput.aim`
(step.ts `nearestEnemy` treats it like the desktop mouse bearing, bias x4), so
`bestAimTarget` is how "shoot the cluster / finish the wounded" is expressed;
and any forward-lane penalty in the escape fan must stay BELOW what one body
blocking a lane scores (~5), or the hero punches through bodies to retreat
"safely" instead of taking the one open gap ahead.
