// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Merchant-stall uniques (LevelDef.merchant.stockUniques): a level's trader
// MAY carry named uniques, each rolled at the standing boss-unique odds when
// the stall stocks (UNIQUE.dropChance × playerLevel/ilvl, capped) — the same
// rarity as a unique drop, landing on the counter instead of a corpse, and
// priced at sell value × the vendor markup. Runs on the synthetic fixtures
// (test_stall_level's relic).

import { describe, expect, it } from "vitest";

import { buyStock, ECONOMY, openShop, sellValue, step } from "@game/core";
import type { GameState, MerchantStock } from "@game/core";

import { idle, startGame } from "./helpers.ts";

/** Walk the merchant onto the hero and let the meeting stock the stall. */
function discover(state: GameState): void {
  state.merchant.pos = {
    x: state.player.pos.x + 30,
    y: state.player.pos.y,
  };
  step(state, idle, 16);
}

/** The stall's relic entry, if this seed's roll stocked it. */
function stalledRelic(state: GameState): MerchantStock | undefined {
  return state.merchant.stock.find(
    (s) => s.kind === "weapon" && s.equipment.uniqueId === "test_relic",
  );
}

describe("merchant stall uniques (stockUniques)", () => {
  it("rolls the relic into stock at unique odds — sometimes there, never always", () => {
    let stocked = 0;
    const seeds = 60;
    for (let seed = 1; seed <= seeds; seed++) {
      const state = startGame(seed, "test_stall_level");
      // The relic's ilvl is 1, so a leveled hero caps the roll at
      // UNIQUE.dropChanceCap (10%) — high enough to observe across seeds.
      state.player.level = 50;
      discover(state);
      expect(state.merchant.discovered).toBe(true);
      if (stalledRelic(state)) stocked++;
    }
    // A rolled chance, not a pledge: present on some stalls, absent on most.
    expect(stocked).toBeGreaterThan(0);
    expect(stocked).toBeLessThan(seeds);
  });

  it("prices a stocked relic at its sell value times the vendor markup, and sells it once", () => {
    // Find a seed whose roll stocks the relic, then exercise the purchase.
    for (let seed = 1; seed <= 200; seed++) {
      const state = startGame(seed, "test_stall_level");
      state.player.level = 50;
      discover(state);
      const entry = stalledRelic(state);
      if (!entry || entry.kind !== "weapon") continue;
      expect(entry.price).toBe(
        sellValue(entry.equipment) * ECONOMY.weaponBuyMarkup,
      );
      expect(entry.equipment.tier).toBe("unique");
      expect(entry.equipment.name).toBe("TEST RELIC");
      // Rich enough to buy it: the one-off purchase latches `sold`.
      state.player.coins = entry.price;
      // The dialogue-free fixture merchant leaves the run playing; walk up
      // and trade.
      state.player.pos = { ...state.merchant.pos };
      expect(openShop(state)).toBe(true);
      expect(buyStock(state, entry.id)).toBe(true);
      expect(entry.sold).toBe(true);
      expect(state.player.coins).toBe(0);
      expect(
        state.player.inventory.some((i) => i?.uniqueId === "test_relic"),
      ).toBe(true);
      return;
    }
    throw new Error("no seed in 1..200 stocked the relic — odds broken?");
  });

  it("levels without stockUniques never stock one", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const state = startGame(seed, "test_merchant_level");
      state.player.level = 50;
      discover(state);
      expect(stalledRelic(state)).toBeUndefined();
    }
  });
});
