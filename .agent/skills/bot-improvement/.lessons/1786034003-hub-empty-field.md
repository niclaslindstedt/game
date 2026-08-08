---
title: The empty-field IDLE branch is a level's whole behaviour on a HUB — and `?level=<hub>` cannot show you the trip out
date: 2026-08-06
scope: engine/game/bot/
concepts: [idle-branch, hubs, testing]
---

`decideAct` short-circuits to `IDLE` the moment `state.enemies.length === 0`,
which is right everywhere except the venue whose objective is `hub`: a hub
places no knot at all (`horde: 0` on every area), so "no enemies" is not a
lull, it is the level. That one branch is the whole reason engaging AUTO PILOT
in the garage did nothing — the macro ladder below it never ran, and every rung
of it would have answered "nothing" anyway (no cache, no fog on a `revealed`
floor, no boss). A new venue kind that has no horde needs its own rung ABOVE
that branch, not a knob.

Two traps while measuring it:

- **`?level=<id>` PINS the run.** `run-setup.ts` computes
  `runLevelId = devLevel ?? levelId`, so a `carDeparted` / `gateEntered`
  crossing calls `setLevelId(next)` and the effect rebuilds *the same level*.
  A garage playtest therefore loops the garage forever and the drive-out looks
  like a hang (a black departure curtain). Read `window.__game.departure.to` to
  see the trip really booked; the real app (PLAY → LOAD lands at `"garage"`
  with no `?level=`) crosses fine.
- **`botShopMsRef` carries SIM ms across run remounts.** It is a
  component-lifetime ref, and every fresh run restarts `stats.timeMs` at 0 — so
  a level entered after a trade came in with the mark in its future and the
  counter stayed shut for a full `BOT_SHOP_COOLDOWN_MS`. Invisible on a mission
  (the bot is off fighting), obvious on a hub, where the visit IS arrive-trade-
  leave: the hero stood at the stall for 13 s doing nothing. `bot-driver.ts` now
  rewinds the mark when the clock goes backwards.
