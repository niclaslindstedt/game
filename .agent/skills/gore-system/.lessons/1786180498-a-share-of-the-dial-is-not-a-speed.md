---
title: A share of the dial is not a speed — road gore thresholds are in JOULES
date: 2026-08-08
scope: src/game/drive/, pwa/src/game/drive-screen/, pwa/src/game/effects-gallery/
concepts: [drive, gore-density, thresholds, top-speed, staging]
---

Every gore threshold on the DRIVE is priced in absorbed energy as a fraction of
`DRIVE.impact.wearJoules` — the split, the gib line, the sound shelves, the
frame shake. None of them moves when `DRIVE.topSpeedPx` moves. **Everything that
STAGES one is written as a share of the top speed**, and all of it silently
re-pitches:

- the fleet suite's `plant(state, variant, 0.95)` ladder tests,
- the sound-bank samples (`bodyAt(0.4)` = "a careful driver"),
- every effects-gallery DRIVE exhibit (`openAt(drive)` = flat out),
- `BODY_FULL_SHARE` in `drive-screen/drive-fx.ts`, which IS "the share of the
  car a person met dead square at the top of the dial costs".

Raising the top speed 45% made energy 2.1× at the top, and the symptom is
always the same shape: **a stage that used to sit on rung N now sits on rung
N+1**, so the exhibit labelled TRADING PAINT demonstrates the crunch, the one
labelled CLIPPED ON THE WING demonstrates the wet tear, and the ladder test
that wanted four blows gets a write-off in one. Nothing is broken; every stage
is just standing somewhere else on the same ladder. When the dial changes,
grep for `topSpeedPx *` and re-pitch each site against the SPEED its comment
names, not the fraction.

`BODY_FULL_SHARE` is the one that fails silently rather than loudly: it is a
saturating scale, so an out-of-date figure does not throw — the whole top half
of the speedometer simply shakes the frame by exactly as much as the middle of
it.

Two more things this pass turned up, both worth keeping:

- **`remainForce` needed the clamp `wreckForce` already had.** It prices a
  collision in a BODY's currency, and a CAR collision priced in one comes out at
  ten to fifty rather than one to six — so an ejected occupant left a windscreen
  at 9,000 px/s and was still climbing when the road forgot him. A lift CEILING
  is a separate fix from a force ceiling: every burst is over quickly or it is
  not a burst.
- **A guaranteed picture beats a ladder for the thing the player AIMS at.** The
  head-on is the road's one deliberate act, and a force ladder made it come out
  differently every time somebody committed to it. Two facts (square + closing)
  and a fixed outcome is what makes it something a player can decide to do.
