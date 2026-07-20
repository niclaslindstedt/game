---
type: Changed
title: Show VIBRATION only where it can buzz
---

The SETTINGS → CONTROLS → VIBRATION toggle now appears only on devices that can actually produce a buzz — a touch phone or tablet whose browser has the Web Vibration API (Android in a browser or an installed PWA), or the native app's Taptic bridge. It's hidden on desktop (the API exists but there's no motor) and on all of iOS (no Vibration API at all), where it was a dead switch.
