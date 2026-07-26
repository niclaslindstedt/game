---
title: Judge an effect at 1/4 speed on a filmstrip sheet, not at full speed on two frames
date: 2026-07-26
---

The gallery's SPEED chip (`S`, or `?effects=<id>&speed=0.25`) scales SIM time,
so an effect, its timeline, and the loop's replay rhythm stretch together.
Shoot it with `node scripts/effects-gallery.mjs --only <id> --strip 6 --speed
0.25`: `--strip` spreads its frames across the exhibit's own `showMs` (scaled
by the speed), and the run writes a composited `sheet.png` — one row per
exhibit, frames left to right — which is the thing to actually READ.

At full speed with the default two offsets, a 300 ms burst gives you two
near-identical smears and you end up tuning colours blind. At a quarter speed
across six frames you can see which BEAT is wrong (the flash outlasting the
ring, the dark layer landing during the bright peak, a ring that never reaches
its radius). Keep a batch to ~6 exhibits and use `--out` per batch: a taller
sheet gets downscaled into mush, and successive runs clobber each other's
frames otherwise.
