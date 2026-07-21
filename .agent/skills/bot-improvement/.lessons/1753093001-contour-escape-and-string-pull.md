---
title: Wedge livelocks came from a timed escape sweep and blind string-pulling — commit to an open heading, and replan when the next waypoint is blocked
date: 2026-07-21
---

The 2026-07 stuck audit (12 of 15 easy runs cancelled by the sim's stuck
limit) traced every wedge to `nav.escaping=true` with `stuckMs` 17-30s: the
bot's own escape was the livelock. Two structural causes, both in code that
LOOKED reasonable:

- **A timed rotating escape sweep cannot exit a pocket.** The old
  `unstuckInput` swept headings goalward-first on a 600ms timer, recomputing
  the goal bearing from the CURRENT position each tick — wall-sliding made the
  swept absolute angles oscillate, the one open heading got only 600ms of
  travel before rotation yanked him elsewhere, and the 160px exit distance was
  never accumulated. Fix: probe candidate headings with a body-width
  `blockedByObstacle` sweep (90px), COMMIT to the first open one
  (`nav.escapeHeading`), hold it while it stays open, and when it blocks
  re-probe ordered by closeness to the previous heading — a contour trace that
  bends around corners instead of flipping back in. Keep the timed sweep only
  as the all-blocked fallback.
- **`routeTarget` steered at invisible waypoints.** The string-pull fell back
  to `path[index]` even when a thin wall stood between the hero and it (he can
  be shoved into a pocket while still inside the 170px stray band) — grinding
  him into the wall right after each escape, which re-wedged him in a loop.
  Fix: treat a body-blocked next waypoint as a stale plan and REPLAN from
  where he stands (A* is sub-ms; fine).

Measured effect (easy campaign, seeds 1-3, 10 min/map): stuck cancellations
12/15 → 0/15, wedge events ~100 → 1, six previously-unreached bosses now
engaged and killed, final level 17 → 23 on seed 1. Remaining stuck signal is
LOITER events on under-leveled late maps (eastworld at L23 vs intended L31) —
a pacing/balance read, not navigation; they never near the cancel limit.

Repro tooling: `scratchpad/trace-stuck.mjs`-style replay (mirror the sim loop,
dump `bot.lastThought` + `nav`/`route`/`content`/`seek` at each wedge/loiter)
is the fastest way to see WHY the bot stands somewhere — build it before
hypothesizing.
