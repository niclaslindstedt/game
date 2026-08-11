---
title: A feature gated on a threshold needs its RATE measured on the rung people play, not proved once on the top one
date: 2026-08-10
scope: engine/game/drive/, pwa/src/game/drive-screen/
concepts: [drive, calibration, measurement, playtest, thresholds]
---

The drive's crash art shipped working and invisible. Every test was green, the
headless probe on JESUS showed 29 stove-in ends a leg, and the atlas, the wiring
and the draw path were all correct — but on MEDIUM, with the auto-driver, it was
FOUR cars in a leg out of 141, and in a 40-second workbench run it fired zero
times. "It works" and "you will see it" are different claims and only the second
one matters.

Two things to do instead of proving it once at the top of the ladder:

- **Measure the rate per rung**, and measure the DISTRIBUTION the threshold sits
  in rather than the threshold alone. Here the deepest fold a struck car reaches
  is bimodal — 3% of its cap at the lower quartile, 6% at the median, 47% at the
  upper — so every threshold between 0.08 and 0.45 selects the same set, and
  lowering it was NOT the lever it looked like. The real lever was a second rule
  (a write-off always folds an end) that had nothing to do with the number.
- **`?drive&bot=1` is a CAREFUL driver.** It steers around traffic, so it hits
  14 cars a leg on MEDIUM and is the wrong probe for anything about collisions.
  Drive `{ pedal: 1, wheel: 0 }` as well — a player who ploughs straight down a
  lane — and read both.

And when a picture is BAKED into art, make sure the renderer is not also
applying it: the traffic's crash grids already have the fold in them, and
`drawFolded` was squeezing that same end a second time on top, so the hardest
collisions drew a small car rather than a folded one.
