---
title: A route waypoint standing IN a doorway must not be retired on proximity — and the grid must anchor that cell on the doorway
date: 2026-08-12
scope: engine/game/bot/nav.ts, engine/game/pathfind.ts
concepts: [navigation, nav-grid, doorways, string-pull, route]
---

Two independent bugs, both invisible on a wide opening and both fatal on a
person-width one (32px free). Found by cutting GOODCO's doorways to two slabs:
the autopilot oscillated one stride outside an OPEN gate for the whole clock,
and `generated_maps_test.ts` reported the boss, four caches and both story items
unreachable on a floor a human walks through without noticing.

**`routeTarget` retired the doorway.** The retire loop advanced the index on
`distance(from, path[index]) <= ROUTE_REACH` (48px) alone, so the hero was
retired past the only hole in the wall while still standing outside it. The plan
then aimed at the next cell's anchor on the far side of the stone, the wall sense
traced him sideways, `nextBlocked` replanned, and the identical route handed back
the identical waypoint. Fix: retire only when the hero is close AND the waypoint
AFTER it is a clear body-width sweep away — "past it", not "near it" — with an
exception for standing ON it (inside a body radius), or he steers at his feet.

**`buildNavGrid` anchored the doorway cell somewhere else.** The refinement asks
"where in this cell does a body fit BEST", which for a cell straddling a wall is
open floor beside the gap rather than the gap. Links are then swept from THERE.
Fix: after the refinement, pin the anchor of the cell containing each
`state.doors` centre to that centre — but only where a body actually fits, so a
SHUT door (its chain is in the same obstacle field) still seals itself.

Measured, medium seed 1, one run per level: baseline 1 clear / 3 timeouts /
4 deaths → after 3 clears / 1 timeout / 1 death; goodco alone 0/3 clears → 2/3.
