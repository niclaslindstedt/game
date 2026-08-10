---
title: A new PIXEL FONT GLYPH drifts `mod/catalog.json` — it carries a `glyphs` string, and only `make test` says so
date: 2026-08-10
scope: scripts/asset-tools/font.mjs, mod/catalog.json
concepts: [quality-gates, drift, false-green, mod-catalog, fonts]
---

`mod/catalog.json` is committed and drift-tested, and AGENTS.md frames that as an
ID question ("a content change that adds or retires an id"). It is not only ids:
the catalog also carries a `glyphs` field — the whole of `GLYPHS` in
`scripts/asset-tools/font.mjs`, joined and sorted — so adding ONE character to
the pixel font (a `"` for a rally clock, say) turns `tests/content/mod_catalog_test.ts`
red with a message about ids that has nothing to do with what changed.

Nothing cheaper than the full `make test` catches it: `npx eslint`, `tsc`, the
touched suites and even `make lint` all pass. The fix is one command in the same
commit — `node mod/tools/catalog.mjs` (or `make mod-catalog`) — and it is worth
running proactively the moment a font glyph is added rather than waiting three
minutes to be told.
