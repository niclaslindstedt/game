---
title: Scope endgame aggression to hopeless-parity rungs — and give A* the hazards the steering field knows about
date: 2026-07-23
---

Two lessons from making the bot finish JESUS boss fights (#580):

- **"Commit early" reads must be scoped to where parity is STRUCTURALLY
  unreachable** (`parityHopeless`: a player-relative boss — no `authoredMlvl`,
  difficulty offset ≥ 0 — whose level rides the hero's own). A first attempt
  applied the awake-boss lock, the open elite pool, and the skip-the-farm read
  to any big level gap (gap ≥ 8), which re-created exactly what the parity
  gate prevents on authored rungs: under-leveled forced boss holds and
  cross-map elite marches (measured: nightmare spacez/rift runs cancelled, a
  6-death moon). The gap heuristic also misfires on the engine fixtures
  (fixture bosses sit ~19 levels over a L1 hero BY DESIGN — that's the
  leveling window, not a deadlock). Hopelessness is a property of the RUNG,
  not of the current gap.

- **A steering-level avoidance field needs a matching ROUTING-level block.**
  The well repulsion inside `steer()` kept the hero out of black holes, but
  A* still planned routes straight through the discs — the field cancelled
  the march at the boundary and the runner booked wedge penalties tick after
  tick (11 at the rift's chest-guard well, run cancelled). `blockWellCells`
  stamps each well's no-go disc onto the bot's nav grid (bot-side, in
  `ensureRoute` — the engine grid stays hazard-agnostic), so plans curve
  around what the steering refuses to cross. If you add a new no-go field to
  `steer()`, add its cells to the grid in the same change.
