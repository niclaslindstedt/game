---
title: Resolve a loose target name first
date: 2026-07-11
---

Users name a biome or level loosely ("do spacez", "improve the moon").
`art-audit.mjs levels` prints every level id *and* its biome — map the
request to a concrete `<id>` before surveying (e.g. "spacez" → `spacez_hq`,
biome `spacez`).
