---
type: Fixed
title: iOS PWA zombie audio context
---

Sound now recovers even when iOS hands back an AudioContext that claims to be
running while its clock and output are dead after an app switch — the game
detects the frozen clock, forces the audio session to re-activate, and as a
last resort rebuilds the audio engine on the next touch, so it no longer takes
a lucky second app-switch to get the sound back.
