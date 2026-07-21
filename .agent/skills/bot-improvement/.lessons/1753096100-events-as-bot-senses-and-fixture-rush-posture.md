---
title: state.events is the bot's clean channel for learned memory, and the boss-ready fixture flips posture rows under tests
date: 2026-07-21
---

Two findings from the pass-over top-off + learned-arrow work:

- **`state.events` is a legitimate, deterministic bot sense.** For "the bot
  should REMEMBER what an arrow pays" (rather than cheat by importing the
  engine's award formula), reading the last step's `itemCollected`/`levelUp`
  events in a `track*` helper is the clean channel: events survive until the
  next `step()` clears them, so `botAct` sees exactly one step's worth, and
  they're pure state — determinism holds. Skip learning on any step whose
  events also carry a `levelUp` (the XP bar was replaced mid-step, so the
  award/bar ratio is unreadable that tick). Round remembered values coarsely
  (5% steps) — the point is a human-feel estimate, not telemetry.

- **The engine-fixture run is BOSS-READY from level 1, so `survive()` tests run
  the AGGRO posture row.** `test_level`'s boss sits within `bossEngageMargin`
  of a fresh hero and `marchingOnFoe` is true (the macro goal is the boss), so
  `rushing` flips balanced → aggro: `fleeHp` is 0.28, not 0.4. A test staging
  "bleeding below the bail" at hp 0.3 never enters the emergency branch and
  fails mysteriously into a later read (measured: the GRAB ARROW test landed in
  the safe-side scoop as GRAB ITEM). Stage emergency-branch tests below the
  AGGRO thresholds, or over-level the fixture boss to kill the rush.

- Also: an engine input like `useMedkit` is level-triggered (`if (input.useMedkit)
  consumeMedkit(state)` fires every tick it stays true) — a bot read that must
  spend exactly ONE consumable needs a self-limiting condition (e.g. "stack is
  full" goes false after the first spend) or its own cooldown; don't rely on an
  edge the engine doesn't implement.
