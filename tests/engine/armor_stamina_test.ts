// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Armor and stamina rules: a plated suit soaks its grade's share of every
// physical hit from a pool that fills on equip and drains under fire; the
// sprint pool drains while running, refills while idle, and caps the top
// speed once empty. Engine rules — run against the synthetic fixtures
// (test_suit carries a yellow armor grade; test_brute hits for 20).

import { describe, expect, it } from "vitest";

import {
  ARMOR,
  STAMINA,
  armorInfo,
  equipFromInventory,
  step,
  unequipToInventory,
  type Equipment,
} from "@game/core";

import { DT, idle, makeEnemy, run, startGame, steerTo } from "./helpers.ts";

function fixtureSuit(id = 77): Equipment {
  return { id, defId: "test_suit", slot: "suit", tier: "regular", affixes: [] };
}

describe("armor", () => {
  it("fills its grade's pool on equip and strips it on unequip", () => {
    const state = startGame();
    expect(state.player.armor).toBe(0); // bare hero, no plating
    expect(armorInfo(state)).toBeNull();

    state.player.inventory[0] = fixtureSuit();
    expect(equipFromInventory(state, 0)).toBe(true);
    expect(armorInfo(state)?.grade).toBe("yellow");
    expect(state.player.armor).toBe(ARMOR.yellow.amount);

    expect(unequipToInventory(state, "suit")).toBe(true);
    expect(state.player.armor).toBe(0);
    expect(armorInfo(state)).toBeNull();
  });

  it("soaks its grade's share of a hit, the rest bites HP", () => {
    const state = startGame();
    // A big LUCK pool zeroes the enemy's crit chance, so the hit is exactly
    // the brute's contact damage (20) with no doubling. Pin the RNG high so
    // the hero's dodge (which LUCK also feeds) can't swallow the blow.
    state.player.stats.luck = 100;
    state.rng = () => 0.99;
    state.player.inventory[0] = fixtureSuit();
    equipFromInventory(state, 0); // yellow: 150 pool, soaks 50%
    const maxHp = state.player.maxHp;

    // One stationary brute on top of the player: 20 contact damage.
    state.enemies = [
      makeEnemy(
        { pos: { ...state.player.pos }, contactCooldownMs: 0 },
        "test_brute",
      ),
    ];
    step(state, idle, DT);

    // 50% of 20 = 10 off the armor, 10 into HP.
    expect(state.player.armor).toBe(ARMOR.yellow.amount - 10);
    expect(state.player.hp).toBe(maxHp - 10);
  });

  it("a bare hero takes the whole blow in HP", () => {
    const state = startGame();
    state.player.stats.luck = 100;
    state.rng = () => 0.99; // pin dodge (and crit) off, like above
    const maxHp = state.player.maxHp;
    state.enemies = [
      makeEnemy(
        { pos: { ...state.player.pos }, contactCooldownMs: 0 },
        "test_brute",
      ),
    ];
    step(state, idle, DT);
    expect(state.player.armor).toBe(0);
    expect(state.player.hp).toBe(maxHp - 20);
  });
});

describe("stamina", () => {
  it("drains under a sustained run and refills while idle", () => {
    const state = startGame();
    state.obstacles = []; // a clear lane so the run never stalls on a rock
    expect(state.player.stamina).toBe(state.player.maxStamina);

    run(state, steerTo(5000, 5000), 600);
    expect(state.player.stamina).toBe(0);

    run(state, idle, 600);
    expect(state.player.stamina).toBeGreaterThan(0);
  });

  it("halves the top speed once the pool is empty", () => {
    const state = startGame();
    state.obstacles = [];
    const target = steerTo(5000, 5000);

    // A full-pool step covers the full stride (one step barely dents stamina).
    state.player.stamina = state.player.maxStamina;
    const fullBefore = { ...state.player.pos };
    step(state, target, DT);
    const full = Math.hypot(
      state.player.pos.x - fullBefore.x,
      state.player.pos.y - fullBefore.y,
    );

    // An empty pool covers only its winded fraction of the same stride.
    state.player.stamina = 0;
    const emptyBefore = { ...state.player.pos };
    step(state, target, DT);
    const empty = Math.hypot(
      state.player.pos.x - emptyBefore.x,
      state.player.pos.y - emptyBefore.y,
    );

    expect(empty).toBeCloseTo(full * STAMINA.emptySpeedFactor, 2);
  });
});
