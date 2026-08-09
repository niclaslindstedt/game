---
title: A bough thinner than 3px comes out ALL OUTLINE, so a bare-branch sprite reads as black hair
date: 2026-08-09
scope: content/sprites/
concepts: [outlines, silhouette, trees, generated-art, readability]
---

Drawing the dead rungs of a tree ladder (`lawn_tree_ashen`,
`garage_tree_ashen`), the obvious move is many fine branches. It does not
survive the house outline convention: a 1px-wide limb has a non-solid neighbour
on every side, so the outline pass claims every pixel of it and the limb is a
black hair with no wood in it. A whole crown of those reads as a starfish or a
hand, never as a tree.

Author boughs at **3px minimum** (outline + one interior pixel) and taper to 3,
not to 1 — which means FEWER limbs, unequal in length, with two or three forks
off them rather than a radial spray. Five boughs at 3–5px read as a dead tree at
26px; twelve at 1–2px read as noise.

Loosening the outline rule instead (skip the outline where the mass is thin) was
tried and is worse: the result is a patchy mix of wood and rim with no silhouette
at all.
