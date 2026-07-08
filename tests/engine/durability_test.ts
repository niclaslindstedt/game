// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Weapon durability: dropped weapons wear out per attack, break, and are
// replaced by the best survivor in the bag; repair kits restore the edge.

import { describe, expect, it } from "vitest";

import { isBetterEquipment, rollEquipment, step, weaponDef } from "@game/core";
import type { Equipment, GameState } from "@game/core";
import { clearStage, DT, idle, makeEnemy, run, startGame } from "./helpers.ts";

function weapon(id: number, defId: string, durability?: number): Equipment {
  return {
    id,
    defId,
    slot: "weapon",
    tier: "regular",
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
    // Gear never wears.
    const suit = rollEquipment(state, { defId: "test_suit" });
    expect(suit.durability).toBeUndefined();
  });

  it("the starting sidearm is unbreakable", () => {
    const state = startGame();
    expect(state.player.equipment.weapon.durability).toBeUndefined();
    clearStage(state);
    addPunchingBag(state);
    run(state, idle, 500);
    expect(state.player.equipment.weapon.defId).toBe("blaster");
    expect(state.events.every((e) => e.type !== "weaponBroke")).toBe(true);
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

  it("keeps the worn copy: a full bag leaves the fresh one grounded", () => {
    const state = startGame();
    clearStage(state);
    const full = weaponDef("test_hammer").durability;
    state.player.equipment.weapon = weapon(50, "test_hammer", 4);
    // Fill every bag cell so a swap would have nowhere to bank the worn copy.
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
    // No swap happened: the worn weapon is still in hand — never dropped or
    // consumed — and the fresh copy waits on the ground for a free slot.
    expect(state.player.equipment.weapon.id).toBe(50);
    expect(state.player.equipment.weapon.durability).toBe(4);
    expect(
      state.items.some(
        (it) => it.kind === "equipment" && it.equipment.id === 60,
      ),
    ).toBe(true);
  });

  it("the unbreakable sidearm is never traded for a breakable copy", () => {
    const state = startGame(); // blaster sidearm, durability undefined
    expect(state.player.equipment.weapon.defId).toBe("blaster");
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
  });
});
