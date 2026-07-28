---
title: "`onPathLevel` is not a proxy for \"this map has walls\" — and the sim's unstick hides the difference"
date: 2026-07-28
---

The whole wall-handling stack — `navTarget`'s wall-end sense, `unstuckInput`'s
escape, the A* `routeTarget` follow in the fight, and kite-forward — was gated on
`onPathLevel(state)`. That read as "maze levels only", and it was true while every
walled map in the game also authored a path. GENERATED MAPS broke it in the worst
direction: they emit no path ON PURPOSE (the guidance arrow is the thing a search
exists without) and are the most walled geometry the game has. So the bot crossed
compounds, streets and doorways on straight-line steering with no route, no wall
sense and no escape.

Gate on what the map IS (`navigatesWalls`: walls, buildings or doors — or an
authored path), not on the proxy.

Two measurement traps this exposed:

- **`--stuck-limit`'s penalty is not the navigation signal — `combat.unstuckNudges`
  is.** The sim's own stall-breaker teleports the hero when nothing lands for a
  stretch, so a bot that cannot navigate at all still posts a plausible-looking
  run; the nudge counter is the crutch's own usage meter. Measured across easy ×
  seeds 1-3 on generated maps: wedge events 47 → 6, nudges 47 → 6, kills 1961 →
  2041, clears 2/15 → 3/15. Loiter events went UP (9 → 20) — he now REACHES the
  cache pockets he used to wedge short of, and circles there; that is a content-
  errand read, not navigation.
- **One seed inverted the conclusion.** On seed 1 alone the full change looked
  like a disaster (kills 867 → 427) and the nav-only variant looked best. Across
  three seeds the ranking flipped and the full change won on every axis. Never
  A/B a bot change on one seed — the lesson exists twice in this folder now.
