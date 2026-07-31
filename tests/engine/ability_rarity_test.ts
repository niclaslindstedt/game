// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// POWERUP RARITY (`AbilityDef.rarity`): the weighted pick every powerup channel
// draws through, and the stall markup that keeps coins from buying past it. A
// pool is a FLAT list of ids and the powers in it are not equal — the weight is
// how a catalog says "this one is a moment, not a resource".

import { beforeEach, describe, expect, it } from "vitest";

import {
  ABILITY_DEFAULT_RARITY,
  abilityDef,
  abilityRarity,
  buyStock,
  ECONOMY,
  openShop,
  pickAbility,
  registerDefs,
  type AbilityDef,
} from "@game/core";

import { FIX_ABILITIES, installFixtures } from "./fixtures.ts";
import { clearStage, idle, run, startGame } from "./helpers.ts";

/** Re-register the fixture ability catalog with `rarity` weights patched onto
 * the named entries — the only thing these tests vary. */
function withRarities(weights: Record<string, number>): void {
  const abilities: Record<string, AbilityDef> = {};
  for (const [id, def] of Object.entries(FIX_ABILITIES)) {
    const rarity = weights[id];
    abilities[id] = rarity === undefined ? def : { ...def, rarity };
  }
  registerDefs({ abilities });
}

beforeEach(() => {
  // Force a re-install: these suites swap the ability catalog out from under
  // the shared fixtures, so every case starts from the shipped fixture set.
  installFixtures(true);
});

describe("abilityRarity", () => {
  it("an un-annotated power carries the default weight", () => {
    expect(abilityDef("test_storm").rarity).toBeUndefined();
    expect(abilityRarity("test_storm")).toBe(ABILITY_DEFAULT_RARITY);
  });

  it("reads an authored weight, and never a negative one", () => {
    withRarities({ test_storm: 25, test_orbit: -5 });
    expect(abilityRarity("test_storm")).toBe(25);
    // A nonsense weight clamps to zero rather than inverting the draw.
    expect(abilityRarity("test_orbit")).toBe(0);
  });
});

describe("pickAbility", () => {
  const POOL = ["test_orbit", "test_storm"];

  it("picks uniformly when every weight is the default", () => {
    // Two equal weights halve the [0,1) roll space exactly.
    expect(pickAbility(POOL, 0)).toBe("test_orbit");
    expect(pickAbility(POOL, 0.49)).toBe("test_orbit");
    expect(pickAbility(POOL, 0.5)).toBe("test_storm");
    expect(pickAbility(POOL, 0.999)).toBe("test_storm");
  });

  it("splits the roll space in proportion to the weights", () => {
    // 100 : 25 — the rare power owns the top fifth of the space, so it turns
    // up a quarter as often as its shelfmate.
    withRarities({ test_storm: 25 });
    expect(pickAbility(POOL, 0.79)).toBe("test_orbit");
    expect(pickAbility(POOL, 0.81)).toBe("test_storm");
    let rare = 0;
    const draws = 10_000;
    for (let i = 0; i < draws; i++) {
      if (pickAbility(POOL, (i + 0.5) / draws) === "test_storm") rare++;
    }
    expect(rare / draws).toBeCloseTo(0.2, 2);
  });

  it("never returns a zero-weight power", () => {
    withRarities({ test_storm: 0 });
    for (let i = 0; i < 100; i++) {
      expect(pickAbility(POOL, i / 100)).toBe("test_orbit");
    }
    // A roll of exactly 1 (float drift on the last step) still resolves.
    expect(pickAbility(POOL, 1)).toBe("test_orbit");
  });

  it("answers null for an empty pool, and for an all-zero one", () => {
    expect(pickAbility([], 0.5)).toBeNull();
    withRarities({ test_orbit: 0, test_storm: 0 });
    expect(pickAbility(POOL, 0.5)).toBeNull();
  });
});

describe("the stall's rarity markup", () => {
  /** Walk the hero up to the merchant so the stall rolls, then open the shop. */
  function trade(seed: number) {
    const state = startGame(seed);
    clearStage(state);
    state.obstacles = [];
    state.players[0].pos = {
      x: state.merchant.pos.x + 20,
      y: state.merchant.pos.y,
    };
    run(state, idle, 1);
    openShop(state);
    return state;
  }

  it("prices a rare power above an ordinary one, capped", () => {
    // A quarter-weight power costs four times the base; one rarer than the cap
    // allows is held at the cap, so no power is priced out of reach by
    // arithmetic alone.
    withRarities({ test_storm: ABILITY_DEFAULT_RARITY / 4, test_stasis: 1 });
    const state = trade(42);
    const base =
      ECONOMY.abilityBase + ECONOMY.abilityPerLevel * state.players[0].level;
    let seen = 0;
    for (const entry of state.merchant.stock) {
      if (entry.kind !== "ability") continue;
      seen++;
      const expected =
        entry.defId === "test_storm"
          ? base * 4
          : entry.defId === "test_stasis"
            ? base * ECONOMY.abilityRarityMarkupCap
            : base;
      expect(entry.price).toBe(Math.round(expected));
    }
    expect(seen).toBeGreaterThan(0);
  });

  it("a powerup slot is one unit — the counter never restocks it", () => {
    const state = trade(42);
    const entry = state.merchant.stock.find((s) => s.kind === "ability")!;
    expect(entry.qty).toBe(1);
    state.players[0].coins = entry.price * 10;
    expect(buyStock(state, entry.id)).toBe(true);
    expect(buyStock(state, entry.id)).toBe(false);
    expect(state.players[0].coins).toBe(entry.price * 9);
  });
});
