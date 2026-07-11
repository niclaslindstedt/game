---
type: Added
title: Headless campaign simulator
---

A balance-measurement simulator (`scripts/simulate-run.mjs`, engine module `src/sim/simulate.ts`) that plays whole levels or whole campaigns (easy → JESUS across every map) through the real engine with the autopilot, auto-equip, and loadout carry-over, and reports hero level/hp/dps progression, per-mob hp/level/contact damage, drops, weapon swaps, deaths, and the XP the per-map caps withheld — plus the `simulate-run` agent skill that drives it.
