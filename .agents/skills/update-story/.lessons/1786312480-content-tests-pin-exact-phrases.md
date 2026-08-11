---
title: A content test can pin an exact PHRASE from a line — grep tests/content before deleting one
date: 2026-08-09
scope: content/enemies/, content/levels/, tests/content/
concepts: [dialogue, testing, retone]
---

Per-venue suites assert that a scene still hits its plot beats by string, not by
shape: `goodco_test.ts` requires THE ARCHITECT's script to contain
`SUPERINTELLIGENCE` and `OBSOLETE`, `rift_test.ts` requires BRO OMEGA's to
contain `PRECISELY NO ONE`, `NOT YOUR` and `PRESIDENTS`. A trim that drops the
sentence carrying one of those words goes green through `story_test` and
`enemy_roundtrip_test` and fails only in the venue suite.

Before shortening a scene, grep the venue's own test for `toContain` and keep
the pinned words — folding them into the page you are keeping is nearly always
possible. Change the assertion instead only when the beat itself is being
retired on purpose (a flat threat like "NOW YOU WILL DIE"), and change it in the
same commit as the line.
