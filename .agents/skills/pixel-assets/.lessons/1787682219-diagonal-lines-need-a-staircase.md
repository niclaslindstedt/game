---
title: A 1-px diagonal line trips the orphan-pixel lint on every pixel of it — draw it as a staircase
date: 2026-08-25
scope: content/sprites/
concepts: [lint, orphan-pixels, readability]
---

`gridStats` tests 4-NEIGHBOURS only, so a chain of single pixels stepping
diagonally (parachute risers, rigging, a thin antenna) has no lit neighbour
above, below, left or right and every pixel of it is reported as an orphan.
Four shipped sprites carried that warning permanently — `sky_diver_0/1` and
`sky_glider_0/1` — and it was noise on every `make assets` run.

The fix is not to exempt it: draw the diagonal as a STAIRCASE, two pixels per
row stepping one column at a time, so consecutive rows share a column and the
chain is 4-connected end to end. That is also the better pixel art — a bare
1-px diagonal reads as dither at 1x, and the staircase reads as a line.

Worth knowing before you draw anything hanging on cords or wires, because the
warning arrives two minutes later at the end of a full `make assets` and looks
like it belongs to whatever you were actually working on.
