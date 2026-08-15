---
title: The drive's whole road shape is two numbers on `drive.params`, and moving them mid-leg has two hard constraints
date: 2026-08-15
scope: engine/game/drive/
concepts: [drive, geometry, seeded-content, spawners]
---

Every distance on the road — the taper, the crowd and traffic gates, the
blockade, the town's district gradient, the sites, the renderer's own gate — is
derived afresh from `cityStartPx(params)` / `cityEndPx(params)` /
`courseLength(params)`, which read exactly two fields: `cityPx` and `coursePx`.
So the leg is RESHAPED by writing those two, and nothing needs telling. (This is
what `holdDriveOpening` does to hold the town away while the hero's opening
thought is on screen.) `createDrive` keeps its own copy of `DriveParams` so a
caller's object cannot grow a road under it.

Two constraints on any such move:

**The course moves by TWICE the gate's delta.** `cityEndPx` is
`courseLength - cityStartPx` — the outskirts bracket the town symmetrically — so
`cityPx += Δ` alone SHORTENS the town by Δ. `cityLength` is the stretch the clock
runs over and the board ranks, so it has to come out unchanged:
`coursePx += 2Δ`.

**A gate that moves must stay ahead of the spawners' reach.** `spawnLanes` /
`spawnPavement` / `spawnProps` ask the LIVE gate whether the mark they are about
to fill is town or outskirt, at up to `DRIVE.spawnAheadPx * 1.6` in front of the
car. A gate held closer than that lays four lanes of the town's traffic onto a
two-lane country road the gate then slides away from.

Also worth knowing before blaming yourself for a far-away red: the town's block
layout is seeded on `direction:coursePx:cityPx:block` (`town-plan.ts`), so
changing either length re-seeds the whole town and every draw downstream of it.
A restart reproduces the road because `restartDrive` rebuilds from
`previous.params` — which is where a length settled mid-leg is kept.
