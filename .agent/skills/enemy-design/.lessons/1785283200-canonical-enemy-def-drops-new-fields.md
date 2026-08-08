---
title: A new EnemyDef field must be added to canonicalEnemyDef or it vanishes at runtime
date: 2026-07-28
scope: engine/game/defs/enemies/
concepts: [enemy-def, canonicalization, generated-catalog]
---

`engine/game/defs/enemies/index.ts` rebuilds every compiled def through
`canonicalEnemyDef` — a fixed-field factory that exists so all ~100 defs share
one V8 hidden class (the tick's per-enemy AI loop goes megamorphic otherwise).
It lists each field EXPLICITLY.

So a new field added to `EnemyDef`, authored in the YAML, validated by
`enemy-schema.mjs` and correctly present in `engine/generated/enemies.ts` is still
**dropped on the way to `enemyDef()`** unless it is also added to that factory.
Nothing fails: the schema passes, the snapshot round-trips (it reads the
generated catalog, not the accessor), the typecheck passes (every field is
optional), and the build is green. The field simply reads `undefined` at every
consumer, so whatever it was meant to switch on quietly never happens.

Adding a field to a monster is therefore FIVE places, not four:
`types.ts` → `enemy-schema.mjs` → the YAML → **`canonicalEnemyDef`** →
`ENEMY_FIELDS` in `pwa/scripts/library/model.mjs`.

The tell when debugging: the generated catalog has the field (grep
`engine/generated/enemies.ts`) but the behaviour never fires. Don't hunt the
consumer — check the factory first. A magenta `fillRect` at the top of the draw
that should be happening answers "is this code reached at all?" in one shot and
is worth doing before re-reading any logic.
