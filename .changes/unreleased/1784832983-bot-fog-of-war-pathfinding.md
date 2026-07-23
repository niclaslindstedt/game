---
type: Fixed
title: Autopilot reads the minimap
---

The autopilot no longer gets lost at a long wall whose end is off-screen: its wall-end sense now sees everything already uncovered from the fog of war (the minimap's memory), and when no end is known anywhere it traces the wall toward the nearest fog to go find it instead of standing still or circling.
