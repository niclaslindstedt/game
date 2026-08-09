---
title: Blood placed by EVENTS alone draws a mask, not a mess — something has to SPREAD it
date: 2026-08-09
scope: pwa/src/game/drive-screen/car-soak.ts, pwa/src/game/game-screen/hero-soak.ts
concepts: [drive, soak, gradient, measurement, spatter]
---

The car's soak book placed blood off `DriveStrike.panel` and nothing else, which
is exactly right and produced a car nobody believed: 533 of 643 contacts over
eight legs land on the BUMPER, so one panel saturated inside half a dozen bodies
while the doors and the tail sat at zero for the whole leg. What the player saw
was a drenched nose bolted to a showroom-fresh body with a hard seam down the
middle — and the seam is the only part anybody looks at.

**An event-placed soak needs a second, CONTINUOUS mechanism that moves it**, or
the picture is a map of where the events were rather than a mess. On the road it
is the airstream (`smearCarSoak`, on the fixed step beside the drag and the
treads): every panel is pulled toward a fraction of the one UPWIND of it, at a
rate scaled by road speed, only ever raising. That makes the gradient structural
— a panel can never be conspicuously cleaner than the one ahead of it, whatever
the strikes did — and it costs one table of who is downwind of whom.

Two things that fell out of it:

- **The contact panel's per-body figure is what decides whether a gradient can
  exist at all.** At the old 0.1/body the nose was at its ceiling twenty seconds
  in, which pins the top of the gradient flat for the rest of the trip and
  leaves the spread nothing to work with. Halving it (so the nose climbs over
  ~15 bodies) mattered as much as adding the spread.
- **The direct-spray table should NOT be widened to cover the gap.** Spray does
  not fly backwards off a nose; a made-up rear share wets the tail of a car that
  has been idling. Keep the two mechanisms separate and each stays legible.
