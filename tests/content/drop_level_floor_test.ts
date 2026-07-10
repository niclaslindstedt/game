// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The BASE-LEVEL drop floor (config `LOOT.dropLevelWindow`): a high monster
// level retires the low-tier bases from the pool, so a deep kill drops a base
// whose power matches where you killed it — not a level-1 base with affixes
// sprinkled on. Exercised through the shipped (graded) moon pool.

import { equipmentLevelReq, LOOT, rollEquipment } from "@game/core";
import { describe, expect, it } from "vitest";

import { startGame } from "../helpers.ts";

describe("base-level drop floor", () => {
  it("a high-mlvl kill only drops bases within the level window", () => {
    const state = startGame();
    const mlvl = 50;
    const floor = mlvl - LOOT.dropLevelWindow; // 35
    // Every weapon drawn at this depth sits at/above the floor — no weak
    // low-tier bases off a deep monster.
    for (let i = 0; i < 80; i++) {
      const item = rollEquipment(state, { slot: "weapon", mlvl });
      expect(equipmentLevelReq(item.defId)).toBeGreaterThanOrEqual(floor);
    }
  });

  it("early kills are unfloored — low bases still drop in the opening game", () => {
    const state = startGame();
    // The floor (mlvl − window) is below level 1 here, so nothing is retired
    // and the opening game keeps its full spread of low bases.
    expect(8 - LOOT.dropLevelWindow).toBeLessThan(1);
    let sawLowBase = false;
    for (let i = 0; i < 40; i++) {
      const item = rollEquipment(state, { slot: "weapon", mlvl: 8 });
      if (equipmentLevelReq(item.defId) <= 8) sawLowBase = true;
    }
    expect(sawLowBase).toBe(true);
  });
});
