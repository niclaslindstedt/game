---
title: `objective: hub` is CLAIMED — `hubLevelId()` returns the first level wearing it, so a second one makes the game's home address a question of catalog order
date: 2026-08-12
scope: content/levels/, engine/game/defs/levels/index.ts
concepts: [objective, hub, level-catalog]
---

A venue that should never clear looks like it wants `objective: { type: hub }` —
it is the one objective `objectiveCleared` answers `false` to unconditionally.
It is not available: `hubLevelId()` (`engine/game/defs/levels/index.ts`) finds
the hub by scanning the catalog for the first `objective.type === "hub"`, so a
second such level makes which venue is HOME depend on compile order.

Use `clearAll` on an empty field instead. It reads as cleared on tick one, and
the thing that holds the run open is the caller's own staging — `noVictory` in a
`ScenarioSpec` latches `state.staying`, which is what stops the victory
countdown ever arming. That is exactly how the effects gallery's `STAGE_BASE`
already keeps every diorama up.
