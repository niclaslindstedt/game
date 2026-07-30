---
title: Read `EnemyDef.locomotion` before you draw the lower body — and the `_1` frame
date: 2026-07-30
---

Every haunting on THE MOON is `locomotion: float`, which means the renderer
hovers it a few px up over a ground shadow and drifts it (`render/gait.ts`).
All of them were drawn with a scalloped hem or two stub feet, and their `_1`
frames differed from `_0` **only in the leg stride** — a walk cycle on eight
mobs that never walk. It reads as a token being dragged, and it is invisible
sprite-by-sprite because a hem looks like a hem until you know the mob hovers.

So the lower body is not a style choice, it is dictated:

- `float` — no legs, no feet. The body narrows below the waist into a drift.
  The `_1` frame is a DRIFT: the arms trail a row lower and the tail curls off
  true. Keep the head and the torso column identical between frames or the mob
  reads as pulsing rather than hovering.
- `legs` — the ordinary walk; `_1` is the stride.
- `wheels` — neither; do not rock it.

Check the def (`content/enemies/<biome>/<id>.yaml`) in Phase 4 step 1, alongside
the manuscript. It costs one grep and it changes the silhouette.
