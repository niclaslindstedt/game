---
type: Fixed
title: Autopilot fast-forward no longer stalls to 1 FPS
---

At high fast-forward speeds (the 16x AUTO PILOT rung and BOT VIEW), the frame rate could collapse to ~1 FPS once the autopilot started sizing up objectives sealed behind a gate or wall: each unreachable pathfinding query flooded the entire nav grid before giving up, many times per frame. The pathfinder now rejects an unreachable goal in constant time via precomputed nav-grid connectivity, so the run stays smooth at any speed.
