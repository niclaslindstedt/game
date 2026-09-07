---
title: An overlay probe needs a hero who SURVIVES — `openMap` and friends refuse outside `phase === "playing"`, and the probe then reports nothing rather than failing
date: 2026-09-07
scope: pwa/scripts/playtest.mjs, pwa/src/game/overlays/
concepts: [playwright, probes, staging, scenario, overlays, false-green]
---

Photographing an in-run overlay (the level map, the bag, the quest log) on a
LATE venue fails in a way that looks like the feature is broken. `--strategy
idle` on `boot_hill` at hero level 1 is dead inside ~12 s, and every screen
opener is gated on `state.phase === "playing"` (`openMap` in
`engine/game/map.ts`), so pressing M on a `dying` run leaves
`players[0].screen` undefined and the screenshot shows the field. Nothing
errors.

Stage a hero who lives instead — `?scenario={"level":40,"stats":{"str":60,
"dex":60,"vit":90}}` with `--strategy kite` was enough for boot_hill — and
ASSERT the phase from the page before opening anything.

Two more facts that decide how such a probe is written:

- **`freeze: true` is not a staging shortcut for anything quest-driven.**
  `step/index.ts` guards the whole quest pass with `if (!state.freeze)
  stepQuests(...)`, so a posed world never walks an escort, never books an
  objective and never reconciles a map pin.
- **Pushing onto an ARRAY in `window.__game` sticks**, unlike writing
  `players[0].pos` (which the next tick overwrites). Appending an `EscortState`
  to `state.escorts` is a legitimate way to stage an errand's field state
  without walking a giver's whole conversation and its chain gates.
