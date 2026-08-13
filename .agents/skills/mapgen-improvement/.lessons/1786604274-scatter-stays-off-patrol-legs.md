---
title: Scattered obstacles must stay off patrol legs — the sentry-walk test is the tripwire
date: 2026-08-13
scope: engine/game/create.ts, content/maps/
concepts: [scatter, patrols, clearance, spawn-posts, tests]
---

Adding density scatter to a venue with patrolling posts can silently shorten a
sentry's real walk: the derived beat (`patrolBeat`) still measures >120 px in
the def, but the mob wedges against a scattered prop mid-leg, and
`tests/content/generated_maps_test.ts` ("keeps the sentries walking") fails on
the MEASURED distance. The fix is never density fiddling to re-roll the seed —
`scatterObstacles` (engine/game/create.ts) holds every scattered piece
`PATH.clearance` off every `at → patrol[0]` segment, the same lane rule the
hero's own path gets. Keep that check when adding new placement kinds; anything
placed by a rule that skips it (prefab props, part props) is placed by a human
who can see the beat.
