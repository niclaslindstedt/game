// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE EMPTY HAND: the weapon slot comes off like every other slot, and what is
// left is the hero's own hands. The slot stays TYPED never-empty — a hundred
// reads of `equipment.weapon` lean on that — so "unarmed" is a real piece
// (`UNARMED_DEF_ID`) rather than a null, and the rules that keep it from
// behaving like a possession are what this suite pins:
//
//   • it banks the weapon and leaves the hand empty,
//   • it never itself enters the bag, by any of the routes a weapon leaves the
//     hand (an equip from a cell, a pickup, a corpse recovery),
//   • it eats nothing and breaks never, which is what makes the on-break and
//     dry-weapon swaps unconditional.

import { describe, expect, it } from "vitest";

import {
  equipFromInventory,
  equipFromInventoryInto,
  hasAmmoFor,
  isBareHands,
  UNARMED_DEF_ID,
  unequipToInventory,
  weaponDef,
  type Equipment,
} from "@game/core";
import { startGame } from "./helpers.ts";

/** Mint a fixture weapon instance. */
function weapon(id: number, defId = "test_hammer"): Equipment {
  return { id, defId, slot: "weapon", tier: "regular", ilvl: 1, affixes: [] };
}

describe("taking the weapon off", () => {
  it("banks the weapon and leaves the hero bare-handed", () => {
    const state = startGame();
    const hero = state.players[0];
    const held = hero.equipment.weapon.id;
    expect(isBareHands(hero.equipment.weapon)).toBe(false);

    expect(unequipToInventory(state, hero, "weapon")).toBe(true);
    expect(isBareHands(hero.equipment.weapon)).toBe(true);
    expect(hero.inventory.some((cell) => cell?.id === held)).toBe(true);
  });

  it("refuses a hero who is already empty-handed", () => {
    // Nothing to take off — and the refusal is what stops the bag filling up
    // with copies of an empty hand, one per tap.
    const state = startGame();
    const hero = state.players[0];
    expect(unequipToInventory(state, hero, "weapon")).toBe(true);
    expect(unequipToInventory(state, hero, "weapon")).toBe(false);
    expect(hero.inventory.filter((c) => c && isBareHands(c))).toHaveLength(0);
  });

  it("refuses when the bag has nowhere to put what comes off", () => {
    // The same refusal every other slot makes: a full bag means the piece stays
    // where the player last saw it rather than hitting the floor.
    const state = startGame();
    const hero = state.players[0];
    const held = hero.equipment.weapon.id;
    for (let i = 0; i < hero.inventory.length; i++) {
      hero.inventory[i] = weapon(500 + i);
    }
    expect(unequipToInventory(state, hero, "weapon")).toBe(false);
    expect(hero.equipment.weapon.id).toBe(held);
  });
});

describe("the empty hand is never a possession", () => {
  it("vanishes rather than banking when a weapon is equipped over it", () => {
    const state = startGame();
    const hero = state.players[0];
    unequipToInventory(state, hero, "weapon");
    // Park a real weapon in a KNOWN empty cell and equip it from there: the
    // cell must end up empty, not holding a pair of fists.
    const free = hero.inventory.indexOf(null);
    expect(free).toBeGreaterThanOrEqual(0);
    hero.inventory[free] = weapon(900);

    expect(equipFromInventory(state, hero, free)).toBe(true);
    expect(hero.equipment.weapon.id).toBe(900);
    expect(hero.inventory[free]).toBeNull();
    expect(hero.inventory.some((c) => c && isBareHands(c))).toBe(false);
  });

  it("vanishes the same way on a drag onto the weapon slot", () => {
    // `equipFromInventoryInto` is the aimed-drop door and keeps its own copy of
    // the displacement rule, so it needs its own beat.
    const state = startGame();
    const hero = state.players[0];
    unequipToInventory(state, hero, "weapon");
    const free = hero.inventory.indexOf(null);
    hero.inventory[free] = weapon(901);

    expect(equipFromInventoryInto(state, hero, free, "weapon")).toBe(true);
    expect(hero.equipment.weapon.id).toBe(901);
    expect(hero.inventory[free]).toBeNull();
    expect(hero.inventory.some((c) => c && isBareHands(c))).toBe(false);
  });
});

describe("the empty hand's own def", () => {
  it("eats nothing and breaks never — the unconditional fallback", () => {
    // This is the property the on-break and dry-weapon swaps lean on: neither
    // can fail to find something to put in the hand, so no hero is ever left
    // unable to land the blow that earns him a replacement.
    const def = weaponDef(UNARMED_DEF_ID);
    expect(def.ammo).toBeUndefined();
    expect(def.durability).toBeUndefined();
    expect(def.class).toBe("melee");
  });

  it("swings as a PUNCH, so the app draws no slash crescent", () => {
    // The motion word rides out on the `swing` event, and it is what the app
    // branches on to draw a knuckle impact at the end of the reach instead of
    // the wedge a blade sweeps (game-screen/event-fx.ts). A fist travels along
    // one line to one place; the wedge is the picture of an edge crossing a
    // sector, so drawing one here would invent a swing the hand does not have.
    expect(weaponDef(UNARMED_DEF_ID).motion).toBe("punch");
  });

  it("is always loaded, so the dry swap never churns on it", () => {
    // `stepWeapon` asks for the dry swap on every attack tick. `hasAmmoFor`
    // answering yes for the empty hand is what stops an unarmed hero swapping
    // fists for fists sixty times a second.
    const state = startGame();
    const hero = state.players[0];
    unequipToInventory(state, hero, "weapon");
    expect(hasAmmoFor(hero, hero.equipment.weapon)).toBe(true);
  });
});
