// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Weapon durability: dropped weapons wear out per attack, break, and are
// replaced by the best survivor in the bag; repair kits restore the edge.

import { describe, expect, it } from "vitest";

import { rollEquipment, step, WEAPON_DEFS } from "@game/core";
import type { Equipment, GameState } from "@game/core";
import { clearStage, DT, idle, makeEnemy, run, startGame } from "./helpers.ts";

function weapon(id: number, defId: string, durability?: number): Equipment {
  return {
    id,
    defId,
    slot: "weapon",
    tier: "regular",
    affixes: [],
    durability: durability ?? WEAPON_DEFS[defId]!.durability,
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
    const rolled = rollEquipment(state, { defId: "pipe" });
    expect(rolled.durability).toBe(WEAPON_DEFS.pipe!.durability);
    // Gear never wears.
    const suit = rollEquipment(state, { defId: "suit_plating" });
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
    state.player.equipment.weapon = weapon(50, "hammer", 10);
    run(state, idle, 200, (s) => s.stats.damageDealt > 0); // one swing
    expect(state.player.equipment.weapon.durability).toBe(9);
  });

  it("a broken weapon is trashed and the best bag weapon takes over", () => {
    const state = startGame();
    clearStage(state);
    addPunchingBag(state);
    state.player.equipment.weapon = weapon(50, "wand", 1); // last swing
    state.player.inventory[0] = weapon(51, "pistol"); // ~17.5 dps
    state.player.inventory[1] = weapon(52, "hammer"); // ~53 dps — the pick
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
    state.player.equipment.weapon = weapon(50, "wand", 1);
    run(state, idle, 400, (s) =>
      s.events.some((e) => e.type === "weaponBroke"),
    );
    expect(state.player.equipment.weapon.defId).toBe("blaster");
    expect(state.player.equipment.weapon.durability).toBeUndefined();
  });
});

describe("repair kits", () => {
  it("restore the equipped weapon to full durability", () => {
    const state = startGame();
    clearStage(state);
    state.player.equipment.weapon = weapon(50, "hammer", 3);
    state.items = [{ id: 1, kind: "repair", pos: { ...state.player.pos } }];
    step(state, idle, DT);
    expect(state.items).toHaveLength(0);
    expect(state.player.equipment.weapon.durability).toBe(
      WEAPON_DEFS.hammer!.durability,
    );
    expect(state.events).toContainEqual({
      type: "itemCollected",
      kind: "repair",
    });
  });

  it("stay on the ground when there is nothing to repair", () => {
    const state = startGame(); // unbreakable sidearm in hand
    clearStage(state);
    state.items = [{ id: 1, kind: "repair", pos: { ...state.player.pos } }];
    step(state, idle, DT);
    expect(state.items).toHaveLength(1);

    // A pristine breakable weapon needs no repair either.
    state.player.equipment.weapon = weapon(50, "hammer");
    step(state, idle, DT);
    expect(state.items).toHaveLength(1);
  });
});
