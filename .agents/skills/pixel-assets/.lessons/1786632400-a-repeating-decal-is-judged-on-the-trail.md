---
title: A repeating decal is judged on the TRAIL it forms and against the BODY that laid it — never on its own tile
date: 2026-08-13
scope: content/sprites/effects/, pwa/src/game/drive-screen/
concepts: [decal, floor, tiling, review-loop, drive, anchors]
---

`gib_tyre_print` passed every per-tile check and was wrong three separate ways
in the game, none of them visible on `<name>@8x.png`.

**Its size was read against nothing.** It was 8 px across while the code laid
the two tracks 4 px either side of the car's line, so the pair met in the middle
and went down as one 16-px band. A decal stamped in PAIRS or ROWS must be sized
against the spacing constant that lays it, in comments that name each other. One
standing for ground COVERED also wants to be far longer than it is wide, with
the laying step under its length so prints overlap into a ribbon.

**Its pattern read as masonry.** At these sizes a repeated block pattern falls
into one of three wrong pictures purely by where the gaps sit: aligned in every
row → a waffle grid; staggered row to row → brickwork; aligned across a
full-width groove → bars straight through the shape, a ladder. What worked was
aligning them WITHIN each rib, offsetting them BETWEEN ribs, and keeping one
continuous unbroken row per rib.

**It was centred on the wrong line.** The drive's wagon is a SIDE ELEVATION on a
raked road, so only the near wheels are visible and a pair of tracks straddling
`car.pos.y` put neither under a wheel — one floated clear of the tyres and the
other ran up the face of the wheel. The near track belongs ON the contact patch
the art shows (`wheelSeat` sits a wheel two SCREEN px below the seat, and the
ground plane squashes world y by the 0.75 pitch, so that is three WORLD px), and
the far one a full gauge further in, where the bodywork hides it.

Judge all three from a capture of the trail beside the body that laid it — for
the road, `drive-drag` around 0.7–1.6 s.
