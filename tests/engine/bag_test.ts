// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The BAG slot: a worn bag widens the carry by its `bagSlots` on top of the
// STRENGTH-scaled floor, stacks with STRENGTH, is grow-only when shed, and is
// what auto-equip fills an empty bag slot (and upgrades) with.

import { describe, expect, it } from "vitest";

import {
  equipFromInventory,
  equippedBagSlots,
  inventoryCapacity,
  isBetterEquipment,
  LOOT,
  STATS,
  unequipToInventory,
  type Equipment,
} from "@game/core";
import { startGame } from "./helpers.ts";

/** Mint a fixture bag instance (`test_bag` = +2 cells, `test_big_bag` = +5). */
function bag(id: number, defId = "test_bag"): Equipment {
  return { id, defId, slot: "bag", tier: "regular", ilvl: 1, affixes: [] };
}

describe("bag slot", () => {
  it("a worn bag adds its slots on top of the base floor", () => {
    const state = startGame();
    expect(state.players[0].equipment.offhand).toBeNull();
    expect(equippedBagSlots(state, state.players[0])).toBe(0);
    expect(inventoryCapacity(state, state.players[0])).toBe(
      LOOT.baseInventorySize,
    );

    // Drop a bag into a cell and equip it: the carry grows by the bag's slots.
    state.players[0].inventory[0] = bag(1);
    expect(equipFromInventory(state, state.players[0], 0)).toBe(true);
    expect(state.players[0].equipment.offhand?.defId).toBe("test_bag");
    expect(equippedBagSlots(state, state.players[0])).toBe(2);
    expect(inventoryCapacity(state, state.players[0])).toBe(
      LOOT.baseInventorySize + 2,
    );
    // The physical bag array grew to match, so the extra cells can hold loot.
    expect(state.players[0].inventory.length).toBe(LOOT.baseInventorySize + 2);
  });

  it("bag slots stack with the STRENGTH-scaled floor", () => {
    const state = startGame();
    state.players[0].stats.strength = 3;
    const strFloor = LOOT.baseInventorySize + 3 * STATS.bagSlotsPerStr;
    state.players[0].inventory[0] = bag(1);
    expect(equipFromInventory(state, state.players[0], 0)).toBe(true);
    expect(inventoryCapacity(state, state.players[0])).toBe(strFloor + 2);
  });

  it("shedding a bag is grow-only — carried loot is never stranded", () => {
    const state = startGame();
    state.players[0].inventory[0] = bag(1);
    equipFromInventory(state, state.players[0], 0);
    const grown = state.players[0].inventory.length;
    expect(grown).toBe(LOOT.baseInventorySize + 2);

    // Unequip the bag back into a cell: capacity requirement drops, but the
    // array keeps its cells (grow-only), so nothing already carried is lost.
    expect(unequipToInventory(state, state.players[0], "offhand")).toBe(true);
    expect(state.players[0].equipment.offhand).toBeNull();
    expect(equippedBagSlots(state, state.players[0])).toBe(0);
    expect(state.players[0].inventory.length).toBe(grown);
  });

  it("auto-equip fills an empty bag slot and upgrades to a roomier bag", () => {
    const state = startGame();
    // Empty slot: any bag is an upgrade.
    expect(isBetterEquipment(state, state.players[0], bag(1))).toBe(true);

    // With a small bag worn, a bigger one wins the slot and the smaller stays.
    state.players[0].inventory[0] = bag(1);
    equipFromInventory(state, state.players[0], 0);
    expect(
      isBetterEquipment(state, state.players[0], bag(2, "test_big_bag")),
    ).toBe(true);
    expect(isBetterEquipment(state, state.players[0], bag(3, "test_bag"))).toBe(
      false,
    );
  });
});
