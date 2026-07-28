---
title: A nav grid that answers "can a body STAND here" is not a nav grid — verify the LINKS, and never A/B a heading change on one map
date: 2026-07-28
---

`buildNavGrid`'s doorway refinement re-opens a blocked cell wherever a
hero-radius body FITS. That is the right answer to the wrong question: a route
asks whether a body can GET from cell to cell, and on a wall built of discrete
stones (every generated map, and the scatter rock on the authored ones) two
cells either side of one stone both hold the hero while nothing passes between
them. A* stepped between them, so the runner was handed a route through solid
rock and ground on it until the wedge escape dragged him back.

The symptom is unmistakable once you look for it: a THOUGHT CENSUS showing
`TO BOSS` and `UNSTICK` alternating in ~5s blocks, forever, between two points
under 200px apart. 37% of one run's ticks were UNSTICK. The sim's `--stuck-limit`
did cancel that run, but the surrounding runs merely looked "a bit loitery" —
measure `blockedByObstacle` along the waypoints of a returned route and you get
a hard number instead (18 of 487 objective routes crossed stone; the honest grid
made it 0).

Three things the fix needs that are easy to miss:

- **Only wall-fringe edges need the sweep.** If neither cell overlaps any
  inflated footprint, everything within a body radius of either is clear and the
  segment between their centres never leaves that region — provably fine. So the
  cost is the fringe, not the map. (The refinement pass that scanned every solid
  per cell wants a bucket index while you are there.)
- **Give a re-opened cell an ANCHOR** — the clearest standing point inside it,
  not its centre — or a route cannot thread a doorway whose opening is
  off-centre. Then `reconstruct`'s collinear-drop must keep a moved anchor AND
  its two neighbours: collinear in CELLS is only collinear in WORLD while every
  node on the run still sits at its centre.
- **Anything that blocks cells AFTER the build must clear links too**
  (`closeNavCells`). The bot stamps out gravity-well discs; setting `walkable`
  alone left them fully linked and every route ran straight through the holes.

Second lesson, paid for twice: a bot HEADING change cannot be judged on one map.
Making `travelHeading` read the A* route instead of beelining (its docstring had
claimed route-awareness for a year; the code never did) fixed eastworld's wedges
16 → 3 and cut deaths 8 → 1 — while DOUBLING the rift's loiters and halving its
kills per minute. The rift is the gravity-well map: the grid has the wells
stamped out, so a route past one bends around it, and `steer` already repels him
from the same disc — applying the dodge twice is a hero orbiting a hole. Gate
the route read on GEOMETRY (`blockedByObstacle` on the straight line to the
goal), not on the grid, and both maps win: authored stuck penalty 70 → 17,
kills +17%.

Related: `exploreTarget`'s frontier used to require LINE OF SIGHT. Sight is
exactly the wrong question for a searcher — the fog he wants next is what he
CANNOT see, the far side of the doorway — so on a walled map the sweep could
name nothing but the pocket he stood in. One `navDistanceField` flood ranks the
whole frontier by walking distance, but DE-QUANTIZE it (add the hop from the nav
cell's anchor to the fog cell): the flood answers per 40px cell, a whole
neighbourhood ties, and ties fall to scan order — which is the map's top-left
corner, i.e. a sweep that drifts north-west wherever the hero stands.
