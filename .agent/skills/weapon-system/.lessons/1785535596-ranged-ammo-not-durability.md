---
title: A ranged weapon's opening ammo must key off the DIFFICULTY'S starting weapon, not the sidearm
date: 2026-07-31
scope: src/game/items/ammo.ts
concepts: [ammo, durability, starting-weapons]
---

Ranged weapons carry `ammo:` and no `durability:` (the item schema enforces the
pair). The trap when wiring the opening pouch: EASY's starting weapon is a
`sawed_off_shotgun`, NOT the built-in sidearm. A `startingAmmo()` that read only
`weaponDef(SIDEARM_DEF_ID).ammo` handed that hero a shotgun beside a hundred
CELLS and he could not fire a shot all run — every test still passed except
`tests/engine/sim_party_test.ts`, which noticed only because no party seat ever
levelled. `startingAmmo(heldWeapon)` now stocks BOTH kinds. Anything else that
reasons about "the weapon a run opens with" has the same trap: read
`DifficultyDef.startingWeapon`, and remember each of the five rungs names a
different one (`src/game/defs/difficulties.ts`).

Second gotcha in the same area: `weaponAmmoType` walks whole BAGS
(`ammoKindFor`), and a bag is mostly armor — it must guard with `isWeaponDef`
or `weaponDef()` throws on the first charm it meets.
