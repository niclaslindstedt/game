---
type: Added
title: Bot fast-forward
---

DEVELOPER → BOT VIEW now has a GAME SPEED step (after picking difficulty and level) that fast-forwards the autopilot run up to 8× — it runs more game-loop steps per frame, so it blitzes a level deterministically for a quick read (also driveable headlessly via `?speed=` / `playtest.mjs --speed`).
