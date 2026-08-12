---
title: A deliberately EMPTY venue is refused twice by the map schema, and the way through is to make it an honest room
date: 2026-08-12
scope: content/maps/, scripts/asset-tools/map-schema.mjs
concepts: [blueprint, map-schema, enclosure, plan, display-case]
---

Authoring a stage with nothing on it (the effects gallery's DISPLAY CASE,
`content/maps/gallery.yaml`) runs into two refusals that read as arbitrary until
you see what they are protecting:

- **`plan.rooms` must list at least TWO rooms**, and a blueprint with no `plan`
  needs `size.rooms >= 4`. A one-room map is refused either way.
- **A palette of nothing but `enclosure: none` is refused** — "the map would
  have no walls at all".

Do NOT satisfy the second with a weight-0 district nothing ever seeds; that is
gaming the check. Spell the venue as what it actually is: an open FLOOR
district ringed by a `hard` MARGIN district. A hard area beside an open one OWNS
the border between them (`borderOwner` in `engine/game/mapgen/areas.ts`), so
declaring the ring is what puts a real wall around the floor — and with the map
sized generously the wall sits far outside any frame the camera draws, which was
the point. Both refusals are then satisfied by the design rather than around it.
