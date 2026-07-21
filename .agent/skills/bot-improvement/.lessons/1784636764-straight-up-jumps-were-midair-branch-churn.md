---
title: Straight-up jumps were mid-air branch churn — commit a hop to a plan and steer it to the landing
date: 2026-07-21
---

"The bot jumps straight up in the air" was not a bad takeoff decision — the
takeoff always had a move target. The waste happened the NEXT tick: a takeoff
books `lastHopMs`, which restarts the hop cooldown, so the first airborne tick
`wantHop` is false and the re-decide frequently lands in a calmer branch (HOLD
returns `steering: false`) — freezing the hero's horizontal motion mid-air.
The jump spent 10% of the pool and translated nothing.

The fix shape (mirrors a human's "decide why you're jumping, then commit"):

- **`Bot.hopPlan`** — every DISCRETIONARY hop is committed by `commitHop`
  before the takeoff: a purpose (`flee` vs reposition-over) and a landing
  target. While `player.z > 0` the decide loop short-circuits (after the
  reflex dodges, which still preempt) into steering at the committed target
  ("HOP OUT"/"HOP OVER"), and the plan clears on landing. Mechanic hops
  (stampede, bale-on-top) never latch a plan — hopping in place IS that dodge.
- **Reachability probe** — `commitHop` sweeps a body-width probe
  `hopCommitDist` (~one hop of travel) toward the target and REFUSES the hop
  when a solid blocks it; the move continues on foot. Note
  `blockedByObstacle` already skips `jumpable` obstacles, so the probe
  correctly still allows hops over low hop-rocks/desks.
- **Melee never press-hops** — step.ts z-gates melee swings above
  `JUMP.dodgeHeight`, so an airborne melee hero deals zero DPS; the
  RUSH/ADVANCE (and boss-orbit) hops are `ranged`-gated. Analysis of the
  branch geometry showed the melee press-hop was in practice almost
  unreachable (the `hurtBackoffPx` flinch pushes GIVE GROUND over ADVANCE at
  contact range), so the gates are mostly future-proofing — the real melee
  waste was the churn above.

Measured (spacez_hq easy, balanced/auto, seed 1 ×5 reruns, 8 min): named-foe
engagements 0 → 6 (one run now reaches and fights DOGE-1), kills 338 → 382,
jumps 8 → 10 (flat — the change fixes jump QUALITY, not the budget).

Test gotcha: `bot.lastThought` after `botAct` is the RESOLVED thought, and
"HOP OUT" shares the `punchout` family so the overlay merges it into the
break-out read — assert the flight by input (steering at `hopPlan.target`),
not by label.
