---
type: Fixed
title: iOS PWA audio recovery
---

Sound no longer stays dead after switching away from the app on iOS. An
AudioContext interrupted by an app switch, incoming call, or screen lock now
re-resumes on the player's next touch anywhere — previously it only recovered
via the pause menu, and stayed silent when the interruption happened during a
cutscene, level-up, merchant, or the title screen.
