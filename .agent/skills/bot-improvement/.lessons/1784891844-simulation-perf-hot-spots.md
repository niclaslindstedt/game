---
title: Making the sim run faster — the bot's per-tick economy walks and the megamorphic hidden-class traps that dominate the profile
date: 2026-07-24
---

When simulations feel slow, profile the REAL loop with V8, not guesswork:

```sh
node --prof scripts/simulate-run.mjs --difficulty easy --level spacez_hq --seed 42
node --prof-process isolate-*.log > prof.txt   # [JavaScript] + [Bottom up (heavy)]
```

Two families of cost dominated a full easy campaign (seed 42: **73.5s → 29.1s
wall, 2.5×**, with byte-identical results — verify every change by diffing
`--full` output across seeds, ignoring the `Xs wall` line):

**1. The bot's economy reads are recomputed many times per tick.** The
harnesses call `stepBotWeaponSwap`, `cullWorstLoot`, `sortBotInventory` every
tick, and `wantsMerchantVisit` runs 2–3× per tick (macroTarget, marchingOnFoe,
the harness). Each re-walked the whole bag recomputing `weaponScore`/`weaponDps`
(and through them `playerCritChance`, `weaponDamageFor`, …). These figures are
**pure functions of the hero LOADOUT**, and `heroLoadoutMemo` (items/derived.ts)
already mints a fresh memo object whenever the loadout snapshot changes (it
hashes worn ids + every bag id + stats + level). So memoize off that memo:

- `weaponScore`/`weaponDps` cache on the memo (`weaponScoreCaches`), keyed also
  by a self-buff signature (buffs scale damage/haste uniformly — the ONLY
  per-tick input besides the loadout; the sig only moves when a buff starts/ends).
- `bestOwnedWeapon`, `botPocketKeepIndices`, `sellableJunkCount` cache in
  `bot/economy.ts` via `WeakMap<memo, …>` — auto-invalidated when the memo
  changes. Read-only results, so the shared reference is safe.
- `sortBotInventory` short-circuits when its memo is already in a `WeakSet` of
  sorted loadouts (a reorder mints a fresh memo reflecting the new order).

Gotcha: a bag weapon never wears (only the HELD one does, and breaking it swaps
the equipped id → new memo), so durability never desyncs these caches.

**2. Fragmented hidden classes → megamorphic property loads.** `LoadIC_Megamorphic`
was the single biggest cost. The tick's per-enemy/per-projectile loops read a
dozen `def.*` / `enemy.*` / `projectile.*` fields each, but those objects were
built as literals carrying only their USED fields, so ~90 enemy defs / every
lazily-grown enemy / three projectile factories each had a DIFFERENT shape.
Fix = stamp EVERY field (absent optionals as `undefined`, in the type's declared
order) so all instances share one hidden class:

- `EnemyDef`: canonicalized at load in `defs/enemies/index.ts` (+ `ai` sub-object).
- `Enemy`: full-shape literal in `create.ts` `spawnEnemy`, so no lazy
  `enemy.vanishMs ??= …` / `enemy.awake = true` ever grows the shape.
- `Projectile`: one `createProjectile` factory (`src/game/projectile.ts`) for all
  three shot sites. `undefined` reads identically to an absent field at every
  site, and `.toEqual` / JSON ignore it, so round-trip snapshots are untouched —
  but check first that nothing does `'x' in obj` / `Object.keys` on the object.

**3. `distance()` used `Math.hypot`** (overflow-safe, slow) — the engine's
most-called number. `Math.sqrt(dx*dx+dy*dy)` is bit-identical for the sim (its
result only feeds thresholds/step magnitudes; verified across seeds). But the
`direction`/`normalize` UNIT vectors must KEEP `hypot` — swapping them there
perturbs accumulated positions and changes the run.

General rule: `snapshotMatches` (the loadout-memo revalidation) shows up hot
because every derived-stat read triggers it; caching a whole result off the memo
removes the fan-out of inner memo revalidations, not just the leaf math.
