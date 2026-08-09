---
title: A world sprite adapted from a CUTSCENE sprite is a scale-up of that art, not a fresh design — and the roughly-2x factor is a real number you can derive
date: 2026-08-09
scope: scripts/asset-tools/, content/sprites/scenes/
concepts: [generated-art, scale, cutscenes, backdrops, review]
---

When the same PLACE appears in a cutscene and in the world (the hero's house is
`garage_house` in `content/cutscenes/launch.yaml` and `home_house` on the drive's
road), the world version must be the cutscene's art scaled up — same silhouette,
same materials, same accent — not an independent design of the same subject. A
player who has watched the scene reads the arrival as recognition, and a
different-looking building reads as a bug.

The factor is derivable rather than guessed: a cutscene stage is 224 world px
wide and the drive's road is ~422, so a cutscene sprite is about 2x on the road
for the same apparent size (48x19 → 96x40). Do the arithmetic before drawing.

Two hours went into a from-scratch brick-and-slate house that was rejected on
sight for not matching; the rebuild against the cutscene's grey siding, brown
peaked roof and single amber window landed in one pass. READ THE CUTSCENE'S YAML
GRID FIRST — its `palette` comments name every colour, which is the whole spec.

Two shape traps found the same way: a flat-topped roof run to row 0 of its own
box reads as CROPPED (leave two blank rows above the ridge, as the cutscene
does), and a canopy whose trunk starts below it reads as two objects (draw the
trunk first, running up INTO the crown).
