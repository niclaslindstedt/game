---
title: Three "obviously human" ammunition behaviours for the bot all measured as losses — including refusing to draw a dry gun
date: 2026-08-01
scope: engine/game/bot/
concepts: [ammo, husbanding, measurement]
---

Asked to make the autopilot ammunition-aware, I built four changes, measured
each against `origin/main` over a 3-seed medium campaign, and **shipped one**.
The three that lost are the valuable part of this note, because every one of
them is the thing you would reach for first.

**Lost #1 — husbanding the last rounds.** Damping a weapon's
`weaponMomentValue` as its pouch empties (put the good gun away at ~12 rounds,
swing the blade, save the shells): **−491 kills and +5 deaths on seed 1** while
winning by a similar margin on seed 3.

**Lost #2 — a dedicated GET AMMO detour**, mirroring the repair-kit errand. The
repair analogy is wrong twice: `AMMO.stackCap` is a HOARDING limit rather than a
magazine (a 25%-of-cap threshold had a hero opening with 100 rounds shopping
halfway through them), and — the fatal one — **ammunition boxes are a fat slice
of the drop ladder where repair kits are rare**, so "walk to the nearest box
within `ITEM_REACH`" fires almost every tick once armed, skipping the GPS
discipline (`wantedItemNearby`) the ordinary loot scoop uses to avoid being
dragged off-route. On seed 2 the hero spent goodco_hq walking between boxes
instead of fighting (330 kills vs 472), reached the moon under-levelled and
empty, and then **dealt ZERO damage for four straight levels**: 2384 kills →
330, 5 deaths → 48. Retuning to an urgent-only 15 rounds did not fix it (seed 3
deaths 10 → 27); removing the branch did.

**Lost #3, and the genuinely counter-intuitive one — refusing to DRAW a dry
gun.** Returning −1 from `weaponMomentValue` for a weapon with an empty pouch
looks like pure correctness: it stops the bot drawing a gun the engine
immediately stows again (`swapOffDryWeapon`), a tug-of-war across the
anti-juggle gap. It cost **683 kills on seed 3**; switching just that one gate
off took the same seed to +15 kills and +2 levels.

The reason is worth carrying: **that "tug-of-war" was productive.** Drawing the
dry gun hands the hero to the engine's dry-swap, which runs
`takeBestBagWeapon(..., { loadedOnly: true })` — a genuinely good pick. Refusing
to draw it leaves the bot on whatever it happens to be holding, which is worse.
Adding a `bestLoadedOwnedWeapon` fallback to make the bot do that pick itself
measured as an exact no-op (byte-identical results on all three seeds — the
branch never fires in a campaign sim), so it did not earn its keep either. **Let
the engine's dry-swap do this job; the bot does not need to know.**

**Shipped — `canBankPickup` needs an `ammo` case.** A box only PARTIALLY banks
(a stack with room for six of a twenty-round box takes six and the box stays,
carrying the rest), so the gate is "has the stack any room at all". Without it a
hero at the 200 cap steers at a box the engine refuses and stands on it — the
full-pockets stall that function exists to prevent. Measured neutral-to-positive
(seed 3: +2 levels, +15 kills, deaths flat).

**Two process traps, each of which cost a whole measurement round.**

- **Never run the test suite while a stash-based A/B sweep is going.** Swapping
  `engine/game/bot` under a running vitest produced three failures I could not
  attribute and one garbage sim reading. Use `git worktree add <dir> origin/main`
  for the baseline — the live tree is never touched. (Watch CPU contention even
  then: `net_session_test` and `sim_party_test` both failed under a 4-way
  parallel sweep and passed alone.)
- **A `drive()`-based swap test can pass vacuously.** "Will not draw a dry gun"
  passed at 150px only because the melee-stick band held the blade for an
  unrelated reason — and it kept passing when I handed the hero ammunition,
  which is what exposed it. Call `stepBotWeaponSwap(state, hero)` directly (the
  `pocket_arsenal_test.ts` idiom) for anything about what is in the hand.
