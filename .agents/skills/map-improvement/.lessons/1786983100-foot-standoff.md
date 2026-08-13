---
title: A blocker under a standing prop's own feet stops the hero's PICTURE a body-length short — lift it with `blockLift`
date: 2026-08-13
scope: content/maps/, engine/game/obstacles.ts, engine/game/vehicles.ts
concepts: [collision, blockers, billboards, props, block-lift]
---

The hero collides as a disc centred on his position and his boots are DRAWN
about 6 screen px below it, so a blocker laid honestly under a car's wheels or
a tree's trunk brings him to rest with `PLAYER.radius` + `PLAYER.footLift` ≈ 18
world px between his soles and the thing he is pressed against. Measured on the
garage: the wagon stopped him 18 screen px below its tyres, the ship 16, a tree
8 — every one of them reading as "standing a couple of strides in front of".

`FOOT_STANDOFF` (engine/game/obstacles.ts) is that number and the fix is to lay
the blocker's south edge that far UP-SCREEN of the ground line you want his
boots on: `MapObject.blockLift` for authored furniture (the art does not move),
`CAR.footprint.lift` / `SHIP.footprint.lift` for the machines.

Two things fall out and both bite:

- **The far side gets worse by the same amount.** The blocked band is
  `2 · PLAYER.radius` deep before the piece's own radius, so front and back are
  always ~15 screen px + `1.5 · radius` apart. Spend the lift on the side the
  player looks at, and SHRINK the radius (a tree is a trunk, not a crown) —
  that is the only knob that narrows the gap on both sides at once.
- **Anything sorting a machine against the hero must compare his BOOTS**
  (`heroY + PLAYER.footLift`), not his position, or a hero standing in front of
  a lifted car is drawn behind it. `onLayer` in pwa/src/game/render/vehicles.ts.

Measure it headlessly: push a point along in 0.25 px steps through
`resolveObstacles` and print the resting `dy`. A screenshot says it looks wrong;
the sweep says by how much, and re-runs against the fix.
