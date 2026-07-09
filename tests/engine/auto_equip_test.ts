// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The auto-equip sweep (autoEquipBest): wear the best wearable piece the bag
// can offer in every slot at once. Weapons rank by the build-aware weaponScore
// (the hero's stats pick melee/ranged vs magic), gear by gearScore (armor, HP,
// crit, stat affixes). Displaced pieces swap back into the bag — nothing is
// destroyed. Under-leveled finds and passive trinkets are left alone. Runs on
// synthetic fixtures so it survives content churn.

import { describe, expect, it } from "vitest";

import { autoEquipBest, autoEquipUpgradeCount } from "@game/core";
import type { Equipment, GameState, Tier } from "@game/core";

import { startGame } from "./helpers.ts";

let nextId = 2000;

function weapon(defId: string, tier: Tier = "regular"): Equipment {
  return { id: nextId++, defId, slot: "weapon", tier, ilvl: 1, affixes: [] };
}

function gear(
  defId: string,
  slot: "head" | "chest" | "legs" | "feet" | "charm" | "bag",
  tier: Tier = "regular",
): Equipment {
  return { id: nextId++, defId, slot, tier, ilvl: 1, affixes: [] };
}

/** Fill the bag with exactly these pieces (padding the rest with empty cells).
 * Grows the bag past its small base floor when a test stocks more than fits. */
function stock(state: GameState, items: Equipment[]): void {
  const inv = state.player.inventory;
  while (inv.length < items.length) inv.push(null);
  for (let i = 0; i < inv.length; i++) inv[i] = items[i] ?? null;
}

/** The ids still loose in the bag, in cell order. */
function bagIds(state: GameState): number[] {
  return state.player.inventory
    .filter((i): i is Equipment => i !== null)
    .map((i) => i.id);
}

/** Strip every gear slot bare so a test starts from a known empty wardrobe. */
function bareGear(state: GameState): void {
  const eq = state.player.equipment;
  eq.head = eq.chest = eq.legs = eq.feet = eq.charm = eq.bag = null;
}

describe("autoEquipBest", () => {
  it("equips a stronger bag weapon and banks the old one", () => {
    const state = startGame();
    state.player.equipment.weapon = weapon("crude_sword"); // dmg 20
    const upgrade = weapon("test_hammer"); // dmg 34 → out-scores
    stock(state, [upgrade]);

    expect(autoEquipBest(state)).toBe(1);
    expect(state.player.equipment.weapon.id).toBe(upgrade.id);
    // The displaced sword lands in the freed cell, not the void.
    expect(bagIds(state)).toContain(state.player.inventory[0]?.id);
    expect(state.player.inventory.some((i) => i?.defId === "crude_sword")).toBe(
      true,
    );
  });

  it("leaves a weaker bag weapon banked", () => {
    const state = startGame();
    state.player.equipment.weapon = weapon("test_wrench"); // dmg 22, fast
    const junk = weapon("test_pistol");
    stock(state, [junk]);

    expect(autoEquipBest(state)).toBe(0);
    expect(state.player.equipment.weapon.defId).toBe("test_wrench");
    expect(bagIds(state)).toEqual([junk.id]);
  });

  it("fills empty gear slots from the bag", () => {
    const state = startGame();
    bareGear(state);
    const charm = gear("test_charm", "charm");
    stock(state, [charm]);

    expect(autoEquipBest(state)).toBe(1);
    expect(state.player.equipment.charm?.id).toBe(charm.id);
    expect(bagIds(state)).toEqual([]);
  });

  it("swaps a better gear piece in and the worn one back to the bag", () => {
    const state = startGame();
    state.player.equipment.bag = gear("test_bag", "bag"); // 2 cells → score 20
    const roomier = gear("test_big_bag", "bag"); // 5 cells → score 50
    stock(state, [roomier]);

    expect(autoEquipBest(state)).toBe(1);
    expect(state.player.equipment.bag?.id).toBe(roomier.id);
    expect(state.player.inventory.some((i) => i?.defId === "test_bag")).toBe(
      true,
    );
  });

  it("never wears a passive trinket — it pays out from the bag", () => {
    const state = startGame();
    bareGear(state);
    const trinket = gear("test_chip", "charm"); // +1 INT while carried
    stock(state, [trinket]);

    expect(autoEquipBest(state)).toBe(0);
    expect(state.player.equipment.charm).toBeNull();
    expect(bagIds(state)).toEqual([trinket.id]);
  });

  it("skips a find the hero has not grown into", () => {
    const state = startGame();
    state.player.equipment.weapon = weapon("crude_sword");
    // A hammer that would out-score the sword, but the hero is under its gate.
    state.player.level = 0;
    const gated = weapon("test_hammer");
    stock(state, [gated]);

    expect(autoEquipBest(state)).toBe(0);
    expect(state.player.equipment.weapon.defId).toBe("crude_sword");
    expect(bagIds(state)).toEqual([gated.id]);
  });

  it("optimizes weapon and every armor slot in one sweep", () => {
    const state = startGame();
    state.player.equipment.weapon = weapon("crude_sword");
    bareGear(state);
    const pieces = [
      weapon("test_hammer"),
      gear("test_helmet", "head"),
      gear("test_vest", "chest"),
      gear("test_greaves", "legs"),
      gear("test_boots", "feet"),
    ];
    stock(state, pieces);

    expect(autoEquipBest(state)).toBe(5);
    expect(state.player.equipment.weapon.defId).toBe("test_hammer");
    expect(state.player.equipment.head?.defId).toBe("test_helmet");
    expect(state.player.equipment.chest?.defId).toBe("test_vest");
    expect(state.player.equipment.legs?.defId).toBe("test_greaves");
    expect(state.player.equipment.feet?.defId).toBe("test_boots");
  });

  it("is a no-op on an already-optimal loadout", () => {
    const state = startGame();
    state.player.equipment.weapon = weapon("test_hammer");
    const worse = weapon("test_pistol");
    stock(state, [worse]);

    expect(autoEquipUpgradeCount(state)).toBe(0);
    expect(autoEquipBest(state)).toBe(0);
    expect(bagIds(state)).toEqual([worse.id]);
  });

  it("picks the weapon that suits the build: melee for a STRENGTH hero", () => {
    const state = startGame();
    state.player.stats.strength = 50;
    state.player.stats.intelligence = 1;
    state.player.equipment.weapon = weapon("blaster"); // weak fallback sidearm
    stock(state, [weapon("test_hammer"), weapon("test_wand")]);

    autoEquipBest(state);
    // STRENGTH pumps the melee hammer far past the INT-hungry wand.
    expect(state.player.equipment.weapon.defId).toBe("test_hammer");
  });

  it("picks the weapon that suits the build: magic for an INTELLECT hero", () => {
    const state = startGame();
    state.player.stats.strength = 1;
    state.player.stats.intelligence = 50;
    state.player.equipment.weapon = weapon("blaster");
    stock(state, [weapon("test_hammer"), weapon("test_wand")]);

    autoEquipBest(state);
    // INTELLIGENCE scales the wand's damage AND cadence, so magic wins the slot.
    expect(state.player.equipment.weapon.defId).toBe("test_wand");
  });

  it("autoEquipUpgradeCount matches the sweep it predicts", () => {
    const state = startGame();
    state.player.equipment.weapon = weapon("crude_sword");
    bareGear(state);
    stock(state, [weapon("test_hammer"), gear("test_vest", "chest")]);

    const predicted = autoEquipUpgradeCount(state);
    expect(predicted).toBe(2);
    expect(autoEquipBest(state)).toBe(predicted);
  });
});
