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

/** Every def id the hero is WEARING right now — the check that a trinket
 * never reaches a slot, whichever slot that might have been. */
function wornDefIds(state: GameState): string[] {
  return Object.values(state.player.equipment)
    .filter((piece): piece is Equipment => piece !== null)
    .map((piece) => piece.defId);
}

describe("passive trinkets", () => {
  it("flags a passive gear def, and only it", () => {
    expect(isPassiveItem("test_chip")).toBe(true);
    expect(isPassiveItem("test_charm")).toBe(false);
    expect(isPassiveItem("test_vest")).toBe(false);
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
    // INT lengthens RANGED/MAGIC reach (a melee blade's reach is STRENGTH's), so
    // check the passive INT flows through on a ranged sidearm.
    const ranged: Equipment = {
      id: 991,
      defId: "blaster",
      slot: "weapon",
      tier: "regular",
      ilvl: 1,
      affixes: [],
    };
    state.player.equipment.weapon = ranged;
    const reachBefore = weaponRangeFor(state, ranged);
    state.player.inventory[0] = makeChip(state);
    expect(weaponRangeFor(state, ranged)).toBeGreaterThan(reachBefore);
  });

  it("cannot be worn at all — the bag IS where it works", () => {
    const state = startGame();
    const base = effectiveStat(state, "intelligence");
    state.player.inventory[0] = makeChip(state);
    expect(effectiveStat(state, "intelligence")).toBe(base + 1);
    // There is no slot to drag it to: a trinket pays out from the cell it
    // sits in, so the equip is refused and the piece stays put — still +1,
    // never +2, and never stranded.
    expect(equipFromInventory(state, 0)).toBe(false);
    expect(state.player.inventory[0]?.defId).toBe("test_chip");
    expect(effectiveStat(state, "intelligence")).toBe(base + 1);
  });

  it("is never auto-equipped — it banks in the bag", () => {
    const state = startGame();
    // A passive trinket is not "better" to wear anywhere: it works from the
    // bag, and there is no trinket slot to spend on it.
    const chip = makeChip(state);
    expect(isBetterEquipment(state, chip)).toBe(false);
    expect(wornDefIds(state)).not.toContain("test_chip");
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
    expect(wornDefIds(state)).not.toContain("test_chip");
    expect(state.player.inventory.some((c) => c?.defId === "test_chip")).toBe(
      true,
    );
    // And the mind is sharper for carrying it.
    expect(effectiveStat(state, "intelligence")).toBe(
      state.player.stats.intelligence + 1,
    );
  });
});
