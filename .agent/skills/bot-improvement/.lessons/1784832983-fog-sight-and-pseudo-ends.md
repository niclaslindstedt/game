---
title: Wall sight is screen + minimap, and a wall "end" must pass the blocker along the goal line
date: 2026-07-23
---

Two lessons from making the bot trace walls by fog-of-war knowledge (#p86h1j):

- **The honest sight for the wall-end sense is screen ∪ explored, not screen
  alone.** The running game reveals a `MAP.revealRadius` (160px) CIRCLE along
  the walked path (`revealAround` in step()), NOT the camera rect — so the
  explored grid is neither a superset nor a subset of the screen. A player
  knows both (the screen now, the minimap always); `knownSightFrom` (bot/nav.ts)
  takes the per-bearing max of `rayRectExitDistance` (screen) and
  `exploredRay` (map.ts — ray-march the fog grid to the first fogged cell).
  On a portrait phone (~97px horizontal half-view) the screen alone made every
  jig wall's end invisible — the reported "bot lost at the wall" failure.

- **`visibleObstacleEnd` accepted PSEUDO-ENDS: a steep bearing that merely
  veers away from the wall (open sweep past `blockDist`) read as an "end"
  even though walking there rounds nothing** — e.g. straight down an open
  corridor beside a wall that runs to the level edge. Long fog-sight made
  these fire constantly. The fix: the sight point must also stand PAST the
  blocker ALONG THE GOAL BEARING (`dot(p − from, goalDir) > blockDist +
  radius`). Beware when staging tests: an end near the LEVEL EDGE can be
  UNPROVABLE under this rule (the `WALL_END_EDGE` clamp caps the along-goal
  projection of steep bearings), so give test walls an end gap wide enough
  that a π/16-granularity bearing can genuinely thread it.

- With no end known anywhere, the fallback objective is `traceTowardFog`
  (bot/nav.ts): walk along the wall toward the nearest REACHABLE fog frontier
  (fog glimpsed through the wall doesn't count — sweep-check the frontier),
  side-latched on `bot.trace` against flip-flop. A side already explored out
  to the level edge yields null — the "wall must end the other way" deduction.
  Measured (spacez_hq easy, seeds 1-10, portrait + landscape cameras):
  portrait deaths 14→4, damage taken −34%, kills +11%, stuck penalties 2→1
  (the survivor a single loiter, no wedge); landscape deaths within per-seed
  noise with 2 boss kills gained. Immortal-mode death totals scatter with ANY
  walk change — judge across ≥10 seeds and read the deathLog causes before
  calling a regression.
