---
title: A sliver of OPEN border is a wall, and counting it as a route lies to the vault picker
date: 2026-08-06
scope: src/game/mapgen/
concepts: [borders, routes, vaults]
---

Two cells of one open district have no wall between them, so `carveChambers`
treated ANY overlap as connectivity — including the thirty-pixel slivers the
carve leaves where two independent splits land near each other (`coalesce`
already knew about those, and merged their walls; the graph did not).

Nothing can walk one. What made it a bug rather than a curiosity is that
`survivesWithout` — the check that refuses to seal a keyed room if the map needs
it — reads that same graph. On goodco_hq it was told a car park with a vault on
one side and a hall on the other was still connected "round the back" through a
19 px seam, sealed the room, and put the boss, every elite and the exit behind a
keycard the hero could not reach. One seed in eight.

The floor is a BODY's, not a doorway's: `MIN_WALKABLE` = 80, off the hero's 20
and `NAV_CELL`'s 40. Below it the border is walled, which is also the honest
picture — the sliver was already a gap between two walls.

Two more of the same shape worth knowing:

- Every border is downgraded to `closed` when it is too short for the opening its
  treatment implies, and the spanning tree can only open a border that is already
  a `door` — so a cell whose borders are ALL short is sealed for good. Harmless
  while cells were districts; real once interior districts are cut into rooms.
  `carveChambers` now promotes such a cell's longest border regardless.
- A DOORWAY's width is the smaller of the two areas' `doorWidth`, not the border
  owner's. The owner rule is right for the wall's material and wrong for the hole
  in it: taking the owner's put roller shutters on the cleaning cupboard.
