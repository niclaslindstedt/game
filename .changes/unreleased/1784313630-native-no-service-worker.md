---
type: Changed
title: Native app bundles the game on-device
---

The native app now ships the whole game inside it and serves it from a local HTTP server, so it runs fully offline and self-contained; it disables the service worker and the in-app update toast and updates through the app store instead. The website and installed PWA are unchanged — they keep the service worker and update prompt.
