// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The CROWD half of weapon worth: `weaponRankTargets` (how many foes one
// attack really lands on), `weaponBaseTargets` (the same on the weapon's
// printed geometry, before any stat widens it) and `weaponEffectiveDps` (the
// per-target figure across that crowd). Auto-equip ranks by these, and the
// item card shows them, so a swap onto a lower-DPS cleaver has a number behind
// it on screen. Runs on the synthetic fixtures so it survives content churn.

import { describe, expect, it } from "vitest";

import {
  weaponBaseTargets,
  weaponDps,
  weaponEffectiveDps,
  weaponRankTargets,
  weaponScore,
} from "@game/core";
import type { Equipment, GameState } from "@game/core";

import { startGame } from "./helpers.ts";

let nextId = 5000;

function weapon(defId: string): Equipment {
  return {
    id: nextId++,
    defId,
    slot: "weapon",
    tier: "regular",
    ilvl: 1,
    affixes: [],
  };
}

/** A hero built the way a melee player builds one: deep STRENGTH for the
 * swing's reach, enough INTELLIGENCE that the cleave CAP never binds. */
function meleeBuild(state: GameState): void {
  const hero = state.players[0];
  hero.level = 12;
  hero.stats.strength = 25;
  hero.stats.dexterity = 20;
  hero.stats.intelligence = 6;
}

describe("weaponRankTargets", () => {
  it("credits a wide, long two-hander more of the crowd than a narrow blade", () => {
    const state = startGame();
    meleeBuild(state);
    const hero = state.players[0];
    const narrow = weaponRankTargets(state, hero, weapon("crude_sword"));
    const wide = weaponRankTargets(state, hero, weapon("test_greatsword"));
    expect(narrow).toBeGreaterThan(1);
    expect(wide).toBeGreaterThan(narrow);
  });

  it("credits a single-projectile ranged weapon exactly one foe", () => {
    const state = startGame();
    meleeBuild(state);
    expect(weaponRankTargets(state, state.players[0], weapon("blaster"))).toBe(
      1,
    );
  });

  it("is the crowd factor between per-target DPS and the auto-equip score", () => {
    const state = startGame();
    meleeBuild(state);
    const hero = state.players[0];
    const sword = weapon("test_greatsword");
    // The card's EFFECTIVE DPS is exactly per-target DPS across that crowd, so
    // the number a player reads is the number the ranking is built from.
    expect(weaponEffectiveDps(state, hero, sword)).toBeCloseTo(
      weaponDps(state, hero, sword) * weaponRankTargets(state, hero, sword),
      6,
    );
    // …and the score is that effective DPS times the ranking's PREFERENCES
    // (lane affinity, armor pen), never less.
    expect(weaponScore(state, hero, sword)).toBeGreaterThanOrEqual(
      weaponEffectiveDps(state, hero, sword) - 1e-6,
    );
  });

  it("explains a swap onto a lower-DPS cleaver", () => {
    const state = startGame();
    meleeBuild(state);
    const hero = state.players[0];
    const sword = weapon("test_greatsword");
    const gun = weapon("test_revolver");
    // The complaint this suite exists for: the card's per-target DPS says the
    // gun wins while auto-equip takes the sword. EFFECTIVE DPS is the missing
    // number, and it agrees with the swap.
    expect(weaponDps(state, hero, gun)).toBeGreaterThan(
      weaponDps(state, hero, sword),
    );
    expect(weaponEffectiveDps(state, hero, sword)).toBeGreaterThan(
      weaponEffectiveDps(state, hero, gun),
    );
    expect(weaponScore(state, hero, sword)).toBeGreaterThan(
      weaponScore(state, hero, gun),
    );
  });
});

describe("weaponBaseTargets", () => {
  it("reads the weapon's printed geometry, so the hero's build is the lift", () => {
    const state = startGame();
    const hero = state.players[0];
    const sword = weapon("test_greatsword");
    const printed = weaponBaseTargets(sword);
    // A fresh hero has nothing invested, so what he swings IS what is printed.
    expect(weaponRankTargets(state, hero, sword)).toBeCloseTo(printed, 6);
    // STRENGTH lengthens the swing and INTELLIGENCE widens it, so the same
    // weapon threads more of the horde — the blue `+N` the card shows.
    meleeBuild(state);
    expect(weaponRankTargets(state, hero, sword)).toBeGreaterThan(printed);
  });

  it("is fixed for a ranged weapon, whose crowd is its own physics", () => {
    const state = startGame();
    const hero = state.players[0];
    const scattergun = weapon("test_scattergun");
    const printed = weaponBaseTargets(scattergun);
    expect(printed).toBeGreaterThan(1);
    meleeBuild(state);
    expect(weaponRankTargets(state, hero, scattergun)).toBeCloseTo(printed, 6);
  });
});
