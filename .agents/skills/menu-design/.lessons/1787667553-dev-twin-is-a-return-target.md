---
title: A screen with a developer twin is a RETURN target — a "come back here" flag naming only the player's twin strands the trip on a page it cannot pass the gates of
date: 2026-08-25
scope: pwa/src/game/title-screen/, pwa/src/App.tsx, pwa/src/game/TitleScreen.tsx
concepts: [screens, dev-twin, navigation, gating, heading, debugging]
---

`minigame`/`devminigame` (and any future `x`/`devx`) are authored twice because
a `dev: true` screen may not parent a plain one — and the twins are NOT
interchangeable at runtime. The player's gates on earned state; the developer's
does not. So anything that LEAVES the menu and comes back (a minigame lap, a
gallery, a workbench) must carry WHICH twin it left, as data rather than as a
hardcoded screen id.

The failure is silent and looks like a broken menu, not a wrong screen: App
kept a boolean `startOnMinigames` and always remounted on the PLAYER's shelf, so
a lap launched from DEVELOPER → PLAYGROUND → MINIGAMES came back to a cabinet
whose rungs are `arcadeRungs(roster)` — empty for a roster that has beaten no
campaign. DIFFICULTY rendered `-`, PLAY only buzzed, and nothing logged. Carry
`{ screen, cabinet }` instead, and let the builder hand its own `screen` up with
the press (`ctx.onMinigame(..., screen)`) — the far side cannot infer it.

**Reading a bug report's screenshot: the heading TONE says which twin it is.**
`TONES` in `MenuHeading.tsx` — player is an amber trail (`#b08b3f`) over a gold
rule, dev is teal (`#4f9b85`/`#7ef0c8`) — and the dev twin also wears its FULL
breadcrumb (`SETTINGS » DEVELOPER » PLAYGROUND » MINIGAMES`) where the player's
shows one crumb. That pair settles "which screen am I actually looking at?"
before any code is read.

Note that `__DEV_TOOLS__` is ON for the web, PWA and preview builds — only
`VITE_DEV_TOOLS=off` (the production store profile) folds it away — so a
developer-tree bug is reachable by a real player on the deployed site.
