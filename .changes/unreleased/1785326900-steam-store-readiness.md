---
type: Added
title: Steam screenshots and a store preflight that covers both storefronts
---

`make store-preflight` now checks the Steam store page too — the app and depot
ids (including Valve's shared test app), the achievement manifest, the capsule
art at Valve's exact dimensions, and the five required screenshots — and the
screenshot harness gained a real 1920×1080 Steam raster, so the desktop set is
generated rather than hand-grabbed. The library's pages can now link a published
Steam page alongside the App Store listing (`steamUrl` in `game.config.json`).
