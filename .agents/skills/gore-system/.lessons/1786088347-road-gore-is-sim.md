---
title: A CAR is not a blow — road gore is SIM, and its density has to be measured at the worst case
date: 2026-08-07
scope: engine/game/drive/
concepts: [drive, gore-density, measurement, remains]
---

The run's gore is built on a blow: one instant, pieces in the air, everything
down again inside `GORE_BURST_MS`, and the whole event ownable by the renderer
because nothing outlives it. **A vehicle breaks every one of those assumptions.**
What a car actually does is a SEQUENCE — it goes through a body, carries what it
caught, lays it down somewhere else, then drives over what it laid down — and
each of those is a fact about WHERE A THING IS. So the pieces belong in the sim
(`engine/game/drive/remains.ts`) and only their MATERIAL belongs to the app,
which is the same fence `DriveStrike` already draws. Modelling a car collision
as a bigger burst gives a picture with no afterwards.

**Measure blood density on the WORST case, never on one body.** A single hit
tuned to look right left the twenty-body blockade as one flat red slab with no
marks in it — a colour rather than a mess. The density has to come from marks
OVERLAPPING at low alpha under a per-cell cap (the bootprint rule), or the worst
case paints over the best one.

And the reuse that carried the whole feature: `render/sprite-split.ts` is
weapon-agnostic. `slicedPiece(body, name, wet, 0, cutPx ± band, cutPx, side)`
gives each half its own art out to the tear and the family's viscera beyond it,
so a bumper cuts a body exactly as a blade does, for every crowd sprite and every
mod's, with nothing authored per person.
