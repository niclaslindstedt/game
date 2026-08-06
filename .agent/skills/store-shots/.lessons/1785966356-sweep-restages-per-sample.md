---
title: The sweep re-stages per sample — never "optimise" it back to one run
date: 2026-08-05
---

`store-shot-sweep.mjs` walks the menus and stages the recipe again for EVERY
sample, which looks like obvious waste and is not. It used to stage once and
take the whole schedule off that single live run; a full-raster screenshot
(2868x1320, composited, written) costs the better part of a second, so each
sample paid for the ones before it and the shutter drifted seconds past the
schedule — asked for 0/30/60/90..900 ms, it really fired at 0/2377/3218..8025 ms
and labelled those frames with the requested numbers. Every sub-second
`captureAtMs` in the set was therefore picked off a picture taken at a
completely different moment. If a sweep feels slow, sweep fewer samples; do not
put the samples back on one run.
