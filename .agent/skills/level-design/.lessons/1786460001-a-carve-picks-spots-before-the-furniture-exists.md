---
title: A carve picks its pinned spots BEFORE any furniture exists, so a scripted body can be minted inside a gantry rank — and a wedged rusher never gets anywhere
date: 2026-08-08
scope: src/game/mapgen/, src/game/create.ts
concepts: [opening-strike, pinned-spawns, obstacles, ranks, wedge]
---

`resolveLevelDef` chooses every pinned coordinate — an elite's post, the opening
strike's rusher and the crowd around it — and `createGame` scatters the
obstacles AFTERWARDS. Nothing reconciled the two, so a pinned body could be
minted standing inside a prop.

It is not cosmetic. A wedged mob is shoved a fraction of a pixel per tick by the
shared push-out and **never gets anywhere**: measured on the campaign's first
level, on the first seed tried, the vanguard whose touch arms the hero sat in a
gantry for the whole run while the hero waited to be armed. `create.ts` now
walks a pinned spot outward in a fixed deterministic spiral until it finds floor
(`clearOfFurniture`), which costs no rng draw and moved nothing on the seeds
that were already fine.

**A ROW IS A WALL to anything that beelines**, and that is the second half of it.
`type: row` props (a gantry bank, a conveyor, fuselage jigs) are laid at a
`spacing` far tighter than a body's diameter, so a rank across a room is
impassable to a mob — which beelines, because only the hero pathfinds. So
placing a set piece "in the first room past X" is not enough: check it can
actually LEAVE that room toward where it has to go (`blockedByObstacle` against
its target), and walk it back until it can. That check belongs at run creation,
where the obstacles exist, not in the carve, where they do not.

The general rule: **the carve decides WHERE by geometry; anything that has to be
true of the FURNITURE is settled in `create.ts` afterwards.**
