---
title: A new EnemyDef field is SEVEN places, and every one it misses fails silently
date: 2026-07-28
scope: engine/game/defs/enemies/, scripts/asset-tools/enemy-schema.mjs, mod/tools/
concepts: [enemy-def, canonicalization, generated-catalog, mod-catalog, silent-failure]
---

`engine/game/defs/enemies/index.ts` rebuilds every compiled def through
`canonicalEnemyDef` — a fixed-field factory so all ~114 defs share one V8 hidden
class (the tick's per-enemy AI loop goes megamorphic otherwise). It lists each
field EXPLICITLY.

So a field added to `EnemyDef`, authored in the YAML, validated by
`enemy-schema.mjs` and correctly present in `engine/generated/enemies.ts` is
still **dropped on the way to `enemyDef()`** unless it is also in that factory.
Nothing fails: the schema passes, the snapshot round-trips (it reads the
generated catalog, not the accessor), the typecheck passes (every field is
optional), the build is green. The field simply reads `undefined` at every
consumer.

The full list, and what each one silently costs when skipped:

1. `types.ts` — the contract.
2. `scripts/asset-tools/enemy-schema.mjs` — no entry means a half-authored
   block is accepted and the mob quietly does nothing.
3. the YAML.
4. **`canonicalEnemyDef`** — as above.
5. `ENEMY_FIELDS` in `pwa/scripts/library/model.mjs` — this one is LOUD
   (`assertFieldsCovered` throws), but declaring without also reading it in the
   traits model and writing prose for it satisfies the throw and publishes
   nothing.
6. **`mod/tools/catalog.mjs`**, if any OTHER catalog cross-references the field
   (a level naming "the monster that carries this"). The mod compiler validates
   against `catalog.json`, not the engine, so a check that exists in
   `scripts/asset-tools/*-schema.mjs` is dead for a mod unless the id set it
   reads is exported there.
7. **`mod/tools/build.mjs`**, where that set is unioned with the mod's own defs
   so a mod's level may name a mod's monster.

The tell when debugging: the generated catalog HAS the field (grep
`engine/generated/enemies.ts`) but the behaviour never fires. Don't hunt the
consumer — check the factory first.
