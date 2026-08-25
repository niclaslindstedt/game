---
title: Staging a deterministic rocket wreck — stage=hit, a paper hull, and the intro cards hold the sim clock
date: 2026-08-25
scope: pwa/src/game/rocket-screen/
concepts: [minigame, debugging, screenshots, determinism]
---

To LOOK at the flight's wreck explosion on demand: load
`?rocket&launch=0&debug&stage=hit&seed=N`, tap through BOTH intro cards, set
`window.__flight.craft.hull = 0.02`, hold ArrowDown, and the planted
satellite wrecks the ship in the first seconds; frames are then scheduled
off `window.__flight.outcomeMs` (the wreck hold is `FLIGHT.wreckHoldMs`,
2400 ms). Two traps: the intro cards HOLD the fixed step, so a harness that
waits on `__flight.ms > 100` before dismissing them waits forever (wait for
`__flight` to exist, dismiss, then wait on ms); and the climb camera rides
the ship at 72% of the frame's height, so anything staged at the craft plays
LOW in the frame — `flightCamera` recenters on a wreck for exactly this
reason.
