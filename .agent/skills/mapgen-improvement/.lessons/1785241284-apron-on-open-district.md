---
title: An `apron` on an unwalled district paints pale squares all over its edges
date: 2026-07-28
---

`buildTiles` emits an entrance apron at the midpoint of every border whose
`link` is not `closed`. That is exactly right for a sealed district — the apron
is the hard standing just inside its doorways — and wrong the moment the area is
`enclosure: none`, because then EVERY border is open and every one of them gets
an apron. On generated boot_hill this came out as pale hardpan rectangles cut
into the town's plank street at regular intervals, which reads as a rendering
bug rather than as paving.

If you open a district up (`enclosure: none`), delete its `apron` in the same
edit. The schema will not catch it: an apron is legal on any area.
