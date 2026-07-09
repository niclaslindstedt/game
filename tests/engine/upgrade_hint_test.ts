// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// `wouldUpgradeSlot`: the pickup card's "is this an upgrade?" probe. Unlike
// `isBetterEquipment` (the auto-equip rule), it keeps the level gate but drops
// the passive-charm and equal-durability exclusions, so a stronger passive
// still reads as an upgrade the player can act on with a tap.

import { describe, expect, it } from "vitest";

import type { GameState } from "@game/core";
import { wouldUpgradeSlot, type Equipment } from "@game/core";
import { clearStage, idle, run, startGame } from "./helpers.ts";

/** Mint a fixture weapon instance at a chosen tier/ilvl. */
function weapon(id: number, defId: string): Equipment {
  return { id, defId, slot: "weapon", tier: "regular", ilvl: 1, affixes: [] };
}

/** Mint a fixture gear instance in its natural slot. */
function gear(id: number, defId: string, slot: Equipment["slot"]): Equipment {
  return { id, defId, slot, tier: "regular", ilvl: 1, affixes: [] };
}

describe("wouldUpgradeSlot", () => {
  it("flags a stronger weapon as an upgrade over the worn one", () => {
    const state = startGame();
    // The medium starter is `crude_sword` (damage 20); `test_hammer` (34) is a
    // clear firepower upgrade.
    expect(state.player.equipment.weapon.defId).toBe("crude_sword");
    expect(wouldUpgradeSlot(state, weapon(1, "test_hammer"))).toBe(true);
  });

  it("does not flag a weaker weapon as an upgrade", () => {
    const state = startGame();
    // Wear the heavy `test_hammer` (damage 34), then the puny `blaster`
    // (damage 8) is a clear downgrade — no upgrade to tap.
    state.player.equipment.weapon = weapon(1, "test_hammer");
    expect(wouldUpgradeSlot(state, weapon(2, "blaster"))).toBe(false);
  });

  it("flags a passive charm the auto-equip rule leaves in the bag", () => {
    const state = startGame();
    // `test_chip` is a passive trinket: never auto-equipped, so it banks — but
    // with an EMPTY charm slot, wearing it still improves the slot, so the card
    // should still offer it as an upgrade.
    expect(state.player.equipment.charm).toBeNull();
    expect(wouldUpgradeSlot(state, gear(1, "test_chip", "charm"))).toBe(true);
  });

  it("an empty non-weapon slot is always an upgrade to fill", () => {
    const state = startGame();
    expect(state.player.equipment.suit).toBeNull();
    expect(wouldUpgradeSlot(state, gear(1, "test_suit", "suit"))).toBe(true);
  });
});

/** Drop `item` under the hero and step once so `stepItems` picks it up. */
function dropAndPickUp(state: GameState, item: Equipment) {
  clearStage(state);
  state.items.push({
    id: state.nextId++,
    kind: "equipment",
    pos: { ...state.player.pos },
    equipment: item,
  });
  run(state, idle, 1);
  return state.events.find(
    (e) => e.type === "itemCollected" && e.kind === "equipment",
  );
}

describe("itemCollected event — pickup-card fields", () => {
  it("an auto-equipped upgrade is flagged equipped + upgrade with its id", () => {
    const state = startGame();
    const hammer = weapon(4242, "test_hammer"); // damage 34 > starter's 20
    const event = dropAndPickUp(state, hammer);
    expect(event).toMatchObject({
      type: "itemCollected",
      kind: "equipment",
      itemId: 4242,
      equipped: true,
      upgrade: true,
    });
    // It really was worn on the spot.
    expect(state.player.equipment.weapon.id).toBe(4242);
  });

  it("a weaker bagged find is flagged not-equipped, not-upgrade, with its id", () => {
    const state = startGame();
    // Wear the hammer so the puny blaster we drop is a downgrade that banks.
    state.player.equipment.weapon = weapon(1, "test_hammer");
    const blaster = weapon(4343, "blaster"); // damage 8 < hammer's 34
    const event = dropAndPickUp(state, blaster);
    expect(event).toMatchObject({
      type: "itemCollected",
      kind: "equipment",
      itemId: 4343,
      equipped: false,
      upgrade: false,
    });
    // It banked; the hammer still holds the weapon slot.
    expect(state.player.equipment.weapon.id).toBe(1);
    expect(state.player.inventory.some((it) => it?.id === 4343)).toBe(true);
  });

  it("a passive charm banks but is still flagged an upgrade to tap", () => {
    const state = startGame();
    // A passive trinket is never auto-equipped, so it banks — yet with an empty
    // charm slot it IS an upgrade, so the card offers a tap-to-equip.
    const chip = gear(4444, "test_chip", "charm");
    const event = dropAndPickUp(state, chip);
    expect(event).toMatchObject({
      type: "itemCollected",
      kind: "equipment",
      itemId: 4444,
      equipped: false,
      upgrade: true,
    });
    expect(state.player.equipment.charm).toBeNull();
    expect(state.player.inventory.some((it) => it?.id === 4444)).toBe(true);
  });
});
