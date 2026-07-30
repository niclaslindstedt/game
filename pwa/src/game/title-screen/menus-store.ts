// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The COIN STORE screens: the pack list, the BUY confirmation, and the
// DISTRIBUTE flow (pick a hero, slide an amount out of the undistributed
// bank). The purchase/send plumbing lives in use-coin-store.ts — these
// builders only lay out the rows.
//
// The packs and the roster are catalogs, so those rows are built here and stand
// ABOVE the tree's own; the fixed rows around them (DISTRIBUTE, BUY, CANCEL,
// SEND and the two empty-handed lines) are the tree's, like every other screen.

import { formatCoins } from "@ui/lib/format-number.ts";

import { synth } from "../audio.ts";
import { characterPurse } from "../characters.ts";
import { playUiSound } from "../sfx/ui.ts";
import { bankBalance, COIN_PACKS, SEND_TICK } from "../store.ts";
import {
  actionRow,
  assembleRows,
  backRow,
  navRow,
  sliderRow,
  type MenuContext,
  type MenuEntry,
} from "./menu-model.ts";
import { rowAria } from "./menu-tree.ts";

export function buildStoreMenu(ctx: MenuContext): MenuEntry[] {
  // The COIN STORE: real-money coin packs that fund the AUTO PILOT (the purse
  // drains per simulated second — see src/game/autopilot.ts). A tapped pack
  // goes straight to the platform pay sheet (the OS confirms the charge); the
  // coins land in the UNDISTRIBUTED bank, and the DISTRIBUTE row below hands
  // them out. The platform's localized price tag sits right-aligned like a
  // settings value.
  const bank = bankBalance();
  return [
    ...COIN_PACKS.map((pack, i): MenuEntry => ({
      label: `${pack.amount} COINS`,
      aria: rowAria("store", pack.sku),
      value: ctx.storePrices?.[pack.sku] ?? pack.price,
      color: "#ffd75e",
      // Every pack glimmers, and the coin emblem fattens down the list (tier
      // 1..N) so the bigger hauls visibly out-shine the small ones — the
      // dopamine ladder the store is built around.
      shiny: true,
      coinTier: i + 1,
      // A tap never buys straight away — it opens a confirmation screen so an
      // accidental press can't spend money (or, in free builds, bank coins)
      // on its own. The purchase runs only from CONFIRM there.
      action: () => {
        if (ctx.storeBusy) {
          playUiSound(synth, "back");
          return;
        }
        playUiSound(synth, "confirm");
        ctx.setStorePackSku(pack.sku);
        ctx.setNotice(null);
        ctx.setScreen("storeconfirm");
        ctx.setCursor(0);
      },
    })),
    ...assembleRows("store", {
      distribute: navRow(ctx, "store", "distribute", {
        locked: bank <= 0,
        help:
          bank > 0
            ? `${formatCoins(bank)} COINS UNDISTRIBUTED - SEND THEM TO YOUR HEROES`
            : undefined,
        state: "empty",
      }),
    }),
    backRow(ctx, "store"),
  ];
}

export function buildStoreConfirmMenu(ctx: MenuContext): MenuEntry[] {
  const pack = COIN_PACKS.find((p) => p.sku === ctx.storePackSku);
  const packIndex = COIN_PACKS.findIndex((p) => p.sku === ctx.storePackSku);
  const priceTag = pack
    ? (ctx.storePrices?.[pack.sku] ?? pack.price)
    : undefined;
  const isFree = priceTag?.trim().toUpperCase() === "FREE";
  return [
    // Nothing pending (shouldn't happen) — the screen falls back to its lone
    // BACK row, which steps to the store list.
    ...assembleRows("storeconfirm", {
      buy: pack
        ? {
            ...actionRow(
              "storeconfirm",
              "buy",
              () => {
                if (ctx.storeBusy) {
                  playUiSound(synth, "back");
                  return;
                }
                // Head back to the store list first so its purchase result line
                // shows there (this screen is transient), then run the buy.
                ctx.setScreen("store");
                ctx.setCursor(packIndex < 0 ? 0 : packIndex);
                void ctx.runPurchase(pack);
              },
              {
                value: priceTag,
                color: "#ffd75e",
                // FREE grants need no help — the row's FREE value tag already
                // says it all, and the long restatement wrapped to two lines in
                // portrait. A paid buy keeps the short charge confirmation.
                state: isFree ? undefined : "paid",
              },
            ),
            label: `BUY ${pack.amount}`,
            // The confirmation row wears the same glimmer as the pack it came
            // from, with its coin emblem sized to the pack's place in the
            // ladder — so the "about to strike gold" beat lands while the coins
            // rain behind it.
            shiny: true,
            coinTier: packIndex < 0 ? 3 : packIndex + 1,
          }
        : null,
      cancel: pack
        ? actionRow("storeconfirm", "cancel", () => {
            playUiSound(synth, "back");
            ctx.setScreen("store");
            ctx.setCursor(packIndex < 0 ? 0 : packIndex);
          })
        : null,
    }),
    backRow(ctx, "storeconfirm", packIndex < 0 ? 0 : packIndex),
  ];
}

export function buildStoreHeroMenu(ctx: MenuContext): MenuEntry[] {
  // DISTRIBUTE → choose which hero receives coins. Every living hero is offered
  // with their current purse; the fallen keep their graves (coins can't help
  // them).
  const living = ctx.roster.filter((c) => !c.dead);
  return [
    ...living.map((hero): MenuEntry => ({
      label: hero.name,
      aria: rowAria("storehero", hero.id),
      blurb: `PURSE ${formatCoins(characterPurse(hero))} COINS`,
      action: () => {
        playUiSound(synth, "confirm");
        ctx.setStoreHeroId(hero.id);
        ctx.setStoreAmount(0);
        ctx.setScreen("storesend");
        ctx.setCursor(0);
      },
    })),
    ...assembleRows("storehero", {
      none:
        living.length === 0
          ? actionRow("storehero", "none", () => playUiSound(synth, "back"), {
              locked: true,
            })
          : null,
    }),
    backRow(ctx, "storehero"),
  ];
}

export function buildStoreSendMenu(ctx: MenuContext): MenuEntry[] {
  // DISTRIBUTE → hero picked: a slider spans 0 → everything undistributed in
  // 1-million ticks (SEND_TICK), and SEND commits it. The remainder simply
  // stays banked for later.
  const bank = bankBalance();
  const living = ctx.roster.filter((c) => !c.dead);
  const hero = living.find((c) => c.id === ctx.storeHeroId);
  const open = !!hero && bank > 0;
  const heroAt = living.findIndex((c) => c.id === ctx.storeHeroId);
  const amount = Math.min(ctx.storeAmount, bank);
  const setAmount = (next: number) => {
    const ticked = Math.round(next / SEND_TICK) * SEND_TICK;
    ctx.setStoreAmount(Math.min(Math.max(0, ticked), bank));
  };
  return [
    ...assembleRows("storesend", {
      amount:
        open && hero
          ? sliderRow(
              "storesend",
              "amount",
              {
                readout: formatCoins(amount),
                pos: amount / bank,
                set: (pos: number) => setAmount(pos * bank),
                nudge: (dir: number) => setAmount(amount + dir * SEND_TICK),
              },
              {
                help: `TO ${hero.name} - PURSE ${formatCoins(characterPurse(hero))}`,
              },
            )
          : null,
      send:
        open && hero
          ? actionRow(
              "storesend",
              "send",
              () => {
                if (amount <= 0) {
                  playUiSound(synth, "back");
                  return;
                }
                ctx.runSend(hero, amount);
              },
              {
                locked: amount <= 0,
                help:
                  amount > 0
                    ? `${formatCoins(bank - amount)} WILL STAY UNDISTRIBUTED`
                    : undefined,
                state: "empty",
              },
            )
          : null,
      none: open
        ? null
        : actionRow("storesend", "none", () => playUiSound(synth, "back"), {
            locked: true,
          }),
    }),
    backRow(ctx, "storesend", heroAt < 0 ? 0 : heroAt),
  ];
}
