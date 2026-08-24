---
title: A black canvas under the rocket's intro cards is the card's own opaque backdrop, not missing sprites
date: 2026-08-24
scope: pwa/src/game/rocket-screen/
concepts: [minigame, overlays, rendering, debugging, screenshots]
---

`.drive-intro` (which `RocketIntro` wears) is deliberately opaque black, so a
screenshot taken while FLIGHT TO / PRE-FLIGHT is up shows nothing of the sky —
do not diagnose "sprites broken" from it. To LOOK at the flight, drive the
`?rocket` workbench with Playwright (`executablePath: /opt/pw-browsers/chromium`),
wait for `window.__flight` (`?debug`), get past the LAUNCH CUTSCENE the first
lap opens on (`&launch=0` skips it, which is what a harness wants — a held
caption is a `window.__flight` that exists but never moves), tap through BOTH
cards, and steer by dispatching `KeyboardEvent`s on `window`. Side-on scene art for sky backdrops
lives ready-made: `garage_house_burnt*`, `garage_tree_*`, `night_cloud_*`,
`grass_*` — but `lawn_tree_*` is `plane: floor` (top-down) and only passes as a
round crown at a glance.
