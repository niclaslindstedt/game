---
title: The DEVELOPER warp moved under PLAYGROUND — check the menu path when every shot times out
date: 2026-08-05
scope: content/mainmenu.yaml
concepts: [developer-menu, warp, navigation]
---

`stageRun` walks the real title menus, so a reshuffle of `content/mainmenu.yaml`
breaks the whole harness at once and the symptom is unhelpful: a click that
waits 30 s for a button, then every recipe reporting a timeout. The warp is now
`settings-developer` → `developer-playground` → `playground-select-level`; it
used to be `settings-developer` → `developer-select-level`. When a run fails at
the menus rather than in the game, read `content/mainmenu.yaml` first — the
button name is always `<screen-id>-<row-id>`.
