---
title: "\"Can the player see it\" has TWO radii — a body ~112 px from a standing hero, a vehicle a whole screen"
date: 2026-08-12
concepts: [fog, visibility, screenshots, staging, rendering]
---

Judging whether a staged beat is actually WATCHABLE is not one question, and a
screenshot alone will not tell you which half failed.

- A **body** (any enemy, including neutrals) is culled by the renderer whenever
  it sits within `MAP.fogBand` (48) of the fog frontier — `render/enemies.ts`.
  A hero who has not moved has uncovered exactly `MAP.revealRadius` (160), so
  anything past **~112 px** of where he landed is drawn as fog, not as a person.
  The engine agrees: `clearOfFog` refuses the same band, so `visibleTo` says no.
  The fog grid answers per 32 px cell centre, so the last ~16 px of that are a
  coin flip — treat **96 px** as the honest figure for "he can see it standing
  still".
- A **vehicle** is not fog-culled at all (`render/vehicles.ts` only asks
  `inView`), so a car is drawn anywhere on screen — ~211 px across, ~130 down
  from the hero at the reference viewport.

Staging a beat on the screen's budget therefore delivers a car the player can
see and a person they cannot, which reads as a bug rather than as a beat. When
a change is meant to put something in front of the player, measure the fog and
the screen separately (`clearOfFog(state, pos)` in a headless probe is the
cheap half) instead of trusting one screenshot.
