---
title: A vehicle's DRAWN size comes from the sim's own extent, not from the canvas it is authored on
date: 2026-08-09
scope: content/sprites/earth/
concepts: [scale, proportion, vehicles, riders, canvas]
---

Every two-wheeler on the drive shared one 48×26 canvas with the cars, and every
one of them was drawn to FILL it. The simulation disagreed by a factor of two:
`engine/game/drive/fleet.ts` gives a sedan `halfLengthPx: 20` and a motorcycle
`halfLengthPx: 11`, so a motorcycle is twenty-two px long on a road where a
sedan is forty — and the art was drawing it at forty.

Nothing failed. The atlas built, the lint passed, the collisions used the sim's
number and looked fine on their own. What it produced was one symptom nobody
could name from the art alone: the 15-px `rider_*` seated on top looked like a
child on an adult's bike, which is exactly what it was. Three rounds went into
"improving the bikes" before the number was checked, and every one of them was
detailing a machine that was twice the size it should be.

- **A shared canvas is a MAXIMUM, not a size.** Sprites that sit in the same
  atlas cell size are not the same size as each other; the size is whatever the
  simulation says the thing's extent is, centred in the cell.
- **Derive the scale once, then measure everything against it.** One sedan at
  40 px for 4.5 m gives ~9 px to the metre, and from there a person is 15 px, a
  wheel is 6, and a saddle is 7 px off the ground — which is why every seated
  machine's `RIDER_SEATS` entry is `dy: 7`. A machine that needs its own number
  is a machine drawn at its own scale.
- **When the rider looks wrong, suspect the machine.** A body's art was correct
  the whole time; it was the only thing in the frame drawn to a real scale.

Two mechanical traps found on the way down:

- **Do not ink around a tyre.** The exterior-outline pass added a px of ink
  ring around each 6-px near-black wheel, turning it into a black SQUARE with a
  grey pip in it. `k` is already darker than the outline colour — art that is
  darker than the ink needs no ink.
- **At this size a thing is joined or it is a comfortable distance away.** A
  handlebar, a headstock and a headlamp placed two px apart came out as a solid
  black rectangle with a "T" in it, because every gap that small is filled by
  the outline pass. There is no room for "near" on a 20-px machine.
