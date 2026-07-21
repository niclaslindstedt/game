// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The COIN STORE's money-safety rules on the character side: a purchased pack
// credits ONE chosen hero, a hero with no banked loadout holds the coins as
// `pendingCoins` until their first bank folds them into the purse, and the
// pack catalog itself stays the shipped shape (5 packs, coins ↔ sku ↔ price).
// See website/src/game/store.ts and website/src/game/characters.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Loadout } from "../src/index.ts";
import {
  bankLoadout,
  characterPurse,
  createCharacter,
  creditCoins,
  loadCharacters,
  recordVictory,
} from "../website/src/game/characters.ts";
import { COIN_PACKS } from "../website/src/game/store.ts";

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
