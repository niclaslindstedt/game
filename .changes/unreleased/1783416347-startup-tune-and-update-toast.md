---
type: Fixed
title: Reliable intro tune and update prompt at startup
---

The title theme now starts reliably at app launch — the audio context is created only from a real user gesture instead of being pre-created when the menu reads the audio clock, which some browsers refuse to resume. The "a new version is ready" prompt now also appears when an updated service worker was already waiting when the page loaded, not only when one becomes ready while the tab is open.
