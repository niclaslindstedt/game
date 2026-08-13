---
title: A presentation ramp applies per MARK, not per surface — a tread print re-hued to pastel reads as a decal
date: 2026-08-13
scope: pwa/src/game/drive-screen/
concepts: [sfw, recolor, road-marks, drive, tuning]
---

`drawRoadMarks` takes one ramp and was handing it to every mark on the road.
That is right for a splat, a smear and a paste — all three are places a BODY
came apart, and SFW's whole claim is that a body comes apart into glitter — and
wrong for the tread prints mixed in among them, which are the shape of a TYRE.
A pastel picture of a tyre reads as a decal somebody stuck on the tarmac; the
same print in dark rubber reads as the thing the player just did with the car.

The rule generalises past this file: when a mode re-hues a whole record, sort
the record by WHAT MADE THE MARK before picking the palette, not by which pass
draws it. Marks left by the SUBJECT of the mode take the mode's palette; marks
left by the machinery around it keep their own material.

Two mechanics worth knowing before doing it. `recolorSprite` keys its cache on
`name + ramp`, so a second ramp on the same sprite costs one more bake and can
never be handed the wrong one — unlike `slicedPiece`, which keys on the name
alone and needs a synthetic name per fill. And the second ramp belongs in the
module that already owns that material (`RUBBER_RAMP` beside `SKID_INK` in
`skid.ts`), or two files end up holding their own idea of black and drift.

To LOOK at a mark trail that only appears in a mode, temporarily add `sfw: true`
to the exhibit that stages it — `drive-drag` is the one that paints a screen and
a half of tarmac — capture, then revert. Sample around 1.4 s: the exhibit holds
its camera at the collision and the trail has unrolled away from it by then but
is not yet off the left edge.
