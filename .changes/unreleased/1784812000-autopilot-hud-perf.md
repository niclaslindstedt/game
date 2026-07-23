---
type: Fixed
title: Autopilot and combat-HUD performance
---

Big fights run roughly twice as fast with the AUTO PILOT driving: the bot now scans the horde once per tick instead of re-sorting it for every decision, the HUD stops re-rendering on every regen tick, hit resolution no longer allocates per blow, and off-screen effects skip their draw calls.
