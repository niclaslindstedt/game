---
title: A decaying knockback impulse rides new Enemy/Player velocity fields + one gate in moveEnemy
date: 2026-07-19
---

A shockwave that FLINGS mobs and the hero to the sides (the meteor-blast
knockback) is not the flat-displacement `applyKnockback` (loot.ts, the weapon
affix) — a teleport-a-few-px shove reads as a jerk, not a launch. Model it as a
decaying VELOCITY impulse:

- Add `knockMs?/knockVel?` to `Enemy` and `knockMs/knockVel` to `Player`
  (types.ts; init the player pair in create.ts — they're transient run state, so
  NO pwa `SAVE_VERSION` bump, unlike persisted loadout/companion fields).
- Arm the impulse at the event site (`launchEnemy`/`launchPlayer` in hazards.ts):
  point `knockVel` straight out from ground zero at a falloff-scaled speed and
  set `knockMs`.
- Coast + decay both in ONE new step (`stepKnockback`), called right AFTER the
  hazards fire in step.ts so an impulse armed THIS tick lands its first shove the
  same frame. Decay with `Math.exp(-dtMs / tauMs)` — deterministic, fast-then-eases,
  no stored initial speed needed; clamp to bounds and `resolveObstacles`.
- Gate the mob AI so the fling READS: one early-return at the top of `moveEnemy`
  (`if (enemy.knockMs && enemy.knockMs > 0) return;`) — otherwise the chase
  immediately fights the shove back and nothing moves. The hero is NOT gated (a
  brief shove on top of his own steering, not a stun; a full lock is the separate
  `knockoutMs`).

Role scaling reuses `KNOCKBACK.roleScale` ({minion:1, elite:0.5, boss:0}); a
boss's 0 makes `launchEnemy` a no-op (speed<=0 guard) so a telegraphed set piece
is never nudged off its mark.
