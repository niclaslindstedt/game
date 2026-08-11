---
title: A top-down CANOPY is shaded as a sphere, not as a diagonal ramp — and its rim must stay a circle
date: 2026-08-09
scope: content/sprites/
concepts: [floor-plane, shading, silhouette, trees, readability]
---

Two false starts drawing `lawn_tree` (26×28, `plane: floor`), both of which look
right in the grid and wrong at 8x.

FIRST, the lighting. A tone picked from `(-dx - dy)` — "how far up and left is
this pixel" — paints straight diagonal bands across the crown, and the sprite
reads as a lozenge with ribbons on it. What reads as a dome is a RADIAL falloff:
put a highlight point up and left of centre (`cx - 4.6, cy - 4.6`) and pick the
tone from the distance to THAT. Same four colours, and it is suddenly a ball with
leaves on it.

SECOND, the rim. Deep scallops (a lobe radius wobbling 9.4…12.4 on an 11.5 disc)
do not read as foliage at this size — they read as "not a circle", and the eye
stops calling it a tree. Keep the wobble to about ±0.6 and break the smoothness
with a DAPPLE instead: step ~6% of the interior pixels one tone lighter, in
horizontal PAIRS (a lone off-tone pixel in a leaf field is the orphan the
generator warns about).

`scripts/sprite-author.mjs pose <name>` over the family ground is the check —
the shipped `colony_tree` (`content/sprites/mars/`) is the reference for how
much structure a tree of this size actually needs, which is less than you think.
