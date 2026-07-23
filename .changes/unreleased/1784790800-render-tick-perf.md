---
type: Fixed
title: Horde-scale performance
---

Heavy scenes no longer tank the framerate: the fog of war and minimap now repaint only what changed instead of every pixel every frame, and the horde tick skips the sight checks and catalog lookups the dormant crowd never needed.
