---
title: A bot weapon-swap system is a harness action, and every junk predicate must skip its keep-set or the merchant errand loops
date: 2026-07-21
---

The POCKET ARSENAL (bot-economy.ts `stepBotWeaponSwap`) lets a blade hero
keep dealing damage out of blade reach and through airborne frames by
swapping to a banked ranged/magic weapon. Lessons from landing it:

- **It's a harness-side action, not botAct.** `botAct` stays a pure
  GameInput producer; the swap mutates state, so it rides next to
  `cullWorstLoot` in both harnesses (simulate.ts's step loop, GameScreen's
  bot block). Anti-flap memory (`Bot.lastSwapMs`) lives on the bot via a
  structural type (`SwapMemory`) so bot-economy needs no import from bot.ts
  (which imports bot-economy at value level — a real cycle otherwise).
- **Carry the attack clock across the swap.** `equipFromInventory` zeroes
  `weaponCooldownMs` (the UI's rule). A per-tick swap system on top of that
  is an infinite-fire-rate machine; clamp the carried wait to
  `min(carried, weaponCooldownFor(newHand))` so a juggle never mints a shot.
- **Every junk PREDICATE must skip the keep-set, not just the mutators.**
  Sparing the pocket in `cullWorstLoot`/`tradeAtMerchant` while
  `sellableJunkCount` still counted it left `wantsMerchantVisit` forever
  true — a sell-run that can never resolve. The predicate has to mirror what
  the counter actually sells.
- **"Is this hero melee?" must not read the HELD weapon** — mid-swap the
  blade rides the bag and a gun rides the hand. Rank the strongest OWNED
  weapon (hand + bag, `weaponScore`) and key every gate off that. Test
  gotcha: a bare rookie's starter sword genuinely LOSES the weaponScore race
  to a plain wand (the fixture hero needs STR invested to read as melee).
- **The "airborne melee is dead weight" hop gates (commitHop's ranged-only
  press hops) open up** for a blade hero with a pocket banked
  (`hasPocketShooter`) — the swap draws the gun at the top of the hop.
- Measured (spacez_hq easy, melee class, seed 1, 8 min sim A/B):
  kills 403 → 426, damage taken slightly down; the app playtest's melee
  profile often ends holding a gun anyway (auto-equip prefers guns for STR
  builds), in which case the system is correctly inert and runs are
  byte-identical to baseline.
