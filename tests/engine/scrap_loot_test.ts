// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The bulk-scrap sweep (scrapInferiorLoot): clear every bag piece the hero has
// outgrown — worse than what's worn in its slot — while sparing keepers:
// upgrades, side-grades, empty-slot fills, passive trinkets, and
// unique/legendary trophies. Runs on synthetic fixtures so it survives content
// churn.

import { describe, expect, it } from "vitest";

import { isScrappableLoot, isSpecialItem, scrapInferiorLoot } from "@game/core";
import type { Equipment, GameState, Tier } from "@game/core";

import { startGame } from "./helpers.ts";

let nextId = 1000;

function weapon(defId: string, tier: Tier = "regular"): Equipment {
  return { id: nextId++, defId, slot: "weapon", tier, ilvl: 1, affixes: [] };
}

function gear(
  defId: string,
  slot: "chest" | "charm" | "bag",
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

/** The pieces still in the bag, in cell order. */
function bagItems(state: GameState): Equipment[] {
  return state.player.inventory.filter((i): i is Equipment => i !== null);
}

describe("scrapInferiorLoot", () => {
  it("scraps a weapon that scores below the equipped one", () => {
    const state = startGame();
    // A strong wrench (dmg 22, fast) worn; a weaker pistol banked.
    state.player.equipment.weapon = weapon("test_wrench");
    const junk = weapon("test_pistol");
    stock(state, [junk]);

    const scrapped = scrapInferiorLoot(state);

    expect(scrapped.map((i) => i.id)).toEqual([junk.id]);
    expect(bagItems(state)).toHaveLength(0);
  });

  it("keeps a weapon that out-scores the equipped one", () => {
    const state = startGame();
    state.player.equipment.weapon = weapon("test_pistol");
    const upgrade = weapon("test_wrench");
    stock(state, [upgrade]);

    expect(scrapInferiorLoot(state)).toEqual([]);
    expect(bagItems(state).map((i) => i.id)).toEqual([upgrade.id]);
  });

  it("keeps a gear piece bound for an empty slot", () => {
    const state = startGame();
    state.player.equipment.charm = null;
    const charm = gear("test_charm", "charm");
    stock(state, [charm]);

    expect(scrapInferiorLoot(state)).toEqual([]);
    expect(bagItems(state).map((i) => i.id)).toEqual([charm.id]);
  });

  it("scraps a gear piece worse than what's worn in its slot", () => {
    const state = startGame();
    // A roomy bag worn (5 cells → score 50); a smaller bag banked (2 → 20).
    state.player.equipment.bag = gear("test_big_bag", "bag");
    const smallBag = gear("test_bag", "bag");
    stock(state, [smallBag]);

    const scrapped = scrapInferiorLoot(state);

    expect(scrapped.map((i) => i.id)).toEqual([smallBag.id]);
    expect(bagItems(state)).toHaveLength(0);
  });

  it("keeps a gear side-grade of equal worth to what's worn", () => {
    const state = startGame();
    // Same charm def worn and banked: equal worth is not "worse than", so the
    // spare is spared.
    state.player.equipment.charm = gear("test_charm", "charm");
    const sideGrade = gear("test_charm", "charm");
    stock(state, [sideGrade]);

    expect(scrapInferiorLoot(state)).toEqual([]);
    expect(bagItems(state).map((i) => i.id)).toEqual([sideGrade.id]);
  });

  it("spares special items even when they are inferior", () => {
    const state = startGame();
    state.player.equipment.weapon = weapon("test_wrench");
    // A passive trinket (test_chip) and a unique/legendary weapon: both worse
    // than / unrelated to the worn wrench, both kept.
    const trinket = gear("test_chip", "charm");
    const uniqueBlade = weapon("test_pistol", "unique");
    const legendaryBlade = weapon("test_pistol", "legendary");
    const plainJunk = weapon("test_pistol");
    stock(state, [trinket, uniqueBlade, legendaryBlade, plainJunk]);

    const scrapped = scrapInferiorLoot(state);

    expect(scrapped.map((i) => i.id)).toEqual([plainJunk.id]);
    expect(bagItems(state).map((i) => i.id)).toEqual([
      trinket.id,
      uniqueBlade.id,
      legendaryBlade.id,
    ]);
  });

  it("isSpecialItem flags top tiers and passive trinkets, not plain loot", () => {
    expect(isSpecialItem(weapon("test_pistol", "unique"))).toBe(true);
    expect(isSpecialItem(weapon("test_pistol", "legendary"))).toBe(true);
    expect(isSpecialItem(gear("test_chip", "charm"))).toBe(true);
    expect(isSpecialItem(weapon("test_pistol"))).toBe(false);
    expect(isSpecialItem(gear("test_charm", "charm"))).toBe(false);
  });

  it("isScrappableLoot agrees with the sweep it drives", () => {
    const state = startGame();
    state.player.equipment.weapon = weapon("test_wrench");
    const junk = weapon("test_pistol");
    const keeper = weapon("test_hammer"); // higher damage → out-scores wrench
    stock(state, [junk, keeper]);

    expect(isScrappableLoot(state, junk)).toBe(true);
    expect(isScrappableLoot(state, keeper)).toBe(false);
  });

  it("is a no-op on a bag of keepers", () => {
    const state = startGame();
    state.player.equipment.weapon = weapon("test_pistol");
    const upgrade = weapon("test_hammer");
    const trinket = gear("test_chip", "charm");
    stock(state, [upgrade, trinket]);

    expect(scrapInferiorLoot(state)).toEqual([]);
    expect(bagItems(state)).toHaveLength(2);
  });
});
