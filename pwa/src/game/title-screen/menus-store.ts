// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The COIN STORE screens: the pack list, the BUY confirmation, and the
// DISTRIBUTE flow (pick a hero, slide an amount out of the undistributed
// bank). The purchase/send plumbing lives in use-coin-store.ts — these
// builders only lay out the rows.

import { formatCompact } from "@ui/lib/format-number.ts";

import { synth } from "../audio.ts";
import { characterPurse } from "../characters.ts";
import { playUiSound } from "../sfx/index.ts";
import { bankBalance, COIN_PACKS, SEND_TICK } from "../store.ts";
import { backTo, type MenuContext, type MenuEntry } from "./menu-model.ts";

export function buildStoreMenu(ctx: MenuContext): MenuEntry[] {
  // The COIN STORE: real-money coin packs that fund the AUTO PILOT (the
  // purse drains per simulated second — see src/game/autopilot.ts). A
  // tapped pack goes straight to the platform pay sheet (the OS confirms
  // the charge); the coins land in the UNDISTRIBUTED bank, and the
  // DISTRIBUTE row below hands them out. The platform's localized price
  // tag sits right-aligned like a settings value.
  const bank = bankBalance();
  return [
    ...COIN_PACKS.map((pack): MenuEntry => ({
      label: `${pack.amount} COINS`,
      aria: `store-${pack.sku}`,
      value: ctx.storePrices?.[pack.sku] ?? pack.price,
      // A tap never buys straight away — it opens a confirmation screen so
      // an accidental press can't spend money (or, in free builds, bank
      // coins) on its own. The purchase runs only from CONFIRM there.
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
    {
      label: "DISTRIBUTE",
      aria: "store-distribute",
      blurb:
        bank > 0
          ? `${formatCompact(bank)} COINS UNDISTRIBUTED - SEND THEM TO YOUR HEROES`
          : "NOTHING UNDISTRIBUTED",
      locked: bank <= 0,
      action: () => {
        if (bank <= 0) {
          playUiSound(synth, "back");
          return;
        }
        playUiSound(synth, "confirm");
        ctx.setScreen("storehero");
        ctx.setCursor(0);
      },
    },
    // Land back on the STORE row — the last main-menu row.
    backTo(ctx, "main", ctx.hasResume ? 6 : 5),
  ];
}

export function buildStoreConfirmMenu(ctx: MenuContext): MenuEntry[] {
  // BUY confirmation: a tapped pack pauses here before anything is spent,
  // so a mis-tap on a coin row can't charge the player (or, in a free
  // build, bank coins) by itself. CONFIRM runs the purchase; BACK bails.
  const pack = COIN_PACKS.find((p) => p.sku === ctx.storePackSku);
  const packIndex = COIN_PACKS.findIndex((p) => p.sku === ctx.storePackSku);
  if (!pack) {
    // Nothing pending (shouldn't happen) — step back to the store list.
    return [backTo(ctx, "store", 0)];
  }
  const priceTag = ctx.storePrices?.[pack.sku] ?? pack.price;
  const isFree = priceTag.trim().toUpperCase() === "FREE";
  return [
    {
      label: `BUY ${pack.amount}`,
      aria: "store-confirm-buy",
      value: priceTag,
      // FREE grants need no blurb — the row's FREE value tag already says
      // it all, and the long restatement wrapped to two lines in portrait.
      // Paid buys keep a short charge confirmation (the price shows as the
      // value tag), so the player still sees they're about to be charged.
      blurb: isFree ? undefined : "CHARGED VIA THE STORE",
      action: () => {
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
    },
    {
      label: "CANCEL",
      aria: "store-confirm-cancel",
      action: () => {
        playUiSound(synth, "back");
        ctx.setScreen("store");
        ctx.setCursor(packIndex < 0 ? 0 : packIndex);
      },
    },
  ];
}

export function buildStoreHeroMenu(ctx: MenuContext): MenuEntry[] {
  // DISTRIBUTE → choose which hero receives coins. Every living hero is
  // offered with their current purse; the fallen keep their graves
  // (coins can't help them).
  const living = ctx.roster.filter((c) => !c.dead);
  if (living.length === 0) {
    return [
      {
        label: "NO HEROES YET",
        aria: "store-hero-empty",
        blurb: "CREATE A HERO FROM PLAY - NEW GAME FIRST",
        locked: true,
        action: () => playUiSound(synth, "back"),
      },
      backTo(ctx, "store", COIN_PACKS.length),
    ];
  }
  return [
    ...living.map((hero): MenuEntry => ({
      label: hero.name,
      aria: `store-hero-${hero.id}`,
      blurb: `PURSE ${formatCompact(characterPurse(hero))} COINS`,
      action: () => {
        playUiSound(synth, "confirm");
        ctx.setStoreHeroId(hero.id);
        ctx.setStoreAmount(0);
        ctx.setScreen("storesend");
        ctx.setCursor(0);
      },
    })),
    backTo(ctx, "store", COIN_PACKS.length),
  ];
}

export function buildStoreSendMenu(ctx: MenuContext): MenuEntry[] {
  // DISTRIBUTE → hero picked: a slider spans 0 → everything
  // undistributed in 1-million ticks (SEND_TICK), and SEND commits it.
  // The remainder simply stays banked for later.
  const bank = bankBalance();
  const living = ctx.roster.filter((c) => !c.dead);
  const hero = living.find((c) => c.id === ctx.storeHeroId);
  if (!hero || bank <= 0) {
    return [
      {
        label: "NOTHING TO DISTRIBUTE",
        aria: "store-send-empty",
        locked: true,
        action: () => playUiSound(synth, "back"),
      },
      backTo(ctx, "store", COIN_PACKS.length),
    ];
  }
  const heroAt = living.findIndex((c) => c.id === hero.id);
  const amount = Math.min(ctx.storeAmount, bank);
  const setAmount = (next: number) => {
    const ticked = Math.round(next / SEND_TICK) * SEND_TICK;
    ctx.setStoreAmount(Math.min(Math.max(0, ticked), bank));
  };
  return [
    {
      label: `SEND ${formatCompact(amount)}`,
      aria: "store-send-amount",
      blurb: `TO ${hero.name} - PURSE ${formatCompact(characterPurse(hero))}`,
      // The row itself does nothing on confirm; the slider owns the value.
      action: () => {},
      slider: {
        pos: amount / bank,
        set: (pos: number) => setAmount(pos * bank),
        nudge: (dir: number) => setAmount(amount + dir * SEND_TICK),
      },
    },
    {
      label: "SEND",
      aria: "store-send-confirm",
      locked: amount <= 0,
      blurb:
        amount > 0
          ? `${formatCompact(bank - amount)} WILL STAY UNDISTRIBUTED`
          : "SLIDE TO PICK AN AMOUNT",
      action: () => {
        if (amount <= 0) {
          playUiSound(synth, "back");
          return;
        }
        ctx.runSend(hero, amount);
      },
    },
    backTo(ctx, "storehero", heroAt),
  ];
}
