---
title: Auto-equip must speak the balance model — at realized AoE, not ceiling
date: 2026-07-10
scope: engine/game/items/, pwa/src/game/ItemCard.tsx
concepts: [auto-equip, balance-model, aoe]
---

When per-target damage was budget-normalized, raw dps ranking
(`weaponScore`) started shunning every AoE weapon; the score folds in
assumed targets and the crit lift now. Any future model change lands in
`weaponScore`, `weaponDps`, and the budget scripts together.

AoE is credited at what it REALIZES, not a ceiling. The counts are now
CALIBRATED (not the old cone-4 / full-5 buckets): melee reads the swept-area
`WEAPON.meleeAoe` model, ranged reads `WEAPON.rangedAoe`. Two ranking nuances
live in `weaponScore` and nowhere else:

- A ranged SPREAD's extra pellets are situational (they burst on one body at
  point-blank, fan wide at range), so it ranks at `1 + (count − 1) ×
  WEAPON.rangedAoe.spreadRankDamp` — crediting the full `count` let a spread
  with a quarter of a single-target's per-hit displace it on a paper tie.
- MELEE ranks at the hero's LIVE reach/cone, because the ranking runs with real
  stats — whereas the BUDGET (`weaponAssumedTargets` → `meleeBudgetTargets`)
  estimates the realistic stats for the weapon's `levelReq`.

Both live behind ONE accessor — `weaponRankTargets(state, player, weapon)` in
`items/weapon-math.ts` — and every surface that wants the ranking's crowd reads
THAT: `weaponScore`, `weaponEffectiveDps`, and the item card's EFFECTIVE DPS /
HITS rows. The budget scripts keep the raw `weaponAssumedTargets`.

**A ranking surface that derives its own crowd is the bug to watch for.** The
card used to print `maxMeleeTargets` — the INT CAP — which for a real build
sits far above the geometry, so every melee weapon read an identical "HITS 2
+6" while the ranking silently credited 1.2 foes for a knife and 2.8 for a
zweihander. A player then sees auto-equip take a weapon whose only visible
number (per-target DPS) is worse, and nothing on screen accounts for it.
