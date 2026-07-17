---
type: Changed
title: Native app updates through the store
---

The native app shell now disables the service worker and the "a new version is ready" update toast, so store builds update by installing a new version instead of reloading in place; the website and installed PWA keep the service worker and update prompt unchanged.
