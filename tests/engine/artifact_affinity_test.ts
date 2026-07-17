// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// ARTIFACT AFFINITY (STATS.artifactDamagePerPieceByClass, applied in
// weaponDamageFor): the endgame payoff that decides the CLASS ORDER once the
// hero is decked in artifact-tier relics. Every worn artifact piece multiplies
// the HELD weapon's damage by its class's rate, ordered melee > ranged > magic,
// so as relics pile up the endgame settles into that order. Counts any artifact
// (the common relics + the shared armor), so the order emerges from a couple of
// ordinary drops.

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

// Damage multiple from worn artifacts for a weapon of the given class: mint the
// weapon + `armor` artifact armour pieces and read the lift over the bare hero.
function artifactLift(defId: string, armor: number): number {
  const state = startGame();
  const w = weapon(defId);
  const slots = ["head", "chest", "legs", "feet"] as const;
  // Baseline: weapon is a rare (not an artifact) and no artifact armour.
  state.player.equipment.weapon = weapon(defId, "rare");
  const bare = weaponDamageFor(state, state.player.equipment.weapon);
  // Now the artifact weapon + N artifact armour pieces.
  state.player.equipment.weapon = w;
  for (let i = 0; i < armor && i < slots.length; i++) {
    state.player.equipment[slots[i]!] = gear(slots[i]!, "artifact");
  }
  return weaponDamageFor(state, w) / bare;
}

describe("artifact affinity", () => {
  it("orders the per-piece rates melee > ranged > magic", () => {
    const r = STATS.artifactDamagePerPieceByClass;
    expect(r.melee).toBeGreaterThan(r.ranged);
    expect(r.ranged).toBeGreaterThan(r.magic);
    expect(r.magic).toBe(0);
  });

  it("scales a MELEE weapon by the count of worn artifact pieces", () => {
    const state = startGame();
    const melee = weapon("test_hammer");
    state.player.equipment.weapon = melee;
    const one = weaponDamageFor(state, melee); // weapon = 1 artifact piece
    state.player.equipment.head = gear("head", "artifact");
    state.player.equipment.chest = gear("chest", "artifact");
    state.player.equipment.legs = gear("legs", "artifact");
    const four = weaponDamageFor(state, melee); // + 3 = 4 pieces
    const x = STATS.artifactDamagePerPieceByClass.melee;
    expect(four / one).toBeCloseTo((1 + 4 * x) / (1 + 1 * x), 5);
  });

  it("lifts a melee weapon MORE than a ranged one at the same artifact count", () => {
    // Same 1 weapon + 4 armour = 5 artifact pieces; melee's steeper rate wins.
    const meleeLift = artifactLift("test_hammer", 4);
    const rangedLift = artifactLift("test_pistol", 4);
    expect(meleeLift).toBeGreaterThan(rangedLift);
    // Ranged still gets a real lift (it must clear magic at the endgame).
    expect(rangedLift).toBeGreaterThan(1.5);
  });

  it("gives a MAGIC weapon nothing, even in full artifact armour", () => {
    const state = startGame();
    const wand = weapon("test_wand"); // magic, rate 0
    state.player.equipment.weapon = wand;
    const bare = weaponDamageFor(state, wand);
    state.player.equipment.head = gear("head", "artifact");
    state.player.equipment.chest = gear("chest", "artifact");
    state.player.equipment.legs = gear("legs", "artifact");
    state.player.equipment.feet = gear("feet", "artifact");
    expect(weaponDamageFor(state, wand)).toBeCloseTo(bare, 5);
  });

  it("ignores non-artifact gear — a melee weapon in rares gets no bonus", () => {
    const state = startGame();
    const melee = weapon("test_hammer", "rare");
    state.player.equipment.weapon = melee;
    const bare = weaponDamageFor(state, melee);
    state.player.equipment.head = gear("head", "legendary");
    state.player.equipment.chest = gear("chest", "rare");
    expect(weaponDamageFor(state, melee)).toBeCloseTo(bare, 5);
  });
});
