---
title: `doorWidth` is an INPUT to the carve, not the width of the hole — narrow it and you get a different building
date: 2026-08-12
scope: content/maps/, engine/game/mapgen/
concepts: [blueprint, doorways, carve, doorwidth, opening]
---

`MapArea.doorWidth` / `layout.doorWidth` are read by `carveChambers` BEFORE any
wall exists: they decide which borders are long enough to carry a doorway at all
and how small a room may be cut before it seals itself. So "make the doors
narrower" by editing those numbers does not narrow the doorways — it redraws the
floor plan. Measured on GOODCO, taking its ladder (56/64/88/130/220) down to a
person door moved every wall, gave the staff lot FOUR ways into the building
instead of one, and staged the arrivals beat off the hero's screen on a seed that
had been fine for a year.

Narrow the HOLE instead: `MapObject.opening` on the `door` object, applied to
`border.door` in `sizeOpenings` (generate.ts) after the carve hands the grid over
and before `wallSegments`/`doorGaps` read it — both derive from the same number,
so walls and gap can never disagree. The floor plan then stays bit-identical to
the one that ships and only the opening in it changes.

Two things to check after any doorway-width change, because neither is obvious:
`tests/content/generated_maps_test.ts` (reachability, and it builds its grid with
the door chains DISSOLVED — a doorway too narrow for the nav grid fails there
long before a human notices), and the enemy radii the opening now excludes
(`opening - 2 * wallRadius` is the free channel; a body of radius r needs
r < channel/2).
