---
title: Deleting a weapon id is a repo-wide grep
date: 2026-07-10
---

Not a def deletion: level pools, `placedItems`, `earlyDrops`, enemy
`loot.items`, content tests, icons (a swapPalette variant may still need the
const), and BANKED LOADOUTS in players' localStorage — `migrateLoadout` in
`pwa/src/game/progress.ts` must map retired ids/tiers or old saves crash
`createGame`.
