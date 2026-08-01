---
title: A PILE of small things reads as a blob until you draw the seams between them
date: 2026-08-01
---

Drawing a heap made of many identical small objects — coins, skulls, crates,
brass, bones — the instinct is a smooth dome filled with a light-to-dark ramp.
It comes out as a lump of butter. The first pass at the gold pile ladder was
fourteen sprites of exactly this, and at 6× they read as yellow rocks.

Two edits fixed all fourteen, and neither is shading:

- **Scallop the SILHOUETTE.** A mound of discrete things has a bumpy outline —
  individual objects breaking the contour at the crown and shoulders. Draw the
  top edge as `..OO..OO..` rather than as a smooth arc. The outline is doing
  most of the work; you can read "coins" from the silhouette alone.
- **Put SEAMS inside, in a mid-dark char, not the outline char.** Short runs of
  the shadow colour (`q` here) scattered across the interior read as the gaps
  between objects. Using the near-black outline char for them instead punches
  holes that read as damage.

The corollary is the scale rule: below about 12 px across you cannot draw the
objects individually at all (5×4 is the smallest disc with a rim that still has
gold left in the middle), so the SMALL rungs of a size ladder are a literal
count of separate objects and the BIG rungs are a mass with seams. Two different
drawings, one ladder — do not try to make one approach cover both.

And when a heap needs a landmark on its crown to say "this one is the big one",
pick a shape that survives a 6 px footprint. A goblet became a mushroom and then
an hourglass over two passes; three short towers of stacked coins read
instantly, because they are made of the same thing the pile is.
