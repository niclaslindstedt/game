// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Weapon durability: dropped weapons wear out per attack, break, and are
// replaced by the best survivor in the bag; repair kits restore the edge.

import { describe, expect, it } from "vitest";

import {
  CONSUMABLES,
  gearDef,
  isBetterEquipment,
  rollEquipment,
  step,
  weaponDef,
} from "@game/core";
import type { Equipment, GameInput, GameState } from "@game/core";
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
    // Pin the make quality to NORMAL and its base-value roll to the band
    // midpoint (1×, via a 0.5 flavor draw): BROKEN/PERFECT — and where inside
    // a band a copy lands — scale the wear budget (the quality suite's beat);
    // this asserts the plain def carry-over at neutral make.
    state.fxRng = () => 0.5;
    const rolled = rollEquipment(state, {
      defId: "test_pipe",
      quality: "normal",
    });
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

  it("a broken weapon drops into the bag (not trashed) and the best bag weapon takes over", () => {
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
    // The wand is NOT destroyed: it rides in the bag at zero durability, a
    // broken spare unequippable until repaired.
    const brokenWand = state.player.inventory.find((i) => i?.id === 50);
    expect(brokenWand?.durability).toBe(0);
    expect(state.player.inventory[0]?.id).toBe(51); // the pistol stays put
  });

  it("prefers a good bag weapon over the starting sidearm on a break", () => {
    const state = startGame();
    clearStage(state);
    addPunchingBag(state);
    state.player.equipment.weapon = weapon(50, "test_wand", 1); // last swing
    state.player.inventory[0] = weapon(52, "test_hammer"); // the only spare
    run(state, idle, 400, (s) =>
      s.events.some((e) => e.type === "weaponBroke"),
    );
    // The hammer is drawn, not a fresh blaster — a good weapon beats defaulting
    // to the starter.
    expect(state.player.equipment.weapon.id).toBe(52);
    expect(state.player.equipment.weapon.defId).toBe("test_hammer");
  });

  it("with no wieldable weapon in the bag a fresh sidearm is drawn", () => {
    const state = startGame();
    clearStage(state);
    addPunchingBag(state);
    state.player.equipment.weapon = weapon(50, "test_wand", 1);
    run(state, idle, 400, (s) =>
      s.events.some((e) => e.type === "weaponBroke"),
    );
    expect(state.player.equipment.weapon.defId).toBe("blaster");
    expect(state.player.equipment.weapon.durability).toBeUndefined();
    // The broken wand still rides in the bag — never destroyed.
    expect(state.player.inventory.find((i) => i?.id === 50)?.durability).toBe(
      0,
    );
  });

  it("a broken weapon in the bag cannot be equipped until repaired", () => {
    const state = startGame();
    clearStage(state);
    const broken = weapon(50, "test_hammer", 0); // durability 0 = broken
    state.player.inventory[0] = broken;
    expect(isBetterEquipment(state, broken)).toBe(false);
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

const useRepair: GameInput = { ...idle, useRepairKit: true };

describe("repair kits — banking", () => {
  it("stash into the dock on pickup (stacking) rather than firing on contact", () => {
    const state = startGame();
    clearStage(state);
    state.player.equipment.weapon = weapon(50, "test_hammer", 3); // battered
    state.items = [{ id: 1, kind: "repair", pos: { ...state.player.pos } }];
    step(state, idle, DT);
    // Grabbed for later — the kit is off the ground and banked, but the
    // battered weapon is NOT yet mended (it waits for the player's call).
    expect(state.items).toHaveLength(0);
    expect(state.player.repairKits).toBe(1);
    expect(state.player.equipment.weapon.durability).toBe(3);
    expect(state.events).toContainEqual(
      expect.objectContaining({ type: "itemCollected", kind: "repair" }),
    );
  });

  it("bank even with a pristine kit (grabbed for later, like a medkit)", () => {
    const state = startGame(); // unbreakable sidearm, nothing to mend right now
    clearStage(state);
    state.items = [{ id: 1, kind: "repair", pos: { ...state.player.pos } }];
    step(state, idle, DT);
    expect(state.items).toHaveLength(0);
    expect(state.player.repairKits).toBe(1);
  });

  it("stack up to the cap, then overflow stays on the ground", () => {
    const state = startGame();
    clearStage(state);
    state.player.repairKits = CONSUMABLES.stackCap; // full
    state.items = [{ id: 1, kind: "repair", pos: { ...state.player.pos } }];
    step(state, idle, DT);
    // No room: the kit stays grounded and the stack holds at the cap.
    expect(state.items).toHaveLength(1);
    expect(state.player.repairKits).toBe(CONSUMABLES.stackCap);
  });
});

describe("repair kits — spending", () => {
  it("mend the held weapon AND every weapon in the bag, not just the equipped one", () => {
    const state = startGame();
    clearStage(state);
    state.player.repairKits = 1;
    state.player.equipment.weapon = weapon(50, "test_hammer", 3); // battered
    state.player.inventory[0] = weapon(51, "test_pistol", 2); // battered spare
    state.player.inventory[1] = weapon(52, "test_wand", 0); // broken spare
    step(state, useRepair, DT);
    expect(state.player.repairKits).toBe(0);
    // The held weapon is whole again…
    expect(state.player.equipment.weapon.durability).toBe(
      weaponDef("test_hammer").durability,
    );
    // …and so is every weapon riding in the bag (the broken wand woke up).
    const pistol = state.player.inventory.find((i) => i?.id === 51);
    const wand = state.player.inventory.find((i) => i?.id === 52);
    expect(pistol?.durability).toBe(weaponDef("test_pistol").durability);
    expect(wand?.durability).toBe(weaponDef("test_wand").durability);
    expect(state.events).toContainEqual(
      expect.objectContaining({ type: "repairKitUsed" }),
    );
  });

  it("also mend worn armor", () => {
    const state = equipBlaster(startGame());
    clearStage(state);
    state.player.repairKits = 1;
    state.player.equipment.chest = {
      id: 70,
      defId: "test_vest",
      slot: "chest",
      tier: "regular",
      ilvl: 5,
      affixes: [],
      durability: 10, // battered
    };
    step(state, useRepair, DT);
    expect(state.player.repairKits).toBe(0);
    expect(state.player.equipment.chest.durability).toBe(
      gearDef("test_vest").durability,
    );
  });

  it("no-op (kit kept) with none held or nothing to mend", () => {
    const state = startGame(); // unbreakable sidearm, nothing to mend
    clearStage(state);
    // None held: nothing happens.
    step(state, useRepair, DT);
    expect(state.events.some((e) => e.type === "repairKitUsed")).toBe(false);
    // One held but the whole kit is already whole: the kit is kept.
    state.player.repairKits = 1;
    step(state, useRepair, DT);
    expect(state.player.repairKits).toBe(1);
    expect(state.events.some((e) => e.type === "repairKitUsed")).toBe(false);
  });

  it("re-equip the weapons durability booted, earliest-shed reclaiming the hand", () => {
    const state = startGame();
    clearStage(state);
    addPunchingBag(state);
    // The hero mains the hammer (best), with a pistol as backup. When the
    // hammer breaks the pistol takes over; when the pistol breaks too, only the
    // starter sidearm remains.
    state.player.equipment.weapon = weapon(50, "test_hammer", 1);
    state.player.inventory[0] = weapon(51, "test_pistol", 1);
    // First break: hammer → bag (shed #1), pistol drawn.
    run(state, idle, 600, (s) => s.player.equipment.weapon.id === 51);
    // Second break: pistol → bag (shed #2), sidearm drawn.
    run(state, idle, 600, (s) => s.player.equipment.weapon.defId === "blaster");
    expect(state.player.equipment.weapon.defId).toBe("blaster");
    // Clear the field so the re-equipped weapon doesn't wear a point swinging
    // in the same step — this beat is about which weapon returns, not combat.
    state.enemies = [];
    // Now repair: both weapons mend, and the EARLIEST-shed (the hammer, the
    // hero's main) reclaims the hand; the pistol stays as a wieldable spare.
    state.player.repairKits = 1;
    step(state, useRepair, DT);
    expect(state.player.equipment.weapon.id).toBe(50);
    expect(state.player.equipment.weapon.durability).toBe(
      weaponDef("test_hammer").durability,
    );
    const pistol = state.player.inventory.find((i) => i?.id === 51);
    expect(pistol?.durability).toBe(weaponDef("test_pistol").durability);
    // The shed markers are cleared once the kit is whole again.
    expect(state.player.equipment.weapon.unequippedAt).toBeUndefined();
    expect(pistol?.unequippedAt).toBeUndefined();
  });
});
