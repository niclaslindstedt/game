---
title: A DERIVED sprite family adds ids to `mod/catalog.json` even though you authored no new YAML
date: 2026-08-09
scope: scripts/sprite-data/, scripts/asset-tools/, mod/catalog.json
concepts: [derived-sprites, mod-catalog, quality-gates, drift]
---

Adding a build-time derivation (`asset-tools/spin.mjs`, which emits a pair of
`<id>_roll_0`/`_roll_1` overlays per vehicle) put 44 new sprite ids in the atlas
without a single new file under `content/sprites/`. `mod/catalog.json` is a
COMMITTED artifact drift-tested against a fresh build, so the branch went red on
`mod_catalog_test` after the push.

The rule in `AGENTS.md` — "a content change that adds or retires an id runs
`make mod-catalog` in the same commit" — reads as being about authoring, and
that is exactly how it gets missed: nothing was authored. The trigger is the
ID LIST changing, and a derivation changes it wholesale.

- **After touching anything under `scripts/sprite-data/` or `asset-tools/` that
  REGISTERS frames, run `make mod-catalog`.** Same for a new wound stage, a new
  worn-gear ramp, a new wreck rung — every one of those is a family of ids.
- **`npx vitest run tests/content/mod_catalog_test.ts` is the one-second
  check**, and it is worth running before the commit rather than finding it in
  a CI shard four minutes later.
