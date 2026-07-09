---
type: Changed
title: Smoother gameplay at horde scale
---

Large hordes, loot-covered floors, and obstacle-dense levels no longer drop the frame rate: the simulation now uses spatial indexes for projectile hits and obstacle collision, and the renderer pre-bakes the ground layer and item glows instead of recomposing them every frame.
