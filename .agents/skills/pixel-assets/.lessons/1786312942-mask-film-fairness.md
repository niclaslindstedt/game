---
title: Art that is MASKED to small windows must be fair in every window, not just overall
date: 2026-08-09
scope: content/sprites/
concepts: [overlays, blending, coverage, masking, noise]
---

`car_gore_0..2` are one 48x26 film masked to whichever car panel is being drawn,
and a panel is a tiny window onto it: the bumper is 5 columns by 10 rows, the
roof is 2 rows by 26. So the figure that matters is not the sheet's coverage but
**the coverage inside every window the mask can cut**, and three separate ways
of getting that wrong all shipped:

- A density GRADED down the rows ("wettest at the top") is not "wettest at the
  top of the car" — the panels are stacked up the shell, so it is the low panels
  being drier than the high ones at every rung, for ever. Grade the COLOUR
  instead and keep the density even.
- White noise cut at a depth is DITHER (independent single pixels); two octaves
  of interpolated VALUE noise come apart into blobs at every depth, which is
  what spatter looks like. But blobby noise has low-frequency drift, and a panel
  landing in a thin patch is permanently cleaner than its neighbours.
- The fix is a local-RANK pass (a cell's key becomes its percentile inside its
  own window) plus alternating row/column re-ranks. The window must be shaped
  like the panels — WIDE AND SHALLOW (9x3), not square, or a two-row panel comes
  out half again as dense as the sheet — and it must be computed over the rows
  any part actually paints (here 0..21), because wrapping or clamping into dead
  rows lets the live ones borrow their fairness from pixels nothing will mask.

Also worth copying from the wound generator: author the rungs as **one plan cut
at three depths**, so a rung only ever ADDS marks. A ladder whose rungs are
independent noise fields makes the mess visibly slide around as a panel climbs.
