---
title: A share of the dial is not a speed — road gore thresholds are in JOULES, but everything that STAGES one is written as a share of the top speed
date: 2026-08-08
scope: engine/game/drive/, pwa/src/game/drive-screen/, pwa/src/game/effects-gallery/
concepts: [drive, gore-density, thresholds, top-speed, staging]
---

Every gore threshold on the DRIVE is priced in absorbed energy as a fraction of
`DRIVE.impact.wearJoules` — the split, the gib line, the sound shelves, the frame
shake. None of them moves when `DRIVE.topSpeedPx` moves. **Everything that STAGES
one is written as a share of the top speed**, and all of it silently re-pitches:

- the fleet suite's `plant(state, variant, 0.95)` ladder tests,
- the sound-bank samples (`bodyAt(0.4)` = "a careful driver"),
- every effects-gallery DRIVE exhibit (`openAt(drive)` = flat out),
- `BODY_FULL_SHARE` in `drive-screen/drive-fx.ts`, which IS "the share of the car
  a person met dead square at the top of the dial costs".

Raising the top speed 45% made energy 2.1× at the top, and the symptom is always
the same shape: **a stage that used to sit on rung N now sits on rung N+1**. The
exhibit labelled TRADING PAINT demonstrates the crunch, the one labelled CLIPPED
ON THE WING demonstrates the wet tear, and the ladder test that wanted four blows
gets a write-off in one. Nothing is broken; every stage is just standing
somewhere else on the same ladder.

When the dial changes, grep for `topSpeedPx *` and re-pitch each site against the
SPEED its comment names, not the fraction. `BODY_FULL_SHARE` is the one that
fails silently rather than loudly: it is a saturating scale, so an out-of-date
figure does not throw — the whole top half of the speedometer simply shakes the
frame by exactly as much as the middle of it.
