---
type: Changed
title: Faster simulation and autopilot
---

The headless campaign simulator and the in-game autopilot run markedly faster (a full easy campaign simulates ~2.5× quicker) with byte-identical results: the bot's per-tick economy reads (weapon scoring, bag discipline, merchant errands) now memoize off the hero-loadout memo instead of re-walking the bag several times a tick, the enemy/projectile catalogs and instances share one object shape so the tick's hot loops stop hitting megamorphic property lookups, and world-distance math drops the slower overflow-safe path — all behavior-preserving.
