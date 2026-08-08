---
title: Filtering bot goals with plain routeReachable throws away everything behind a closed APPROACH door — and a march gauged flat is a march a fight cancels
date: 2026-08-06
scope: src/game/bot/errands.ts
concepts: [errands, reachability, doors]
---

Two traps, both found putting quest givers into the macro ladder
(`src/game/bot/errands.ts`), and both silent — the feature simply never fired.

**`routeReachable` is the wrong reachability question on a map with interior
doors.** The bot's nav grid is built from the obstacle field, and a closed
`approach` door's leaves are in it, so at tick 0 on GOODCO's floor A* says the
whole building is walled off. A rung that filtered its candidates on
`routeReachable` therefore discarded all three of its quest givers and the bot
cleared the level with three `!` marks standing — with nothing in the logs,
because "no candidates" and "nothing to do" look identical. Use
`reachableThroughDoors` (`bot/nav.ts`), which is `routeReachable` OR
`doorwayVia` — the same knowledge the steering already had, said as a
predicate. It is deliberately optimistic; pair it with an abandon gauge.

**An abandon gauge that measures distance-closed must treat a FIGHT as
progress.** Copying `trackContentAbandon`'s shape gave a 20 s window on "the
remaining route shrank by 40 px" — and standing your ground through a pack,
which is most of a wave level, closes nothing. The clock ran out on every giver
three rooms short of them, every run. Refresh the gauge whenever
`threatCountWithin(state, hero, THREAT_RADIUS) > 0`, the same way `macro.ts`'s
anti-loiter clock counts a live threat ring as "engaged".

And one probe gotcha that wasted a debugging pass: a scenario that teleports a
hero into a fresh run leaves `hero.disarmed` TRUE, because the scripted opening
strike never happened. The bot then sits in `ARM UP` forever, plants, and
nothing you are trying to measure ever runs. Clear it (`hero.disarmed = false`)
in any hand-staged probe.
