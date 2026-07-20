---
title: "Taking damage" and "low HP" are first-class bot signals — read player.hurtFlashMs and gate the escape hop on an HP threshold
date: 2026-07-20
---

Two cheap, deterministic player-state signals make the autopilot read as
self-preserving instead of reckless, and both are worth reaching for:

- **`player.hurtFlashMs > 0` = "bitten within the last ~250ms".** It's set to
  250 by every player-damage source (contact `step.ts`, ranged, slam, hazards,
  story) and decays each tick, so it's a clean, pure "just took a hit" flag.
  Use it to widen the danger bubble by a few px right after a hit (`hurtBackoffPx`)
  so the hero FLINCHES back off a trade instead of standing in it. Short-lived,
  so it nudges without unravelling the hold.
- **`player.hp <= player.maxHp * hopHpFrac` (~0.5) = "bleeding".** Gate the
  discretionary escape JUMP on `(surrounded || bleeding) && bodyAtContact &&
  hasHopStamina` — so a hero at half health spends the untouchable airborne
  frames to escape a bite even WITHOUT a full ring, while a healthy hero only
  hops to break a genuine surround. This is what "jump when health drops to 50%"
  means in code.

Note `hopHpFrac` (0.5) sits ABOVE the posture `fleeHp` (balanced 0.4): the
emergency bail fires at `fleeHp`, but the hop-when-bitten should trigger earlier,
so keep them separate knobs.

Measuring "braver vs. more careful": the melee grind probe (default sword, ~40
STR, steady 6-mob pack) is the read. Making the bot LESS brave should drop
`damageTaken` and lift ending HP sharply while barely moving kills/`damageDealt`
— e.g. this pass cut dmgIn 72→24 and ending HP 28→76 for -3 kills. If kills
crater, the standoff bump went too far.
