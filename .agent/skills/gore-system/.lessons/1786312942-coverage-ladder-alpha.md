---
title: A soak ladder that resets the alpha per rung only works if the ART roughly triples in coverage
date: 2026-08-09
scope: pwa/src/game/render/soak-ladder.ts, pwa/src/game/drive-screen/car-soak.ts, content/sprites/
concepts: [soak, ladder, overlays, blending, spatter]
---

`coatLayer` ramps the alpha inside a rung and RESETS it at the top of one
(0.4 → 0.94, back to 0.4), which is only monotone because the hero's coat art
triples per rung (head: 5% → 14% → 23% coverage) and the art more than pays the
reset back. The car's film was copied from it and could not: its top rung is
required to cover the canvas WHOLE, so the rungs measured 49% → 96% → 100% and
crossing a threshold took a panel from an effective 0.86 to 0.35 — a panel got
LIGHTER as it got bloodier, and two neighbours either side of one read inverted.
No amount of spreading fixes that, because it is not in the soak at all.

**Measure the coverage of every rung of any overlay ladder before trusting the
alpha ramp** (`grid.split("").filter(c => c !== ".")` over the YAML is ten
lines). If the rungs do not step up sharply, invert the solve instead: state the
WETNESS the ladder wants as one continuous ramp, pick the sparsest rung that can
draw it, and set alpha = wetness / that rung's coverage. The rung thresholds
then fall out of the art rather than being a second set of numbers to keep in
step — re-draw the film denser and they move on their own.

And a sparse film needs a **second layer under it**: a hole in 20%-coverage
spatter sitting over the flank's own white highlight is the brightest thing on
the wagon. A faint all-over wash (the top rung at ~0.3 of the wetness) under the
marks means nothing is ever untouched while the marks still read as marks.
