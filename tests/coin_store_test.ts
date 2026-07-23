// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The COIN STORE's money-safety rules: a purchased pack lands in the
// device-wide UNDISTRIBUTED bank exactly once (redelivery dedupes on the
// ledger), the DISTRIBUTE flow moves chosen amounts onto chosen heroes with
// the remainder staying banked, a hero with no banked loadout holds sent
// coins as `pendingCoins` until their first bank folds them into the purse,
// and the pack catalog itself stays the shipped shape (5 packs,
// coins ↔ sku ↔ price). See pwa/src/game/store.ts and characters.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Loadout } from "../src/index.ts";
import {
  bankLoadout,
  characterPurse,
  createCharacter,
  creditCoins,
  loadCharacters,
  recordVictory,
} from "../pwa/src/game/characters.ts";
import {
  bankBalance,
  buyCoinPack,
  COIN_PACKS,
  coinStoreAvailable,
  creditPurchase,
  fetchCoinPrices,
  sendCoins,
  setStoreForced,
} from "../pwa/src/game/store.ts";

// characters.ts persists through window.localStorage (best-effort, lazily
// inside each function), so a Map-backed stub is all the node run needs.
const stored = new Map<string, string>();
beforeEach(() => {
  stored.clear();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => void stored.set(key, value),
      removeItem: (key: string) => void stored.delete(key),
    },
  });
});
afterEach(() => {
  setStoreForced(false);
  vi.unstubAllGlobals();
});

function sampleLoadout(coins: number): Loadout {
  return {
    level: 3,
    xp: 100,
    stats: { power: 1, agility: 1, vitality: 1, focus: 1 },
    equipment: {
      weapon: {
        id: 0,
        defId: "blaster",
        slot: "weapon",
        tier: "regular",
        ilvl: 1,
        affixes: [],
      },
      head: null,
      chest: null,
      legs: null,
      feet: null,
      charm: null,
      bag: null,
    },
    inventory: [],
    heldAbilities: [],
    coins,
    companions: [],
  } as unknown as Loadout;
}

describe("coin store crediting", () => {
  it("credits a banked hero's purse directly", () => {
    const hero = createCharacter("ADA", false);
    bankLoadout(hero, sampleLoadout(50));

    expect(creditCoins(hero.id, 1_000_000)).toBe(true);

    const stored = loadCharacters().find((c) => c.id === hero.id)!;
    expect(stored.loadout?.coins).toBe(1_000_050);
    expect(stored.pendingCoins).toBeUndefined();
    expect(characterPurse(stored)).toBe(1_000_050);
  });

  it("holds coins for a bankless hero and folds them into the first bank", () => {
    const hero = createCharacter("BOB", false);

    expect(creditCoins(hero.id, 10_000_000)).toBe(true);
    let stored = loadCharacters().find((c) => c.id === hero.id)!;
    expect(stored.loadout).toBeNull();
    expect(stored.pendingCoins).toBe(10_000_000);
    expect(characterPurse(stored)).toBe(10_000_000);

    // A second purchase before the first bank stacks.
    expect(creditCoins(hero.id, 1_000_000)).toBe(true);
    stored = loadCharacters().find((c) => c.id === hero.id)!;
    expect(stored.pendingCoins).toBe(11_000_000);

    // The first bank (here a victory) folds the credit into the purse.
    recordVictory(stored, "landing", "easy", sampleLoadout(25));
    stored = loadCharacters().find((c) => c.id === hero.id)!;
    expect(stored.loadout?.coins).toBe(11_000_025);
    expect(stored.pendingCoins).toBeUndefined();
    expect(characterPurse(stored)).toBe(11_000_025);
  });

  it("also folds pending coins on a softcore death bank", () => {
    const hero = createCharacter("EVE", false);
    creditCoins(hero.id, 500);
    const withPending = loadCharacters().find((c) => c.id === hero.id)!;

    bankLoadout(withPending, sampleLoadout(0));

    const stored = loadCharacters().find((c) => c.id === hero.id)!;
    expect(stored.loadout?.coins).toBe(500);
    expect(stored.pendingCoins).toBeUndefined();
  });

  it("refuses an unknown hero or a non-positive amount", () => {
    const hero = createCharacter("MAL", false);
    expect(creditCoins("no-such-id", 1_000_000)).toBe(false);
    expect(creditCoins(hero.id, 0)).toBe(false);
    expect(creditCoins(hero.id, -5)).toBe(false);
    expect(characterPurse(loadCharacters()[0]!)).toBe(0);
  });
});

describe("coin store bank", () => {
  it("banks a purchase once — redelivery is acked but never re-credited", () => {
    expect(bankBalance()).toBe(0);
    expect(creditPurchase("coins_10m", "txn-1")).toBe(true);
    expect(bankBalance()).toBe(10_000_000);
    // The native side redelivers unfinished transactions; same key, no
    // second credit, still acked so the transaction can finish.
    expect(creditPurchase("coins_10m", "txn-1")).toBe(true);
    expect(bankBalance()).toBe(10_000_000);
    // A different transaction stacks.
    expect(creditPurchase("coins_1m", "txn-2")).toBe(true);
    expect(bankBalance()).toBe(11_000_000);
  });

  it("refuses an unknown sku and leaves the transaction unfinished", () => {
    expect(creditPurchase("coins_999x", "txn-1")).toBe(false);
    expect(bankBalance()).toBe(0);
  });

  it("distributes chosen amounts and keeps the remainder banked", () => {
    const ada = createCharacter("ADA", false);
    bankLoadout(ada, sampleLoadout(50));
    creditPurchase("coins_100m", "txn-1");

    expect(sendCoins(ada.id, 30_000_000)).toBe(30_000_000);
    expect(bankBalance()).toBe(70_000_000);
    let stored = loadCharacters().find((c) => c.id === ada.id)!;
    expect(stored.loadout?.coins).toBe(30_000_050);

    // A second helping later, to the same hero.
    expect(sendCoins(ada.id, 20_000_000)).toBe(20_000_000);
    expect(bankBalance()).toBe(50_000_000);
    stored = loadCharacters().find((c) => c.id === ada.id)!;
    expect(stored.loadout?.coins).toBe(50_000_050);
  });

  it("clamps a send to what the bank holds", () => {
    const ada = createCharacter("ADA", false);
    bankLoadout(ada, sampleLoadout(0));
    creditPurchase("coins_1m", "txn-1");

    expect(sendCoins(ada.id, 5_000_000)).toBe(1_000_000);
    expect(bankBalance()).toBe(0);
    // Nothing left — a further send moves nothing.
    expect(sendCoins(ada.id, 1_000_000)).toBe(0);
  });

  it("leaves the bank untouched when the hero is gone", () => {
    creditPurchase("coins_1m", "txn-1");
    expect(sendCoins("no-such-id", 1_000_000)).toBe(0);
    expect(bankBalance()).toBe(1_000_000);
  });

  it("sends to a bankless hero as pendingCoins", () => {
    const bob = createCharacter("BOB", false);
    creditPurchase("coins_10m", "txn-1");

    expect(sendCoins(bob.id, 4_000_000)).toBe(4_000_000);
    const stored = loadCharacters().find((c) => c.id === bob.id)!;
    expect(stored.pendingCoins).toBe(4_000_000);
    expect(bankBalance()).toBe(6_000_000);
  });
});

describe("forced (free) store", () => {
  it("stays hidden and unavailable without the native shell or the flag", async () => {
    expect(coinStoreAvailable()).toBe(false);
    expect(await buyCoinPack(COIN_PACKS[0]!)).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(bankBalance()).toBe(0);
  });

  it("surfaces via FORCE STORE and grants packs free into the bank", async () => {
    setStoreForced(true);
    expect(coinStoreAvailable()).toBe(true);

    expect(await buyCoinPack(COIN_PACKS[1]!)).toEqual({ ok: true });
    expect(bankBalance()).toBe(10_000_000);
    // Each grant is a fresh ledgered transaction — buying twice stacks.
    expect(await buyCoinPack(COIN_PACKS[1]!)).toEqual({ ok: true });
    expect(bankBalance()).toBe(20_000_000);
  });

  it("price-tags every pack FREE when forced without a store", async () => {
    setStoreForced(true);
    const prices = await fetchCoinPrices();
    expect(prices).toEqual(
      Object.fromEntries(COIN_PACKS.map((p) => [p.sku, "FREE"])),
    );
  });
});

describe("coin pack catalog", () => {
  it("ships the five packs at the shipped prices", () => {
    expect(COIN_PACKS.map((p) => [p.sku, p.coins, p.price])).toEqual([
      ["coins_1m", 1_000_000, "$1"],
      ["coins_10m", 10_000_000, "$2"],
      ["coins_100m", 100_000_000, "$10"],
      ["coins_1b", 1_000_000_000, "$20"],
      ["coins_10b", 10_000_000_000, "$100"],
    ]);
  });

  it("keeps skus unique (they are store product ids)", () => {
    const skus = COIN_PACKS.map((p) => p.sku);
    expect(new Set(skus).size).toBe(skus.length);
  });
});
