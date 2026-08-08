---
title: Resolve a loose target name first
date: 2026-07-11
scope: scripts/art-audit.mjs
concepts: [target-resolution, workflow]
---

Users name a biome or level loosely ("do goodco", "improve the moon").
`art-audit.mjs levels` prints every level id *and* its biome — map the
request to a concrete `<id>` before surveying (e.g. "goodco" → `goodco_hq`,
biome `goodco`).
