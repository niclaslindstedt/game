---
title: A knob that adjusts CATALOG rows is still an authored row — and adding one to a shelf breaks menu_tree_test's exact aria list
date: 2026-08-09
scope: content/mainmenu.yaml, pwa/src/game/title-screen/
concepts: [mainmenu, rows, catalog, testing]
---

The MINIGAMES shelf builds its cabinet rows from a code catalog and concatenates
them ahead of the screen's authored rows. A new KNOB beside them (DIRECTION,
next to DIFFICULTY) is not a catalog row: `assembleRows` demands exactly one
builder per authored id and `baseRow` reads the label out of the compiled tree,
so the knob is authored in `content/mainmenu.yaml` like any other and only its
VALUE comes from the catalog.

Two things bite. Add the row to BOTH the player screen and its developer twin
(`minigames` and `devminigames`) — they share a builder, so a row authored on one
and not the other throws at build. And `tests/content/menu_tree_test.ts` asserts
the shelf's rows as an EXACT aria array, so a new row is a test edit in the same
commit; the failure is legible but it will not be caught by typecheck or lint.
