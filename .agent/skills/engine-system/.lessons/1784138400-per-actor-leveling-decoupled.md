---
title: Per-actor leveling decoupled from the hero rides the loadout + a cycle-free stat module
date: 2026-07-15
---

Giving a secondary actor (companions) its OWN level/XP, growing FOREVER across
levels and difficulties, needed three moves and no new persistence system:

1. **The loadout IS the cross-difficulty spine.** A character owns ONE `Loadout`
   carried whole into everything it plays (pwa `characters.ts`), so adding
   `level`/`xp` to `Loadout.companions` entries (optional, for old-save
   back-compat) made companion levels persist across every level AND difficulty
   for free — `extractLoadout`/`applyLoadout` carry them; no character-store
   change. New GameState field (`Companion.xp`/`xpToNext`) = pwa
   `SAVE_VERSION` bump, as always.
2. **Credit the kill at the ONE kill site, tagged by killer id.** The actor's
   melee/projectile/chain/nova hits all already carried a `companionId`; thread
   it into `hitEnemy`→`killEnemy` opts and credit XP in `killEnemy` after the
   kill books. One site catches every attack path instead of per-call
   `killsBefore` bookkeeping. Use the base `enemyKillXp` (NOT the per-map
   `xpCapMultiplier`) so the sidekick levels indefinitely by design.
3. **Pure stat/level/power math goes in its OWN module to dodge the cycle.**
   `companions.ts ↔ loot.ts` is a real import cycle; putting
   `companionMaxHp`/`companionXpToLevelUp`/power-rank math in a new
   `companion-stats.ts` (imports only config + the def type + the level XP unit,
   imports nothing back) lets `companions.ts`, `loot.ts`, `items.ts`, AND
   `arrival.ts` all share it cleanly.

**Emergent "death" without a permadeath flag or a hardcore hook (the engine
doesn't know hardcore):** gate the existing self-revive on being OUT of combat
(a foe within `downedCombatRadius` freezes the down-count). A sidekick downed in
a swarm then STAYS down — real stakes — while a clean scrap still self-revives,
and the merchant revive (`reviveDownedCompanions`, called from the
discovery/return-greeting/shop-open paths in `merchant.ts`) is the lifeline that
works in every mode because it's mode-agnostic engine code. Existing self-revive
tests keep passing because they clear the stage before waiting out the count.

**Scalable signature POWER as data:** a `CompanionDef.power` with `everyLevels`
+ per-rank fields (extra pellets/chain/pierce, nova radius/damage, aura) that
`companionAttack` folds onto the weapon's `projectile` spec — a coil with no
base `chain` still learns to arc once its rank clears. Growth is authored per
companion, one field at a time, with zero renderer edits (more pellets = more
projectiles; a wider nova rides the event radius already drawn).
