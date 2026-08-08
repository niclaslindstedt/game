---
title: Judge DERIVED art by diffing it against the shipped grid cell by cell — the eye misses one-pixel gauge errors
date: 2026-08-08
scope: scripts/asset-tools/, content/sprites/
concepts: [generated-art, person-generator, review, measurement, silhouette]
---

When art is RULED rather than drawn (`person.mjs`, `facade.mjs`, `wreck.mjs`),
the previews tell you it looks roughly right and hide everything that is
actually wrong. Three defects in a generated 16-px body were invisible at 8×
and instant in a text diff against the shipped grid:

- **The arms sat level with the shoulder line** instead of one row below it.
  One pixel. With no shoulder above them the eye stops reading "arm" and starts
  reading "slab bolted to a torso" — which is what a human reviewer reports, in
  those words, without being able to say why.
- **Both hands swung.** The shipped crowd swings only the NEAR one; the far
  hand never moves, which is precisely why it is the hand that holds things.
- **What it held hopped between frames**, because it was anchored to a hand
  whose row changed — a man juggling his own briefcase — and it drew with no
  outline on three sides, because parts only inked upward.

So: print the generated grid beside the authored one with a column ruler and a
`^` diff row, and read the differences. Every one that is not deliberate is a
bug. The remaining diffs are then a short, defensible list ("slimmer placket,
man-shaped hip") rather than a vague feeling.

The corollary for the generator itself: **derive part outlines** (ink any empty
cell orthogonally touching a painted one) rather than asking each part to draw
its own rim. A part author cannot know whether a bag's left edge is the body's
outline or its own.
