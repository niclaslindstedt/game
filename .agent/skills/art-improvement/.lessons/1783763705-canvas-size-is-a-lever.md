---
title: A redraw can change the canvas size, not just the pixels
date: 2026-07-11
---

Mobs are NOT locked to one size — `render.ts` draws each at its native grid
dimensions, the atlas packs whatever you give it, and `woundedFrames`/the
audit sheets follow. When a mob's problem is "reads too small/big for its
threat", the fix is often a bigger/smaller grid, not more internal detail.
Update the sprite-data comment when you change a size, and remember both
`_0`/`_1` frames must share the new dimensions.
