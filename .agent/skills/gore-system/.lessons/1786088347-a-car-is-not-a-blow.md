---
title: A CAR is not a blow — road gore is SIM, and its density has to be measured at the worst case
date: 2026-08-07
---

The run's gore is built on a blow: one instant, pieces in the air, everything
down again inside `GORE_BURST_MS`, and the whole event ownable by the renderer
because nothing outlives it. **A vehicle breaks every one of those assumptions**,
and trying to model a car collision as a bigger burst produces a picture with no
afterwards. What a car actually does is a SEQUENCE — it goes through a body,
carries what it caught, lays it down somewhere else, and then drives over what it
laid down — and each of those is a fact about WHERE A THING IS. So the pieces
belong in the sim (`src/game/drive/remains.ts`) and only their MATERIAL belongs
to the app, which is the same fence `DriveStrike` already drew.

Three things that were wrong first and are worth not repeating:

- **The "over the roof" read is a carry fraction below 1, not an animation.**
  Launch the upper half SLOWER along the road than the car and the wagon
  overtakes it while it is airborne; the eye supplies the rest. Nudge that
  fraction over 1 and the half lands in front of the car and is run over again —
  a fine picture and the wrong one, with no test failing.
- **Anything caught under the car has to ride PAST the rear bumper to exist.**
  The body is 48 px, so a drag point anywhere inside ±24 is drawn underneath the
  wagon: the feature was a sound and a trail with no visible cause until the
  attach point moved out to −26.
- **Measure blood density on the WORST case, never on one body.** A single hit
  tuned to look right left the twenty-body blockade as one flat red slab with no
  marks in it — a colour rather than a mess. The density has to come from marks
  OVERLAPPING at low alpha under a per-cell cap (the bootprint rule), or the
  worst case paints over the best one.

And the reuse that carried the whole feature: `render/sprite-split.ts` is
weapon-agnostic. `slicedPiece(body, name, wet, 0, cutPx ± band, cutPx, side)`
gives each half its own art out to the tear and the family's viscera beyond it,
so a bumper cuts a body exactly as a blade does, for every crowd sprite and
every mod's, with nothing authored per person.
