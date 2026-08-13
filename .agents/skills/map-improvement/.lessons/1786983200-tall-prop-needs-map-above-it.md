---
title: A tall billboard is eaten by the map's own edge dither — a prop needs `base.y · pitch` screen px of GROUND above it, or it is invisible
date: 2026-08-13
scope: content/maps/, pwa/src/game/render/
concepts: [billboards, map-edge, fog, props, scale, night]
---

Standing a 208 px rocket on the garage's lawn drew nothing but its landing
pads. Everything a billboard paints above world y = 0 is over the map's edge
band, which the fog pass dithers out to black — so the height a prop can
actually show is `base.y · DEFAULT_PITCH` screen px and not one more, whatever
the sprite is.

The lot's ship stood at y 92, which bought 69 px. The fix was the MAP, not the
sprite: 140 px of plain lawn appended as a new plan room with every other room
shifted down, `size.height` 280 → 420, which put the base at y 232 and 174 px
of grass above it. Appending the room rather than inserting it is what keeps
every earlier chamber id alone.

Two more that came with it. Absolute authored coordinates do NOT follow a plan
shift — `questGivers.<id>.at` is world px and silently ended up two districts
away; grep for every absolute coordinate naming the level before shifting a
plan. And the visible height is capped a second time by the CAMERA: it centres
on the hero, so about 100 screen px above him is all there is on a phone. A
prop taller than that is only ever seen in pieces, which is fine when that is
the joke and a waste of atlas when it is not.
