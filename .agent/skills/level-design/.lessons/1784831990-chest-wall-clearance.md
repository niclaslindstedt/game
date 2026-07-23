---
title: Authored chests must clear wall circles by radius + wall radius + OBSTACLES.spacing — the content furniture tests enforce it
date: 2026-07-23
---

A `chests:` entry is minted at its authored position with no placement retry,
so nothing stops it overlapping architecture — but per-map content suites (e.g.
`tests/content/spacez_test.ts` "keeps scattered furniture clear of the
architecture") assert every non-wall obstacle sits more than
`piece.radius + wall.radius + OBSTACLES.spacing` from EVERY wall circle
(chest radius 9 + wall radius 8 + spacing 28 ≈ >45 world px on SpaceZ). Zone
rects "hug the pocket walls", so a chest centred near a quiet-zone edge is
almost touching a wall chain — place it ≥50 px off any wall line, and check
diagonals too (the failing case was a 42 px diagonal to the nearest wall
circle, √(30²+30²)). Also remember the count assertions: several maps pin the
exact number of chests (`toHaveLength(n)`), so adding a cache means updating
that map's content test alongside the snapshot
(`node scripts/update-level-snapshot.mjs`).
