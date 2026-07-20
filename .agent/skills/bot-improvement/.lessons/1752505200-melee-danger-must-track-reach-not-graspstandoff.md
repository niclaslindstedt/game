---
title: A melee hero's danger/hold distances must track the blade's REACH, not the ranged graspStandoff — and the deadband must be reach-relative
date: 2026-07-20
---

`survive()` in `bot.ts` fights from two distances: `dangerDist` (give ground
hard) and `engageDist` (the hold). The ranged path derives them from
`graspStandoff` (72px) and `reach * engageRangeFrac`. The old melee path reused
`graspStandoff` as its danger bubble — but a STARTER MELEE WEAPON reaches barely
past arm's length (`medieval_sword` base range 38; `weaponRangeFor` widens it by
STR at only `rangePerStr` 0.02/pt, so a low-level blade is ~38–50px). Holding
off at 72 parked the hero BEYOND where his blade lands, so he fled every body
and only ever connected when a mob ran him down — one swing, back out. That is
the "melee is too cowardly / plays like ranged" complaint.

Two fixes, both required:

1. **Derive melee `dangerDist`/`engageDist` from the blade's own `reach`**, not
   the ranged grasp: press-depth `reach * meleeHoldFrac` for the hold, a tight
   `meleeGraspStandoff` (~48, clamped below the hold) for the danger bubble.
2. **The deadband (`holdBand`, 28px flat) must be reach-relative for melee.** A
   28px band is WIDER than a whole starter blade's ~44px reach, so `engageDist +
   band` sat past `reach` and the "stand still and fire" deadband parked him
   beyond striking distance — the coward's hold, just relocated. Size the melee
   band so the hold span is exactly `[danger bubble → press depth]`
   (`engageDist = midpoint`, `band = half-width`), so ADVANCE keeps firing until
   a foe is within striking range.

Verify with a forced-melee grind (the auto-equip prefers guns even for a STR
build, since guns scale off STR — `--class melee` will NOT keep a blade in hand,
so stage the default sword directly and drive vs a steady pack). A good change
roughly doubles damage-dealt and lifts kills, at the cost of a little more chip
damage taken (melee tanks — that's the trade).

Separately, on JUMPS: a takeoff costs `STAMINA.jumpCost` (10% of the pool) and
only STANDING STILL refills it, so hopping every scuffle winds the hero out
(empty pool → `emptySpeedFactor` jog → run down). Gate discretionary hops on (a)
a genuine surround, (b) a body actually within `CONTACT_DODGE_RADIUS` (about to
bite — otherwise the untouchable frames buy nothing), and (c) a stamina RESERVE
(`hopStaminaReserve` ~0.35) above the single-jump floor. Telegraphed slam/charge
dodges should step off on foot (the windup gives time) — a hop there is pure
drain. Mechanic-specific dodges a jump is the ONLY escape for (stampede wall,
bale on top) still hop unconditionally.
