---
title: A `once` area must be withdrawn from the seed pool AND from the unreached-cell fallback
date: 2026-07-28
---

`assignAreas` withdraws a `once` area from the live palette the first time it
wins a seed, which is what makes "there is A town" true. But the function has a
second roll at the end — the fallback for any cell the simultaneous BFS never
reached (a cell with no adjacency at all) — and that one draws from the full
palette. A map that ever hits that path can grow a second town, which is the one
thing the flag exists to prevent.

Both draws have to respect it: the tail rolls from `pool.filter((a) => !a.once)`.
Cheap to get right, and impossible to notice on the seeds you happen to render.
