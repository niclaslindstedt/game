// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SECOND ARM (`EquipSlot.offhand`) and the TWO-HANDED rule.
//
// One slot, two kinds — a SHIELD (armor, behind a STRENGTH floor) or a BAG
// (cells, and the light build's stats) — and a two-handed weapon that says
// neither. The three ways that can go wrong are all here: a kind landing in the
// wrong slot, a hero wearing a greatsword and a shield at once, and a swap the
// bag has no room to make.

import { describe, expect, it } from "vitest";

import {
  autoEquipBest,
  canEquip,
  equipFromInventory,
  equipFromInventoryInto,
  equippedBagSlots,
  equipSlotForItem,
  fitsEquipSlot,
  isTwoHandedWeapon,
  LOOT,
  rollEquipment,
  SIDEARM_DEF_ID,
  statRequirement,
  type Equipment,
} from "@game/core";
import { startGame } from "./helpers.ts";

function piece(
  id: number,
  defId: string,
  slot: Equipment["slot"],
  extra: Partial<Equipment> = {},
): Equipment {
  return {
    id,
    defId,
    slot,
    tier: "regular",
    ilvl: 1,
    affixes: [],
    ...extra,
  };
}

const shield = (id: number, defId = "test_shield") =>
  piece(id, defId, "shield", { armor: 12, durability: 70 });
const bag = (id: number, defId = "test_bag") => piece(id, defId, "bag");
const greatsword = (id: number) =>
  piece(id, "test_greatsword", "weapon", { durability: 120 });
const sword = (id: number) =>
  piece(id, "crude_sword", "weapon", { durability: 120 });

describe("the offhand slot's vocabulary", () => {
  it("a bag and a shield both fit the second arm, and nothing else does", () => {
    expect(fitsEquipSlot("bag", "offhand")).toBe(true);
    expect(fitsEquipSlot("shield", "offhand")).toBe(true);
    expect(fitsEquipSlot("chest", "offhand")).toBe(false);
    expect(fitsEquipSlot("shield", "chest")).toBe(false);
    // A trinket is never worn at all, in this slot least of all.
    expect(fitsEquipSlot("trinket", "offhand")).toBe(false);
    expect(equipSlotForItem("bag")).toBe("offhand");
    expect(equipSlotForItem("shield")).toBe("offhand");
  });

  it("a shield lands in the offhand and displaces the bag that was there", () => {
    const state = startGame();
    state.players[0].inventory[0] = bag(1);
    expect(equipFromInventory(state, state.players[0], 0)).toBe(true);
    expect(equippedBagSlots(state, state.players[0])).toBe(2);

    state.players[0].inventory[1] = shield(2);
    expect(equipFromInventory(state, state.players[0], 1)).toBe(true);
    expect(state.players[0].equipment.offhand?.defId).toBe("test_shield");
    // The bag swapped back into the cell the shield came out of…
    expect(state.players[0].inventory[1]?.defId).toBe("test_bag");
    // …and the cells it was paying for are gone. That IS the trade.
    expect(equippedBagSlots(state, state.players[0])).toBe(0);
  });
});

describe("the shield's STRENGTH floor", () => {
  it("a shield demands STRENGTH even in a light material", () => {
    // A bag asks for nothing — that is what makes it the light build's answer.
    expect(statRequirement("test_bag")).toBeNull();
    // The same LEATHER that leaves a jacket nearly ungated still gates a
    // shield, because the floor (`SHIELD.strReqFraction`) sits under the
    // material's own rate.
    const heavy = statRequirement("test_heavy_shield");
    expect(heavy?.stat).toBe("strength");
    expect(heavy?.amount).toBeGreaterThan(0);
  });

  it("a caster cannot heft the heavy shield a bruiser can", () => {
    const req = statRequirement("test_heavy_shield");
    expect(req).not.toBeNull();
    const state = startGame();
    state.players[0].level = 40;

    state.players[0].stats.strength = 0;
    state.players[0].stats.intelligence = 60;
    expect(
      canEquip(state, state.players[0], shield(1, "test_heavy_shield")),
    ).toBe(false);

    state.players[0].stats.strength = (req?.amount ?? 0) + 1;
    expect(
      canEquip(state, state.players[0], shield(1, "test_heavy_shield")),
    ).toBe(true);
  });
});

describe("the two-handed rule", () => {
  it("knows a two-hander from a one-hander", () => {
    expect(isTwoHandedWeapon(greatsword(1))).toBe(true);
    expect(isTwoHandedWeapon(sword(1))).toBe(false);
    expect(isTwoHandedWeapon(shield(1))).toBe(false);
    expect(isTwoHandedWeapon(null)).toBe(false);
  });

  it("drawing a two-hander banks whatever the second arm held", () => {
    const state = startGame();
    state.players[0].stats.strength = 20; // room in the bag for the swap
    state.players[0].inventory[0] = shield(1);
    equipFromInventory(state, state.players[0], 0);
    expect(state.players[0].equipment.offhand?.defId).toBe("test_shield");

    state.players[0].inventory[1] = greatsword(2);
    expect(equipFromInventory(state, state.players[0], 1)).toBe(true);
    expect(state.players[0].equipment.weapon.defId).toBe("test_greatsword");
    expect(state.players[0].equipment.offhand).toBeNull();
    // The shield is in the bag, not destroyed.
    const banked = state.players[0].inventory.filter(
      (cell) => cell?.defId === "test_shield",
    );
    expect(banked).toHaveLength(1);
  });

  it("filling the second arm puts a two-hander away and arms the hero again", () => {
    const state = startGame();
    state.players[0].stats.strength = 20;
    state.players[0].inventory[0] = greatsword(1);
    equipFromInventory(state, state.players[0], 0);
    expect(state.players[0].equipment.weapon.defId).toBe("test_greatsword");

    // Equipping the greatsword banked the hero's own opening blade; taking the
    // greatsword back off draws that blade again, because a real one-handed
    // weapon always beats the last-resort sidearm.
    const shed = state.players[0].inventory.find(
      (cell) => cell?.slot === "weapon",
    )?.defId;
    expect(shed).toBeDefined();
    state.players[0].inventory[1] = shield(2);
    expect(equipFromInventory(state, state.players[0], 1)).toBe(true);
    expect(state.players[0].equipment.offhand?.defId).toBe("test_shield");
    expect(state.players[0].equipment.weapon.defId).toBe(shed);
    expect(
      state.players[0].inventory.filter(
        (cell) => cell?.defId === "test_greatsword",
      ),
    ).toHaveLength(1);
  });

  it("…and falls back to the sidearm when the bag holds nothing one-handed", () => {
    const state = startGame();
    state.players[0].stats.strength = 20;
    state.players[0].inventory[0] = greatsword(1);
    equipFromInventory(state, state.players[0], 0);
    // Strip every banked weapon, including the blade the swap above shed, so
    // the hero has nothing left but the greatsword he is about to put away —
    // and another greatsword, which is not a legal answer either.
    for (let i = 0; i < state.players[0].inventory.length; i++) {
      if (state.players[0].inventory[i]?.slot === "weapon")
        state.players[0].inventory[i] = null;
    }
    state.players[0].inventory[0] = greatsword(2);
    state.players[0].inventory[1] = shield(3);

    expect(equipFromInventory(state, state.players[0], 1)).toBe(true);
    expect(state.players[0].equipment.weapon.defId).toBe(SIDEARM_DEF_ID);
    expect(state.players[0].equipment.offhand?.defId).toBe("test_shield");
  });

  it("refuses the swap outright when the bag has nowhere to put what comes off", () => {
    const state = startGame();
    // The bag is at its floor, and every cell but the shield's is spoken for.
    state.players[0].inventory[0] = shield(1);
    equipFromInventory(state, state.players[0], 0);
    state.players[0].inventory[0] = greatsword(2);
    for (let i = 1; i < state.players[0].inventory.length; i++) {
      state.players[0].inventory[i] = piece(10 + i, "test_charm", "trinket");
    }
    expect(state.players[0].inventory.length).toBe(LOOT.baseInventorySize);

    expect(equipFromInventory(state, state.players[0], 0)).toBe(false);
    // Nothing moved: the greatsword is still in its cell and the shield is
    // still worn, which is what "refused whole" has to mean.
    expect(state.players[0].inventory[0]?.defId).toBe("test_greatsword");
    expect(state.players[0].equipment.offhand?.defId).toBe("test_shield");
  });

  it("holds on a drag onto the named slot too, not just a tap", () => {
    const state = startGame();
    state.players[0].stats.strength = 20;
    state.players[0].inventory[0] = shield(1);
    equipFromInventory(state, state.players[0], 0);
    state.players[0].inventory[1] = greatsword(2);
    expect(equipFromInventoryInto(state, state.players[0], 1, "weapon")).toBe(
      true,
    );
    expect(state.players[0].equipment.offhand).toBeNull();
  });

  it("the auto-equip sweep never fills an arm its own weapon pick claims", () => {
    const state = startGame();
    state.players[0].stats.strength = 20;
    state.players[0].inventory[0] = greatsword(1);
    state.players[0].inventory[1] = shield(2);
    autoEquipBest(state, state.players[0]);
    // The hand is decided first and wins — the sweep does not then hand the
    // shield to an arm the greatsword is using, which would just bank the
    // greatsword one line later and flap forever.
    expect(state.players[0].equipment.weapon.defId).toBe("test_greatsword");
    expect(state.players[0].equipment.offhand).toBeNull();
  });
});

describe("a bag's room grows with its item level", () => {
  it("a deep drop of a base carries more cells than an early one", () => {
    const state = startGame();
    // Same base, two depths, through the engine's own mint — the stamp is what
    // makes an old satchel worth picking back up out of a NIGHTMARE boss.
    const early = rollEquipment(state, state.players[0], {
      defId: "test_bag",
      tier: "regular",
      mlvl: 1,
    });
    const deep = rollEquipment(state, state.players[0], {
      defId: "test_bag",
      tier: "regular",
      mlvl: 70,
    });
    expect(early.bagSlots).toBe(2);
    expect(deep.bagSlots).toBeGreaterThan(early.bagSlots as number);

    // …and the stamp is what the worn slot actually pays out, not the catalog.
    state.players[0].inventory[0] = deep;
    equipFromInventory(state, state.players[0], 0);
    expect(equippedBagSlots(state, state.players[0])).toBe(deep.bagSlots);
  });

  it("a shield in the same slot pays no cells at all", () => {
    const state = startGame();
    state.players[0].inventory[0] = shield(1);
    equipFromInventory(state, state.players[0], 0);
    expect(equippedBagSlots(state, state.players[0])).toBe(0);
  });
});
