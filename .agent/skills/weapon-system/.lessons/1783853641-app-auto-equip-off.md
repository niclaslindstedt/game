---
title: The app ships auto-equip OFF — in-app probes must wear banked uniques by hand
date: 2026-07-12
---

The engine's `autoEquipOnPickup` defaults ON, but the shipped app's
`settings.autoEquip` default is **"off"** (`pwa/src/game/settings.ts`)
and it overrides the engine on load. A playtest/probe that stages a unique
as a ground drop will see it PICKED UP INTO THE BAG, never equipped — that
is correct behavior, not a ranking bug. When probing an item's in-game
behavior (procs, granted spells), either swap it into
`player.equipment.weapon` via `window.__game` after pickup, or flip the
AUTO EQUIP setting first. Burned ~3 probe rounds rediscovering this.
