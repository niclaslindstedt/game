---
title: A knob is authored only if it belongs to the SCREEN — one that belongs to a catalog row is built beside it, and either way menu_tree_test asserts an exact aria list
date: 2026-08-09
scope: content/mainmenu.yaml, pwa/src/game/title-screen/
concepts: [mainmenu, rows, catalog, testing]
---

The MINIGAMES shelf builds its cabinet rows from a code catalog and concatenates
them around the screen's authored rows. Which kind a new KNOB is turns on WHO IT
ADJUSTS:

- **It adjusts the screen** (DIFFICULTY — the rung every cabinet is weighed on)
  → an authored row. `assembleRows` demands exactly one builder per authored id
  and `baseRow` reads the label out of the compiled tree, so it goes in
  `content/mainmenu.yaml` like any other and only its VALUE comes from code. Add
  it to BOTH the player screen and its developer twin (`minigames` and
  `devminigames`) — they share a builder, so a row on one and not the other
  throws at build.
- **It adjusts ONE catalog row** (DIRECTION — only THE ROAD has two ends) → not
  an authored row at all. Build it from the catalog next to the row it belongs
  to, label it out of the def, and emit it only where that entry has a choice
  (`MINIGAME_ORDER.flatMap` in `menus-minigames.ts`). Authored at the foot of
  the screen it reads as a knob every entry answers to, and the tree cannot
  express "present for this one row" at all.

Either way `tests/content/menu_tree_test.ts` asserts the shelf's rows as an
EXACT aria array, so a new or moved row is a test edit in the same commit — the
failure is legible but neither typecheck nor lint will catch it.
