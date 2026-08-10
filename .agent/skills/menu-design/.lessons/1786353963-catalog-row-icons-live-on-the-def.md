---
title: A CATALOG-built row's icon comes from its def, not from mainmenu.yaml — and a new def field breaks the engine fixtures
date: 2026-08-10
scope: pwa/src/game/title-screen/, engine/game/defs/
concepts: [mainmenu, rows, catalog, icons, testing]
---

`content/mainmenu.yaml` authors rows for the screens that HAVE authored rows; the
difficulty ladder, the mission list, the roster and the mod list author `rows: []`
and are built from a catalog. Giving those rows an icon is therefore NOT a YAML
edit and the menu compiler's icon checks (unknown sprite, two rows sharing an
emblem) never see it — the icon is a field on the DEF (`DifficultyDef.icon`,
beside `color`, which is already there for exactly this reason) read by the
builder in `menus-campaign.ts`.

The trap on the way: `tests/engine/fixtures.ts` constructs whole `DifficultyDef`
literals for the synthetic-fixture suites, so ANY new required field on the def
is five typecheck errors in a test file, not one. Add it there in the same edit.
A new sprite also owes `make mod-catalog` in the same commit.
