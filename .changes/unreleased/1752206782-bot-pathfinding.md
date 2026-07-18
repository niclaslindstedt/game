---
type: Changed
title: Autopilot global pathfinding
---

The autopilot now plans real A* routes across the whole level (a coarse walkability grid built from the walls and rock, in the new `pathfind.ts`) instead of only sliding along the walls it can see ahead, so it threads the ridge gaps and walled pockets to reach any chest, elite, or the boss on its own. On top of it, the bot automatically sweeps to every reachable off-path chest before committing to the boss, abandoning any cache it genuinely can't make headway toward so a run never deadlocks. The headless simulator now reports how many of a level's chests the runner actually cracked open — a reachability check that flags a cache walled off from the natural sweep.
