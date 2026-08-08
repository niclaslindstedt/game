---
title: A scripted beat's bot branch must aim at the beat's PLACE, not at the nearest foe — and "standing still on purpose" must be exempted from the anti-wedge sweep
date: 2026-08-08
scope: src/game/bot/
concepts: [openingStrike, disarmed, preempt, unstuck, arrivals, entrance]
---

The `disarmed` preempt in `bot/index.ts` (the "ARM UP" branch) read the NEAREST
FOE and either closed to `armApproachStandoff` or planted. That is not what the
beat is: the level pins the rusher and the crowd it breaks from at ONE SPOT
(`openingStrike.at`), and reading the nearest body was an approximation that
held only while that spot was a few steps from the landing.

It stopped holding the moment GOODCO's opening moved indoors (`LevelDef.arrivals`
— the hero now lands on a staff lot outside the building). The failure was not
subtle and it was not obvious from the code: **the first bodies out of the door
reached the hero first, planted him at their own standoff, and then stood
BETWEEN him and the rusher** — which the mob separation grid then kept them
doing, a body's width outside the 22px strike radius, for the whole run. The
hero was holstered for the entire clock on the campaign's first level, with
"ARM UP" on screen and nothing visibly wrong.

**So a scripted-beat branch aims at the beat's own coordinate, on a real route
(`routeSteer`), and only falls into the nearest-foe standoff once it is standing
in the scene.** The nearest foe is a proxy for "the scene"; the scene has an
address, so use the address.

Two more things fell out of the same change and are worth carrying:

- **STANDING STILL ON PURPOSE IS NOT A WEDGE.** `unstuckInput` tests exactly the
  conditions a hero deliberately waiting satisfies — no displacement, nothing
  reachable to fight — so any new "wait here" behaviour must be exempted at the
  top of it, and must clear `nav.stuckMs`/`escaping` while it holds. Left in,
  the escape sweep drags the bot off its spot every 2.4s.
- **A NEW MACRO RUNG NEEDS A `macroThought` ENTRY IN THE SAME COMMIT.** BOT VIEW
  showing a stale label while the hero crosses a car park is exactly the kind of
  lie that sends the next reader into the nav code.

And a measurement note: the bot suites that assert `armedStep <= N` are timing
the STRIKE, not the level, so when a beat moves behind something the run has to
wait for, stage past the wait rather than raising the bound.
