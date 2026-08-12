---
title: The fixture difficulty ladder omits mobLevelMin/mobLevelMax, so engine tests exercise the UNCAPPED horde-level path
date: 2026-08-12
scope: tests/engine/fixtures.ts, engine/game/menace.ts
concepts: [fixtures, difficulty, scaling, mob-level]
---

Every shipped difficulty in `engine/game/defs/difficulties.ts` carries
`mobLevelMin`/`mobLevelMax`, which clamp `playerLevel + mobLevelOffset` into a
band. The fixture ladder in `tests/engine/fixtures.ts` deliberately carries the
offset and NOT the caps, so `mobHpScaleFor` runs unclamped under
`tests/engine/` — including below level 1, where a negative offset (fixture EASY
is −3) drives the horde level negative and `MENACE.mobHpScaleFloor` is the only
floor.

Two consequences worth knowing before editing either side: a change to the
clamping branch is not covered by the engine suite unless the test adds caps to
its own difficulty, and adding caps to the fixture ladder to "match shipped"
silently moves the hp every scaling assertion is calibrated against.
