---
title: Taking rows off a settings page can leave the page itself unearned — check its parent before you stop
date: 2026-08-06
---

A change framed as "remove this row / move these rows elsewhere" is also a
change to whether the page they lived on still deserves to exist. Removing
BLOOM and moving COLOR GRADE / VIGNETTE / DEPTH HAZE to DEVELOPER → VISUALS
left SETTINGS → VIDEO holding exactly one row, and that row only `opens:` the
GORE page — a page whose whole content is a door to another page.

Worse, the surviving row was a CONDITIONAL one. `gore` is dropped outright when
the device's guardian says no mature content, so on that device VIDEO would have
rendered as a heading, a help line and BACK. That is the blank-page failure the
tree already avoids elsewhere (the SETTINGS index hides CONTROLS when every row
on it is desktop-only), and it is invisible from the YAML — the row is still
authored there; it is the BUILDER that returns `null`.

So after pulling rows, ask two questions about the page they came off:

1. Is what's left still a page, or a redirect? One `opens:` row is a redirect —
   promote the child onto the parent index and retire the screen.
2. Can any of what's left be absent on some build? If so, play out that build:
   the page may be empty there even though it reads full in the YAML.

Retiring a screen is five edits and the compiler + `menu_tree_test` catch four
of them: `content/mainmenu.yaml` (the screen, its parent's row, and the child's
`parent:`), the `MenuScreen` union in `menu-model.ts`, the dispatch in
`menus.ts`, the builder itself, and `UNION` in `tests/content/menu_tree_test.ts`.
The one nothing catches is `pwa/scripts/ui-shots.mjs`, which walks the tree by
hand — a retired screen leaves a dead `click()` there that only fails when
somebody next runs the sweep.
