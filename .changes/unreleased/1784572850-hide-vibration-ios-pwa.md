---
type: Changed
title: Hide VIBRATION on installed iOS PWAs
---

The SETTINGS → CONTROLS → VIBRATION toggle is now hidden when the game runs as an installed iOS home-screen PWA — the one context that can never buzz (no web Vibration API, and no native Taptic bridge to forward to) — so it no longer appears as a dead switch. It still shows everywhere it can matter: iOS Safari, the native app, Android, and desktop.
