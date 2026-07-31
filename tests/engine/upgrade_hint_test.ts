// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// `wouldUpgradeSlot`: the pickup card's "is this an upgrade?" probe. Unlike
// `isBetterEquipment` (the auto-equip rule), it keeps the level gate but drops
// the passive-trinket and equal-durability exclusions, so a stronger passive
// still reads as an upgrade the player can act on with a tap. It ranks gear by
// the SPEC-AWARE score (`specGearScore`), so an off-spec +STAT find no longer
// reads as an upgrade (and so the pickup card no longer offers a tap-to-equip
// for it — non-upgrades are non-interactive).

import { describe, expect, it } from "vitest";

import type { Affix, GameState, StatName } from "@game/core";
import { wouldUpgradeSlot, type Equipment } from "@game/core";
import { clearStage, idle, run, startGame } from "./helpers.ts";

/** Mint a fixture weapon instance at a chosen tier/ilvl. */
function weapon(id: number, defId: string): Equipment {
  return { id, defId, slot: "weapon", tier: "regular", ilvl: 1, affixes: [] };
}

/** Mint a fixture gear instance in its natural slot, with optional affixes. */
function gear(
  id: number,
  defId: string,
  slot: Equipment["slot"],
  affixes: Affix[] = [],
): Equipment {
  return { id, defId, slot, tier: "regular", ilvl: 1, affixes };
}

/** A flat `+value STAT` affix — the roll the spec-weighting reads. */
function statAffix(stat: StatName, value: number): Affix {
  return { kind: "stat", stat, value };
}

/** Bias the hero's ALLOCATED stats toward `stat` (the spec the upgrade read
 * weights by), leaving the rest at a low floor. */
function specInto(state: GameState, stat: StatName): void {
  for (const s of Object.keys(state.players[0].stats) as StatName[]) {
    state.players[0].stats[s] = 1;
  }
  state.players[0].stats[stat] = 30;
}

describe("wouldUpgradeSlot", () => {
  it("flags a stronger weapon as an upgrade over the worn one", () => {
    const state = startGame();
    // The medium starter is `crude_sword` (damage 20); `test_hammer` (34) is a
    // clear firepower upgrade.
    expect(state.players[0].equipment.weapon.defId).toBe("crude_sword");
    expect(wouldUpgradeSlot(state, weapon(1, "test_hammer"))).toBe(true);
  });

  it("does not flag a weaker weapon as an upgrade", () => {
    const state = startGame();
    // Wear the heavy `test_hammer` (damage 34), then the puny `blaster`
    // (damage 8) is a clear downgrade — no upgrade to tap.
    state.players[0].equipment.weapon = weapon(1, "test_hammer");
    expect(wouldUpgradeSlot(state, weapon(2, "blaster"))).toBe(false);
  });

  it("flags a passive trinket the auto-equip rule leaves in the bag", () => {
    const state = startGame();
    // `test_chip` is a passive trinket: never worn at all (it pays out from
    // the bag), so it always banks — yet it is still worth KEEPING, and the
    // card says so rather than reading as junk.
    expect(wouldUpgradeSlot(state, gear(1, "test_chip", "trinket"))).toBe(true);
  });

  it("an empty non-weapon slot is always an upgrade to fill", () => {
    const state = startGame();
    expect(state.players[0].equipment.chest).toBeNull();
    expect(wouldUpgradeSlot(state, gear(1, "test_vest", "chest"))).toBe(true);
  });

  it("weighs a +STAT find by the hero's spec", () => {
    const state = startGame();
    specInto(state, "intelligence"); // a caster
    // Wear an amulet rolling +5 STRENGTH — dead weight for a caster.
    state.players[0].equipment.amulet = gear(1, "test_amulet", "amulet", [
      statAffix("strength", 5),
    ]);
    // Same base, same-size roll, but into INTELLECT — the caster's stat: an
    // upgrade FOR HIS SPEC even though the raw point totals tie.
    const intAmulet = gear(2, "test_amulet", "amulet", [
      statAffix("intelligence", 5),
    ]);
    expect(wouldUpgradeSlot(state, intAmulet)).toBe(true);
    // The mirror: swapping the worn INT amulet for the same-size STR one is a
    // downgrade for this spec, so it flags neither upgrade nor tap.
    state.players[0].equipment.amulet = intAmulet;
    const strAmulet = gear(3, "test_amulet", "amulet", [
      statAffix("strength", 5),
    ]);
    expect(wouldUpgradeSlot(state, strAmulet)).toBe(false);
  });
});

/** Drop `item` under the hero and step once so `stepItems` picks it up. */
function dropAndPickUp(state: GameState, item: Equipment) {
  clearStage(state);
  state.items.push({
    id: state.nextId++,
    kind: "equipment",
    pos: { ...state.players[0].pos },
    equipment: item,
  });
  run(state, idle, 1);
  return state.events.find(
    (e) => e.type === "itemCollected" && e.kind === "equipment",
  );
}

describe("itemCollected event — pickup-card fields", () => {
  it("an auto-equipped upgrade is flagged equipped + upgrade with its id", () => {
    const state = startGame();
    const hammer = weapon(4242, "test_hammer"); // damage 34 > starter's 20
    const event = dropAndPickUp(state, hammer);
    expect(event).toMatchObject({
      type: "itemCollected",
      kind: "equipment",
      itemId: 4242,
      equipped: true,
      upgrade: true,
    });
    // It really was worn on the spot.
    expect(state.players[0].equipment.weapon.id).toBe(4242);
  });

  it("a weaker bagged find is flagged not-equipped, not-upgrade, with its id", () => {
    const state = startGame();
    // Wear the hammer so the puny blaster we drop is a downgrade that banks.
    state.players[0].equipment.weapon = weapon(1, "test_hammer");
    const blaster = weapon(4343, "blaster"); // damage 8 < hammer's 34
    const event = dropAndPickUp(state, blaster);
    expect(event).toMatchObject({
      type: "itemCollected",
      kind: "equipment",
      itemId: 4343,
      equipped: false,
      upgrade: false,
    });
    // It banked; the hammer still holds the weapon slot.
    expect(state.players[0].equipment.weapon.id).toBe(1);
    expect(state.players[0].inventory.some((it) => it?.id === 4343)).toBe(true);
  });

  it("a passive trinket banks but is still flagged worth keeping", () => {
    const state = startGame();
    // A passive trinket is never worn, so it banks — and the card still marks
    // it, because a carried trinket is working the moment it lands.
    const chip = gear(4444, "test_chip", "trinket");
    const event = dropAndPickUp(state, chip);
    expect(event).toMatchObject({
      type: "itemCollected",
      kind: "equipment",
      itemId: 4444,
      equipped: false,
      upgrade: true,
    });
    expect(state.players[0].inventory.some((it) => it?.id === 4444)).toBe(true);
  });
});
