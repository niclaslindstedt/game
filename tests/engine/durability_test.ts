// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Weapon durability: dropped weapons wear out per attack, break, and are
// replaced by the best survivor in the bag; repair kits restore the edge.

import { describe, expect, it } from "vitest";

import {
  gearDef,
  isBetterEquipment,
  rollEquipment,
  step,
  weaponDef,
} from "@game/core";
import type { Equipment, GameState } from "@game/core";
import {
  clearStage,
  DT,
  equipBlaster,
  idle,
  makeEnemy,
  run,
  startGame,
} from "./helpers.ts";

function weapon(id: number, defId: string, durability?: number): Equipment {
  return {
    id,
    defId,
    slot: "weapon",
    tier: "regular",
    ilvl: 5,
    affixes: [],
    durability: durability ?? weaponDef(defId).durability,
  };
}

/** A punching bag in melee reach that soaks hits without dying. */
function addPunchingBag(state: GameState): void {
  state.enemies.push(
    makeEnemy({
      pos: { x: state.player.pos.x + 30, y: state.player.pos.y },
      hp: 1_000_000,
      maxHp: 1_000_000,
      contactCooldownMs: 1e9, // never claws back
    }),
  );
}

describe("weapon durability", () => {
  it("rolled weapon drops carry their def's durability", () => {
    const state = startGame();
    const rolled = rollEquipment(state, { defId: "test_pipe" });
    expect(rolled.durability).toBe(weaponDef("test_pipe").durability);
    // Charms never wear; armor carries its own durability (armor suite).
    const charm = rollEquipment(state, { defId: "test_charm" });
    expect(charm.durability).toBeUndefined();
  });

  it("the default starting weapon is the breakable crude sword", () => {
    const state = startGame();
    const weapon = state.player.equipment.weapon;
    expect(weapon.defId).toBe("crude_sword");
    // Unlike the old unbreakable sidearm, the crude sword carries finite
    // durability — it is a rough blade that wears out.
    expect(weapon.durability).toBe(weaponDef("crude_sword").durability);
    // And every swing spends it (the punching bag sits in melee reach).
    clearStage(state);
    addPunchingBag(state);
    run(state, idle, 200, (s) => s.stats.damageDealt > 0); // one swing
    expect(weapon.durability).toBeLessThan(weaponDef("crude_sword").durability);
  });

  it("each attack spends one point of durability", () => {
    const state = startGame();
    clearStage(state);
    addPunchingBag(state);
    state.player.equipment.weapon = weapon(50, "test_hammer", 10);
    run(state, idle, 200, (s) => s.stats.damageDealt > 0); // one swing
    expect(state.player.equipment.weapon.durability).toBe(9);
  });

  it("a broken weapon is trashed and the best bag weapon takes over", () => {
    const state = startGame();
    clearStage(state);
    addPunchingBag(state);
    state.player.equipment.weapon = weapon(50, "test_wand", 1); // last swing
    state.player.inventory[0] = weapon(51, "test_pistol"); // ~17.5 dps
    state.player.inventory[1] = weapon(52, "test_hammer"); // ~53 dps — the pick
    run(state, idle, 400, (s) =>
      s.events.some((e) => e.type === "weaponBroke"),
    );
    expect(state.player.equipment.weapon.id).toBe(52);
    // The wand is gone for good — not in hand, not in the bag.
    expect(state.player.inventory.every((i) => i?.id !== 50)).toBe(true);
    expect(state.player.inventory[1]).toBeNull();
    expect(state.player.inventory[0]?.id).toBe(51); // the pistol stays put
  });

  it("with no weapon in the bag a fresh sidearm is drawn", () => {
    const state = startGame();
    clearStage(state);
    addPunchingBag(state);
    state.player.equipment.weapon = weapon(50, "test_wand", 1);
    run(state, idle, 400, (s) =>
      s.events.some((e) => e.type === "weaponBroke"),
    );
    expect(state.player.equipment.weapon.defId).toBe("blaster");
    expect(state.player.equipment.weapon.durability).toBeUndefined();
  });
});

describe("same-weapon pickups refresh durability", () => {
  it("a fresher copy of the current weapon counts as an upgrade", () => {
    const state = startGame();
    const full = weaponDef("test_hammer").durability;
    state.player.equipment.weapon = weapon(50, "test_hammer", 3); // worn
    // A pristine identical weapon beats the worn one on durability alone…
    expect(isBetterEquipment(state, weapon(60, "test_hammer", full))).toBe(
      true,
    );
    // …but an equally-worn or more-worn copy is not worth the swap.
    expect(isBetterEquipment(state, weapon(61, "test_hammer", 3))).toBe(false);
    expect(isBetterEquipment(state, weapon(62, "test_hammer", 1))).toBe(false);
  });

  it("picking up the same weapon swaps it in and banks the worn copy", () => {
    const state = startGame();
    clearStage(state);
    const full = weaponDef("test_hammer").durability;
    state.player.equipment.weapon = weapon(50, "test_hammer", 4);
    state.items = [
      {
        id: 1,
        kind: "equipment",
        pos: { ...state.player.pos },
        equipment: weapon(60, "test_hammer", full),
      },
    ];
    step(state, idle, DT);
    // The fresh copy is now in hand; the worn one lands in the bag as a spare.
    expect(state.player.equipment.weapon.id).toBe(60);
    expect(state.player.equipment.weapon.durability).toBe(full);
    expect(state.player.inventory.some((i) => i?.id === 50)).toBe(true);
  });

  it("with a full bag it still swaps in, dropping the worn copy on the ground", () => {
    const state = startGame();
    clearStage(state);
    const full = weaponDef("test_hammer").durability;
    state.player.equipment.weapon = weapon(50, "test_hammer", 4);
    // Fill every bag cell so the worn copy has nowhere to bank.
    for (let i = 0; i < state.player.inventory.length; i++) {
      state.player.inventory[i] = weapon(100 + i, "test_pistol");
    }
    state.items = [
      {
        id: 1,
        kind: "equipment",
        pos: { ...state.player.pos },
        equipment: weapon(60, "test_hammer", full),
      },
    ];
    step(state, idle, DT);
    // The fresh copy is equipped just like dropping the current one to grab
    // the new: the worn copy is displaced to the ground, not into the (full)
    // bag, and not into a hand slot.
    expect(state.player.equipment.weapon.id).toBe(60);
    expect(state.player.inventory.some((i) => i?.id === 50)).toBe(false);
    expect(
      state.items.some(
        (it) => it.kind === "equipment" && it.equipment.id === 50,
      ),
    ).toBe(true);
  });

  it("the unbreakable sidearm is never traded for a breakable copy", () => {
    const state = equipBlaster(startGame()); // unbreakable blaster in hand
    expect(state.player.equipment.weapon.defId).toBe("blaster");
    expect(state.player.equipment.weapon.durability).toBeUndefined();
    const looted = weapon(60, "blaster", weaponDef("blaster").durability);
    expect(isBetterEquipment(state, looted)).toBe(false);
  });
});

describe("repair kits", () => {
  it("restore the equipped weapon to full durability", () => {
    const state = startGame();
    clearStage(state);
    state.player.equipment.weapon = weapon(50, "test_hammer", 3);
    state.items = [{ id: 1, kind: "repair", pos: { ...state.player.pos } }];
    step(state, idle, DT);
    expect(state.items).toHaveLength(0);
    expect(state.player.equipment.weapon.durability).toBe(
      weaponDef("test_hammer").durability,
    );
    expect(state.events).toContainEqual(
      expect.objectContaining({
        type: "itemCollected",
        kind: "repair",
      }),
    );
  });

  it("also mend worn armor, kit consumed even with no weapon to mend", () => {
    const state = equipBlaster(startGame()); // unbreakable weapon: nothing to mend
    clearStage(state);
    state.player.equipment.chest = {
      id: 70,
      defId: "test_vest",
      slot: "chest",
      tier: "regular",
      ilvl: 5,
      affixes: [],
      durability: 10, // battered
    };
    state.items = [{ id: 1, kind: "repair", pos: { ...state.player.pos } }];
    step(state, idle, DT);
    expect(state.items).toHaveLength(0);
    expect(state.player.equipment.chest.durability).toBe(
      gearDef("test_vest").durability,
    );
  });

  it("stay on the ground when there is nothing to repair", () => {
    const state = startGame(); // unbreakable sidearm in hand
    clearStage(state);
    state.items = [{ id: 1, kind: "repair", pos: { ...state.player.pos } }];
    step(state, idle, DT);
    expect(state.items).toHaveLength(1);

    // A pristine breakable weapon needs no repair either.
    state.player.equipment.weapon = weapon(50, "test_hammer");
    step(state, idle, DT);
    expect(state.items).toHaveLength(1);

    // Nor does armor at full durability.
    state.player.equipment.chest = {
      id: 70,
      defId: "test_vest",
      slot: "chest",
      tier: "regular",
      ilvl: 5,
      affixes: [],
      durability: gearDef("test_vest").durability,
    };
    step(state, idle, DT);
    expect(state.items).toHaveLength(1);
  });
});
