// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Passive trinkets: gear that pays out a flat stat bonus (`GearDef.passive`)
// while merely CARRIED — no equip slot needed. Exercised on the synthetic
// `test_chip` (mirrors the shipped PASSAGE CHIP: +1 INT), so the rule is
// asserted against content-agnostic ids.

import { describe, expect, it } from "vitest";

import {
  effectiveStat,
  equipFromInventory,
  isBetterEquipment,
  isPassiveItem,
  rollEquipment,
  step,
  weaponRangeFor,
} from "@game/core";
import type { Equipment, GameState } from "@game/core";
import { clearStage, DT, idle, startGame, stopWaves } from "./helpers.ts";

function makeChip(state: GameState): Equipment {
  return rollEquipment(state, { defId: "test_chip", tier: "regular" });
}

describe("passive trinkets", () => {
  it("flags a passive gear def, and only it", () => {
    expect(isPassiveItem("test_chip")).toBe(true);
    expect(isPassiveItem("test_charm")).toBe(false);
    expect(isPassiveItem("test_suit")).toBe(false);
    // A weapon id is never a passive trinket.
    expect(isPassiveItem("test_wrench")).toBe(false);
  });

  it("raises the stat by +1 while riding in the bag", () => {
    const state = startGame();
    const before = effectiveStat(state, "intelligence");
    state.player.inventory[0] = makeChip(state);
    expect(effectiveStat(state, "intelligence")).toBe(before + 1);
    // Only the one stat moves.
    expect(effectiveStat(state, "strength")).toBe(state.player.stats.strength);
  });

  it("flows the passive INT into derived stats (weapon reach)", () => {
    const state = startGame();
    const reachBefore = weaponRangeFor(state, state.player.equipment.weapon);
    state.player.inventory[0] = makeChip(state);
    expect(
      weaponRangeFor(state, state.player.equipment.weapon),
    ).toBeGreaterThan(reachBefore);
  });

  it("counts exactly once whether stowed or worn", () => {
    const state = startGame();
    const base = effectiveStat(state, "intelligence");
    state.player.inventory[0] = makeChip(state);
    expect(effectiveStat(state, "intelligence")).toBe(base + 1);
    // Drag it onto the (empty) charm slot: still +1, never +2.
    expect(equipFromInventory(state, 0)).toBe(true);
    expect(state.player.equipment.charm?.defId).toBe("test_chip");
    expect(effectiveStat(state, "intelligence")).toBe(base + 1);
  });

  it("is never auto-equipped — it banks in the bag, leaving the slot free", () => {
    const state = startGame();
    // The charm slot is empty, yet a passive trinket is not "better" to wear:
    // it works from the bag, so ordinary charms keep the slot.
    const chip = makeChip(state);
    expect(state.player.equipment.charm).toBeNull();
    expect(isBetterEquipment(state, chip)).toBe(false);
  });

  it("a dropped chip is picked up into the bag, not worn", () => {
    const state = startGame();
    clearStage(state);
    stopWaves(state);
    state.items.push({
      id: state.nextId++,
      kind: "equipment",
      pos: { ...state.player.pos },
      equipment: makeChip(state),
    });
    step(state, idle, DT);
    expect(state.player.equipment.charm).toBeNull();
    expect(state.player.inventory.some((c) => c?.defId === "test_chip")).toBe(
      true,
    );
    // And the mind is sharper for carrying it.
    expect(effectiveStat(state, "intelligence")).toBe(
      state.player.stats.intelligence + 1,
    );
  });
});
