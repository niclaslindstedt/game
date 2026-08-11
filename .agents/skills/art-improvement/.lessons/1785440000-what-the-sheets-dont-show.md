---
title: What the audit sheets DON'T show you — motion, context, and whose ground it is
date: 2026-07-30
scope: scripts/level-render.mjs
concepts: [survey, blind-spots, context]
---

Two ways the sheets mislead, merged from separate fragments because they are the
same trap: a sheet is a still life and the game is not.

- **Motion and hierarchy.** `variants`/`concepts` prove `_0`/`_1` both read and
  that wounds survive, but ground separation, scale next to the hero, and the
  walk cadence only show in the running game. The scenario pose check (Phase 4
  step 7) closes that loop for anything stageable — a frozen screenshot for the
  read, an unfrozen run for the motion. Don't trust still frames alone, and
  don't hand-play the game to reach the sprite either.
- **Whose ground.** `concepts`/`variants`/`sheet` render over the sprite's HOME
  family ground tile, not the audited level's. A shared mob renders over grey
  deck while you audit Mars, and a white robot on grey deck looks washed-out and
  headless — which will trick you into flagging art that is fine. Judge a shared
  sprite on the LEVEL sheet (`level <id>` uses that level's own ground) before
  condemning it.

An obstacle/tile/decor/landmark is not stageable at all (placed at level
creation). For those, `scripts/level-render.mjs <id> --bare --dormant` draws the
whole level with the real sprites over the real ground — crop into it rather
than hoping the playtest bot wanders past one.
