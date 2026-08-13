---
title: A safe mode RE-DRESSES a presentation, it never withholds one — and a re-hue ramp for marks on dark ground needs all three stops light
date: 2026-08-13
scope: pwa/src/game/drive-screen/, pwa/src/game/render/recolor.ts, pwa/src/game/render/stardust.ts
concepts: [sfw, drive, recolor, gore-families, soak, feedback]
---

SFW mode on the DRIVE used to withhold every sprite a collision made — the dent
rungs, the folds, the felled posts, the thrown wheels, the shake, and the hero's
own bent wagon — and replace the lot with a puff of dust. That does not make the
road gentler, it makes it unreadable: the player drove into a car at seventy and
the car stayed showroom-fresh, so the one thing the minigame is about had no
picture. **What is graphic about a collision is what it is MADE of, never that it
happened.** Withhold the blood; keep the damage.

The mechanism is already in the tree and is the one to reach for:
`recolorSprite` (`render/recolor.ts`) puts authored red art through a
three-stop luminance ramp, which is how the four gore families share one spray.
`FAIRY_RAMP` (`render/stardust.ts`) is the SFW ramp, handed to `carCoat` /
`wheelCoat` (via the optional `CoatLayer.ramp`), `drawRoadMarks`, `drawRemain`
and `drawTrafficBody`. It must never reach a body's OWN sprite — a re-hued crowd
is a different crowd.

Two traps, both paid for once:

- **All three of that ramp's stops have to be LIGHT.** A gore family's shadow
  stop is dark because it re-hues a body standing against something; these marks
  go down at ~0.3 alpha on night tarmac, and a dark stop turned the road's whole
  record into a scatter of holes. Dust catches light; it has no dark parts.
- **`slicedPiece` and `recolorSprite` key their bakes on the sprite NAME.** A
  second dressing of the same art must ask under a name of its own
  (`` `${name}/fairy` ``) or it is handed the red bake from the last leg.
