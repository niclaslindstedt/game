---
title: Making live foes (elites) macro objectives needs a readiness gate, sticky commitment, and bar-based stalemate gauges
date: 2026-07-21
---

Adding the map's elites to the content sweep (`nearestContent`) looks like one
filter, but four traps bit in sequence — each measured on `spacez_hq` easy:

- **Gate the pool on `readyForBoss`.** Under-levelled cross-map elite marches
  replace the tuned early flow (spawner farm → directional fog down the
  authored weave, which already meets the route's elites at the intended
  pace) and wedge the hero in the late-wave flood. Elites-as-objectives works
  as the ENDGAME GUARANTEE (hunt what the sweep missed before the boss), not
  as an early-game override.
- **Commit STICKY, by enemy id.** A moving elite changes its rough cell every
  few seconds; if the cell feeds the content signature, every crossing
  re-picks "nearest" and the march thrashes between two hunts for minutes.
  Hold the committed elite (tracking its current cell) until it's dead or
  abandoned — and when its cell does move, reset the route-progress gauge, or
  the min-ratchet reads a flapping cell as "no headway" and spuriously
  abandons a hunt that is closing.
- **Near a live target, "progress" is its BAR making new lows** — an elite's
  hp, a chest's break hp — never mere proximity. The old "near = engaging =
  hold the abandon timer" deadlocks on elites (bleed → retreat → leash-home
  regen resets the fight forever) and on chests the wave flood never lets the
  hero crack. Skip an abandoned elite by id (`elite:<id>`), not by cell.
- **Ground items need a reachability check.** `nearestWantedItem` steering at
  a drop scattered behind a wall produced GRAB ITEM + UNSTICK storms (60%+ of
  a minute's ticks) — grab → wedge → unstick 160px → grab again, for minutes.
  `blockedByObstacle` on the straight sweep culls them.

Still open: a wall-notch livelock on the weave maps (hero pinned between a
scatter rock and an aisle wall, UNSTICK ↔ router ping-pong with no foe in
reach) — it predates these changes and decides most 8-minute timeouts on
`spacez_hq` for baseline and candidate alike. Also: routing the RETREAT bias
(`travelHeading`) through `routeTarget` instead of the beeline sounds right
but measurably tanked runs AND tripled sim wall time (A* replans every tick
under combat stray) — leave the retreat bias as the crow flies.
