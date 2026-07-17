// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// ARTIFACT MELEE AFFINITY (STATS.artifactMeleeDamagePerPiece, applied in
// weaponDamageFor): the endgame payoff that lets the MELEE lane take over once
// the hero is decked in artifact-tier relics. Every worn artifact piece
// multiplies a MELEE weapon's damage; a mage in artifact armor gets nothing, so
// it rewards actually swinging the relics.

import { describe, expect, it } from "vitest";

import { STATS, weaponDamageFor, type Equipment } from "@game/core";
import { startGame } from "./helpers.ts";

// A worn gear piece at a chosen tier — enough shape for weaponDamageFor's
// artifact count (it only reads `.tier`).
function gear(slot: Equipment["slot"], tier: Equipment["tier"]): Equipment {
  return { id: 1, defId: "test_helmet", slot, tier, ilvl: 99, affixes: [] };
}
function weapon(
  defId: string,
  tier: Equipment["tier"] = "artifact",
): Equipment {
  return {
    id: 2,
    defId,
    slot: "weapon",
    tier,
    ilvl: 99,
    affixes: [],
    durability: 50,
  };
}

describe("artifact melee affinity", () => {
  it("scales a MELEE weapon's damage by the count of worn artifact pieces", () => {
    const state = startGame();
    const melee = weapon("test_hammer");
    state.player.equipment.weapon = melee;

    // Weapon itself is an artifact = 1 piece.
    const one = weaponDamageFor(state, melee);

    // Add three artifact armour pieces → four artifact pieces total.
    state.player.equipment.head = gear("head", "artifact");
    state.player.equipment.chest = gear("chest", "artifact");
    state.player.equipment.legs = gear("legs", "artifact");
    const four = weaponDamageFor(state, melee);

    // Damage rises by the affinity per added piece: (1 + 4x) / (1 + 1x).
    const x = STATS.artifactMeleeDamagePerPiece;
    expect(four / one).toBeCloseTo((1 + 4 * x) / (1 + 1 * x), 5);
    // And it is a real, large endgame lift — more relics, harder swing.
    expect(four).toBeGreaterThan(one);
  });

  it("does NOT touch a non-melee weapon, even in full artifact armour", () => {
    const state = startGame();
    const wand = weapon("test_wand"); // magic
    state.player.equipment.weapon = wand;
    const bare = weaponDamageFor(state, wand);

    state.player.equipment.head = gear("head", "artifact");
    state.player.equipment.chest = gear("chest", "artifact");
    state.player.equipment.legs = gear("legs", "artifact");
    state.player.equipment.feet = gear("feet", "artifact");
    // A mage draped in relics swings its wand for exactly the same — no affinity.
    expect(weaponDamageFor(state, wand)).toBeCloseTo(bare, 5);
  });

  it("ignores non-artifact gear — a melee weapon in rares gets no bonus", () => {
    const state = startGame();
    const melee = weapon("test_hammer", "rare"); // not an artifact weapon
    state.player.equipment.weapon = melee;
    const bare = weaponDamageFor(state, melee);

    state.player.equipment.head = gear("head", "legendary");
    state.player.equipment.chest = gear("chest", "rare");
    // No artifact pieces worn → damage unchanged.
    expect(weaponDamageFor(state, melee)).toBeCloseTo(bare, 5);
  });
});
