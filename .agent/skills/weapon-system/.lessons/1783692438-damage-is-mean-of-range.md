---
title: def.damage is the MEAN of a range, not a fixed hit
date: 2026-07-10
---

Every blow rolls inside a band (`WEAPON.damageVariance` default, per-def
`damageVariance` override) around the average. Keep authoring `damage` as
the average — the budget model, DPS readouts, auto-equip, and grade
generation all reason about expected output, so the spread rides on top and
none of them change. `weaponDamageFor` stays the deterministic average
(UI/scoring); `rollWeaponDamage` is the combat-time roll;
`weaponDamageRange` is the item-card min–max. Melee rolls once per swing,
projectiles once PER PELLET.
