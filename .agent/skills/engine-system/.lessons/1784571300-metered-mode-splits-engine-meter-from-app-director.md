---
title: A paid/metered MODE splits into an engine meter + an app flight director
date: 2026-07-20
---

The AUTO PILOT (coin-drained self-play, `src/game/autopilot.ts`) needed state
that outlives a single run — but the engine's `GameState` dies on every level
change. The split that worked:

- **The engine owns the METER, per run**: an `autopilot` block on GameState
  (active/speed/drainCarry/coinsSpent), mutators, and a `stepX` that bills on
  game time inside `step()` — so paused/dialogue/shop phases never bill, the
  drain is deterministic and unit-testable, and the engine disengages ITSELF
  (with an event pushed inside step) when the resource runs out. Keep a
  fractional `drainCarry` so whole-unit deductions never round the bill away.
- **The app owns the SESSION, across runs**: a GameScreen ref (`engaged`,
  speed, find history, totals) that re-arms the meter on each fresh
  `createGame` and implements the flight director in the EVENT loop (victory →
  route on, defeat → restart, gateEntered → totals) by driving the same
  `setLevelId`/`setRunId` levers the splash buttons use. Compare the routing
  target against `state.level.id` — `setLevelId(same)` never remounts; use
  `setRunId` bump for a same-level restart.
- **Routing that needs app-side unlock state stays engine-pure by taking it as
  args** (`autopilotNextLevel(current, {order, beaten, farmLevel}, exitTo)`) —
  engine tests then run on made-up ids, no shipped content.
- **Driving the live hero reuses the GameScreen bot branch**: gate `if (bot)`
  on `bot ?? (state.autopilot.active ? lazyBot() : null)`. The branch already
  clears paused phases, spends level-ups, and wires consumables/spells —
  don't rebuild it. Mid-run engagement must NOT rely on run-start-only setup
  (e.g. `muteDialogue`): call it at engage time, and add an `unmuteDialogue`
  mutator for the hand-back.
- **React lint traps**: the session must be a `useRef` mutated only in
  effects/handlers (a `useState`-held object trips `react-hooks/immutability`
  on direct writes), with a separate `useState` SNAPSHOT for anything render
  reads (reading a ref during render trips `react-hooks/refs`); sync the
  snapshot after every mutation.
- The fast-forward already existed (`simSpeed`, steps-per-frame): the loop's
  `speed:` callback just reads `state.autopilot.speed` while active, so the
  meter and the clock can never disagree. New GameState block = pwa
  `SAVE_VERSION` bump, as always.
