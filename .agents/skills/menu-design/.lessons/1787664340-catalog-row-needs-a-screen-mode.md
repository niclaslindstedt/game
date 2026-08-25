---
title: A screen per CATALOG row is a MODE, never a tree entry — one authored screen plus a `MenuContext` field
date: 2026-08-25
scope: content/mainmenu.yaml, pwa/src/game/title-screen/
concepts: [mainmenu, rows, catalog, screens, headings]
---

When a catalog row has to OPEN a page of its own (a minigame cabinet's
settings), do not author a screen per row: the tree cannot grow an entry every
time the catalog does, and the whole point of the catalog is that adding a row
costs nothing outside it. Author ONE screen and carry WHICH row on the context,
exactly as the developer WARP is carried — a `MenuScreen` union entry, a field
on `MenuContext`, `useState` in `TitleScreen`, and `home: dynamic` because the
parent's rows are all catalog-built.

Four things that bite:

- The heading is dynamic, so `headingFor` needs the new field as a parameter.
  Override only the TITLE off `screenHeading(screen)` — keeping the tree's
  `trail` and `tone` is what lets the developer twin keep its full breadcrumb
  and its dev colour.
- A `dev: true` screen may not parent a plain one, so the pair is authored
  TWICE (`minigame` / `devminigame`) and built once by a shared builder.
- The BACK row needs its `at` computed (`MINIGAME_ORDER.indexOf(id)`), because
  `home: dynamic` gives it nothing to land on.
- `buildMenu` must guard on the field being set (`screen === "minigame" &&
  ctx.cabinet`) so an unreachable state falls through to the lone BACK row.

And when a catalog row must sit BETWEEN two authored rows, splice it by ROW ID
(`authored.findIndex(r => r.aria === rowAria(screen, "difficulty"))`) rather
than by index — `assembleRows` may drop a row on some builds.
