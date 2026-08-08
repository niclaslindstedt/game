---
title: The bot must not inherit PLAYER settings — and the two harnesses must run the same actions
date: 2026-07-25
scope: src/sim/simulate.ts
concepts: [harness-parity, settings, testing]
---

A bug where the AUTO PILOT hauled a bag full of unworn upgrades traced to two
things worth remembering:

1. **A player SETTING is not a bot rule.** The on-pickup auto-equip is
   `settings.autoEquip`, which the app ships **off** (finds bank so a human
   curates their own loadout) and applies to the engine on load via
   `setAutoEquipEnabled`. The bot has nobody curating anything, so anything it
   needs must be a harness-side action of its own (`botAutoEquip`), never a
   read of a human preference. Check `pwa/src/game/settings.ts` before assuming
   an engine default holds in the running app.
2. **The campaign sim and the app can silently diverge.** `src/sim/simulate.ts`
   runs on the ENGINE defaults (auto-equip on), while
   `pwa/src/game/game-screen/bot-driver.ts` runs under the player's settings —
   so a bot behaviour that measures perfectly in `simulate-run.mjs` can be
   broken in the actual game. Any harness-side action (`botAutoEquip`,
   `cullWorstLoot`, `sortBotInventory`, `stepBotWeaponSwap`, `tradeAtMerchant`)
   must be wired into BOTH, in the same order. To verify the app side, drive
   the real page (`?debug&bot=…`) and read `window.__game.player.equipment` /
   `.inventory` — a headless sim will not reproduce it.

Related gotcha in the same area: `stepBotWeaponSwap`'s "a shooter build never
swaps" early return fired on the best OWNED weapon, so a hero holding a blade
with a stronger gun still in the bag never drew it. Guards keyed off
`bestOwnedWeapon` must check `main.index` (-1 = in hand) before concluding the
hand is already right.
