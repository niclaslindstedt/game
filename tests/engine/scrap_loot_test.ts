// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The bulk-scrap sweep (scrapInferiorLoot): clear every bag piece the hero has
// outgrown — worse than what's worn in its slot — while sparing keepers:
// upgrades, side-grades, empty-slot fills, passive trinkets,
// unique/legendary trophies, and the BACKUP ARSENAL (his best weapon of each
// class, plus any spare he has not genuinely climbed past). Runs on synthetic
// fixtures so it survives content churn.

import { describe, expect, it } from "vitest";

import {
  isScrappableLoot,
  isSpecialItem,
  isTrashLoot,
  LOOT,
  scrapInferiorLoot,
} from "@game/core";
import type { Equipment, GameState, Tier } from "@game/core";

import { startGame } from "./helpers.ts";

let nextId = 1000;

function weapon(defId: string, tier: Tier = "regular", ilvl = 1): Equipment {
  return { id: nextId++, defId, slot: "weapon", tier, ilvl, affixes: [] };
}

/** The ilvl a spare has to sit at or under to be trash to a hero holding
 * {@link HELD_ILVL} — the "he has genuinely climbed past this" bar. */
const HELD_ILVL = 40;
const TRASH_ILVL = HELD_ILVL - LOOT.trashWeaponIlvlMargin;

/** A hero deep enough into a run that the ilvl bar can actually be cleared, and
 * high enough level that every fixture piece below is wieldable — the keep-set
 * ranks a wieldable spare over one the hero cannot lift, and a test that let
 * that decide would be asserting the level gate instead of the sweep. */
function veteran(state: GameState, heldDefId = "test_wrench"): void {
  state.players[0].level = 90;
  state.players[0].equipment.weapon = weapon(heldDefId, "regular", HELD_ILVL);
}

function gear(
  defId: string,
  slot: "chest" | "amulet" | "trinket" | "bag",
  tier: Tier = "regular",
): Equipment {
  return { id: nextId++, defId, slot, tier, ilvl: 1, affixes: [] };
}

/** Fill the bag with exactly these pieces (padding the rest with empty cells).
 * Grows the bag past its small base floor when a test stocks more than fits. */
function stock(state: GameState, items: Equipment[]): void {
  const inv = state.players[0].inventory;
  while (inv.length < items.length) inv.push(null);
  for (let i = 0; i < inv.length; i++) inv[i] = items[i] ?? null;
}

/** The pieces still in the bag, in cell order. */
function bagItems(state: GameState): Equipment[] {
  return state.players[0].inventory.filter((i): i is Equipment => i !== null);
}

describe("scrapInferiorLoot", () => {
  it("scraps a weapon the hero has climbed past, once a backup of its class is spared", () => {
    const state = startGame();
    // A strong wrench (dmg 22, fast) worn, deep into a run; two weaker pistols
    // banked. The first is the hero's only RANGED weapon, so it is his backup
    // and stays whatever it scores; the second is a spare of a spare and far
    // enough behind the hand to be junk.
    veteran(state);
    const backup = weapon("test_pistol", "regular", TRASH_ILVL);
    const junk = weapon("test_pistol", "regular", TRASH_ILVL);
    stock(state, [backup, junk]);

    const scrapped = scrapInferiorLoot(state, state.players[0]);

    expect(scrapped.map((i) => i.id)).toEqual([junk.id]);
    expect(bagItems(state).map((i) => i.id)).toEqual([backup.id]);
  });

  it("keeps a weapon that out-scores the equipped one", () => {
    const state = startGame();
    state.players[0].equipment.weapon = weapon("test_pistol");
    const upgrade = weapon("test_wrench");
    stock(state, [upgrade]);

    expect(scrapInferiorLoot(state, state.players[0])).toEqual([]);
    expect(bagItems(state).map((i) => i.id)).toEqual([upgrade.id]);
  });

  it("KEEPS ONE WEAPON OF EVERY CLASS, however far behind the hand it has fallen", () => {
    const state = startGame();
    // A blade in the hand and, in the bag, the only gun and the only wand the
    // hero owns — both feeble, both ancient. Neither is trash: a gun runs out
    // of ammunition where a blade cannot, and a blade reaches what a swarmed
    // hero cannot back away from, so a spare of each is the kit that keeps a
    // broken weapon or an empty pouch from ending the run.
    veteran(state);
    const gun = weapon("test_pistol", "regular", 1);
    const wand = weapon("test_wand", "regular", 1);
    stock(state, [gun, wand]);

    expect(scrapInferiorLoot(state, state.players[0])).toEqual([]);
    expect(bagItems(state).map((i) => i.id)).toEqual([gun.id, wand.id]);
  });

  it("keeps the BEST of a class as the backup and trashes the rest", () => {
    const state = startGame();
    veteran(state);
    // Two guns, both ancient: the revolver hits far harder, so it is the one
    // worth having when the blade snaps.
    const weakGun = weapon("test_pistol", "regular", 1);
    const bestGun = weapon("test_revolver", "regular", 1);
    stock(state, [weakGun, bestGun]);

    const scrapped = scrapInferiorLoot(state, state.players[0]);

    expect(scrapped.map((i) => i.id)).toEqual([weakGun.id]);
    expect(bagItems(state).map((i) => i.id)).toEqual([bestGun.id]);
  });

  it("keeps every weapon while the hero is still on his starting kit", () => {
    const state = startGame();
    // ilvl 1 in the hand: he has climbed nowhere, so nothing he is carrying is
    // far enough behind him to be trash — including the third pistol.
    state.players[0].level = 90;
    state.players[0].equipment.weapon = weapon("test_wrench", "regular", 1);
    const a = weapon("test_pistol", "regular", 1);
    const b = weapon("test_pistol", "regular", 1);
    stock(state, [a, b]);

    expect(scrapInferiorLoot(state, state.players[0])).toEqual([]);
    expect(bagItems(state).map((i) => i.id)).toEqual([a.id, b.id]);
  });

  it("keeps a spare the hero has not climbed far enough past", () => {
    const state = startGame();
    veteran(state);
    const backup = weapon("test_pistol", "regular", TRASH_ILVL);
    // One item level inside the margin — a spare, not junk.
    const nearlyJunk = weapon("test_pistol", "regular", TRASH_ILVL + 1);
    stock(state, [backup, nearlyJunk]);

    expect(scrapInferiorLoot(state, state.players[0])).toEqual([]);
    expect(bagItems(state)).toHaveLength(2);
  });

  it("keeps a gear piece bound for an empty slot", () => {
    const state = startGame();
    state.players[0].equipment.amulet = null;
    const amulet = gear("test_amulet", "amulet");
    stock(state, [amulet]);

    expect(scrapInferiorLoot(state, state.players[0])).toEqual([]);
    expect(bagItems(state).map((i) => i.id)).toEqual([amulet.id]);
  });

  it("scraps a gear piece worse than what's worn in its slot", () => {
    const state = startGame();
    // A roomy bag worn (5 cells → score 50); a smaller bag banked (2 → 20).
    state.players[0].equipment.offhand = gear("test_big_bag", "bag");
    const smallBag = gear("test_bag", "bag");
    stock(state, [smallBag]);

    const scrapped = scrapInferiorLoot(state, state.players[0]);

    expect(scrapped.map((i) => i.id)).toEqual([smallBag.id]);
    expect(bagItems(state)).toHaveLength(0);
  });

  it("keeps a gear side-grade of equal worth to what's worn", () => {
    const state = startGame();
    // Same amulet def worn and banked: equal worth is not "worse than", so the
    // spare is spared.
    state.players[0].equipment.amulet = gear("test_amulet", "amulet");
    const sideGrade = gear("test_amulet", "amulet");
    stock(state, [sideGrade]);

    expect(scrapInferiorLoot(state, state.players[0])).toEqual([]);
    expect(bagItems(state).map((i) => i.id)).toEqual([sideGrade.id]);
  });

  it("spares special items even when they are inferior", () => {
    const state = startGame();
    veteran(state);
    // A passive trinket (test_chip) and a unique/legendary weapon: both worse
    // than / unrelated to the worn wrench, both kept. The unique gun is also
    // the class backup, so the plain one behind it is the only cell the sweep
    // may take.
    const trinket = gear("test_chip", "trinket");
    const uniqueBlade = weapon("test_pistol", "unique", TRASH_ILVL);
    const legendaryBlade = weapon("test_pistol", "legendary", TRASH_ILVL);
    const plainJunk = weapon("test_pistol", "regular", TRASH_ILVL);
    stock(state, [trinket, uniqueBlade, legendaryBlade, plainJunk]);

    const scrapped = scrapInferiorLoot(state, state.players[0]);

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
    expect(isSpecialItem(gear("test_chip", "trinket"))).toBe(true);
    expect(isSpecialItem(weapon("test_pistol"))).toBe(false);
    expect(isSpecialItem(gear("test_charm", "trinket"))).toBe(false);
  });

  it("isScrappableLoot reads OUTGROWN — what the counter would buy, not what the bin takes", () => {
    const state = startGame();
    state.players[0].equipment.weapon = weapon("test_wrench");
    const junk = weapon("test_pistol");
    const keeper = weapon("test_hammer"); // higher damage → out-scores wrench
    stock(state, [junk, keeper]);
    const hero = state.players[0];

    // The pistol IS outgrown — a sell run puts it on the counter…
    expect(isScrappableLoot(state, hero, junk)).toBe(true);
    expect(isScrappableLoot(state, hero, keeper)).toBe(false);
    // …but it is the hero's only gun and he has climbed nowhere past it, so the
    // TRASH sweep leaves it alone. Selling happens at a stall full of
    // replacements; trashing happens mid-level and cannot be undone.
    expect(isTrashLoot(state, hero, junk)).toBe(false);
    expect(isTrashLoot(state, hero, keeper)).toBe(false);
  });

  it("isTrashLoot agrees with the sweep it drives", () => {
    const state = startGame();
    veteran(state);
    const backup = weapon("test_pistol", "regular", TRASH_ILVL);
    const junk = weapon("test_pistol", "regular", TRASH_ILVL);
    const keeper = weapon("test_hammer", "regular", TRASH_ILVL); // out-scores the wrench
    stock(state, [backup, junk, keeper]);
    const hero = state.players[0];

    expect(isTrashLoot(state, hero, junk)).toBe(true);
    expect(isTrashLoot(state, hero, backup)).toBe(false);
    expect(isTrashLoot(state, hero, keeper)).toBe(false);
    expect(scrapInferiorLoot(state, hero).map((i) => i.id)).toEqual([junk.id]);
  });

  it("is a no-op on a bag of keepers", () => {
    const state = startGame();
    state.players[0].equipment.weapon = weapon("test_pistol");
    const upgrade = weapon("test_hammer");
    const trinket = gear("test_chip", "trinket");
    stock(state, [upgrade, trinket]);

    expect(scrapInferiorLoot(state, state.players[0])).toEqual([]);
    expect(bagItems(state)).toHaveLength(2);
  });
});
