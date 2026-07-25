// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The drop ladder's APPETITE gate (`medkitAppetite` / `consumableAppetite`,
// applied in loot.ts): a stacked consumable's slice fades as its pouch fills
// and CLOSES at a full stack, because a pickup the stack refuses just lies on
// the field forever. Exercised on synthetic fixtures so the rule survives
// content deletion.

import { describe, expect, it } from "vitest";

import { CONSUMABLES, MEDKIT } from "@game/core";
import type { GameState } from "@game/core";
// Engine-internal: the kill funnel every drop walks through, and the two
// appetite reads the ladder scales its consumable slices by.
import { hitEnemy } from "../../src/game/loot.ts";
import {
  consumableAppetite,
  medkitAppetite,
} from "../../src/game/items/consumables.ts";

import { makeEnemy, startGame } from "./helpers.ts";

/** A mob level deep enough that every medkit tier has unlocked. */
const DEEP_MLVL = 99;

/** Kill `count` one-hp minions and tally what landed on the ground, by kind.
 * The hero is parked at full hp and full stamina so no mercy rope fires — this
 * measures the ORDINARY rain only. */
function tallyDrops(state: GameState, count: number): Record<string, number> {
  const tally: Record<string, number> = {};
  for (let k = 0; k < count; k++) {
    state.items = [];
    const mob = makeEnemy(
      { pos: { x: 500, y: 500 }, hp: 1, maxHp: 1, mlvl: DEEP_MLVL },
      "test_minion",
    );
    mob.powerScaled = true; // keep the staged mlvl — no re-stamp on engage
    state.enemies = [mob];
    hitEnemy(state, mob, 1);
    for (const item of state.items) {
      tally[item.kind] = (tally[item.kind] ?? 0) + 1;
    }
  }
  return tally;
}

/** A run staged for a drop tally: healthy, rested, pity rule already satisfied
 * (so no forced equipment), and nothing on the field. */
function stagedRun(): GameState {
  const state = startGame(1234);
  state.enemies = [];
  state.items = [];
  state.player.hp = state.player.maxHp;
  state.player.stamina = state.player.maxStamina;
  // The all-clear pity rule forces equipment when the level's guaranteed
  // minimum is unmet — book it as already paid so the ladder rolls freely.
  state.minionEquipmentDrops = 99;
  return state;
}

describe("consumable appetite — the ramp", () => {
  it("pays the full rate while the pouch has real room", () => {
    const state = stagedRun();
    expect(consumableAppetite(state, "drink")).toBe(1);
    expect(medkitAppetite(state, DEEP_MLVL)).toBe(1);

    // Up to `appetiteStart` of the stack the rain is untouched.
    state.player.staminaPotions = Math.floor(
      CONSUMABLES.stackCap * CONSUMABLES.appetiteStart,
    );
    expect(consumableAppetite(state, "drink")).toBe(1);
  });

  it("fades over the top of the stack and closes at full", () => {
    const state = stagedRun();
    const cap = CONSUMABLES.stackCap;

    state.player.staminaPotions = cap - 1;
    const nearlyFull = consumableAppetite(state, "drink");
    expect(nearlyFull).toBeGreaterThan(0);
    expect(nearlyFull).toBeLessThan(1);

    state.player.staminaPotions = cap;
    expect(consumableAppetite(state, "drink")).toBe(0);
    state.player.repairKits = cap;
    expect(consumableAppetite(state, "repair")).toBe(0);
  });

  it("weighs the medkit pouch by the tiers a kill could actually pay", () => {
    const state = stagedRun();
    const top = MEDKIT.tiers.length - 1;

    // A full LIGHT stack is irrelevant to a deep kill — it pays the top two
    // qualities, and both of those stacks are empty.
    state.player.medkits[0] = CONSUMABLES.stackCap;
    expect(medkitAppetite(state, DEEP_MLVL)).toBe(1);

    // A full TOP stack, on the other hand, kills most of the appetite even
    // with the tier under it empty: three drops in four would be refused.
    state.player.medkits[0] = 0;
    state.player.medkits[top] = CONSUMABLES.stackCap;
    const topFull = medkitAppetite(state, DEEP_MLVL);
    expect(topFull).toBeGreaterThan(0);
    expect(topFull).toBeLessThan(0.5);

    // Every droppable stack full: nothing this kill pays could be banked.
    state.player.medkits[top - 1] = CONSUMABLES.stackCap;
    expect(medkitAppetite(state, DEEP_MLVL)).toBe(0);
  });

  it("reads only the one unlocked stack in the opening game", () => {
    const state = stagedRun();
    // Below every tier gate but the first, only LIGHT kits drop — so a full
    // LIGHT stack closes the slice outright.
    state.player.medkits[0] = CONSUMABLES.stackCap;
    expect(medkitAppetite(state, 1)).toBe(0);
  });
});

describe("consumable appetite — the drop ladder", () => {
  it("rains medkits and drinks on a hero with empty pouches", () => {
    const drops = tallyDrops(stagedRun(), 3000);
    expect(drops.medkit ?? 0).toBeGreaterThan(0);
    expect(drops.drink ?? 0).toBeGreaterThan(0);
  });

  it("never drops a medkit the full pouch would refuse", () => {
    const state = stagedRun();
    for (let i = 0; i < MEDKIT.tiers.length; i++) {
      state.player.medkits[i] = CONSUMABLES.stackCap;
    }
    const drops = tallyDrops(state, 3000);
    expect(drops.medkit ?? 0).toBe(0);
    // The rest of the ladder is untouched — only the dead slice closed.
    expect(drops.equipment ?? 0).toBeGreaterThan(0);
    expect(drops.drink ?? 0).toBeGreaterThan(0);
  });

  it("never drops a drink or repair kit a full stack would refuse", () => {
    const state = stagedRun();
    state.player.staminaPotions = CONSUMABLES.stackCap;
    state.player.repairKits = CONSUMABLES.stackCap;
    const drops = tallyDrops(state, 3000);
    expect(drops.drink ?? 0).toBe(0);
    expect(drops.repair ?? 0).toBe(0);
    expect(drops.medkit ?? 0).toBeGreaterThan(0);
  });

  it("keeps raining medkits for a hero who SPENDS them", () => {
    // The whole point of the gate: it thins a hoard, not the supply. A pouch
    // held at the appetite mark sees the authored rate.
    const stocked = stagedRun();
    stocked.player.medkits[MEDKIT.tiers.length - 1] = 1;
    const hoarder = stagedRun();
    for (let i = 0; i < MEDKIT.tiers.length; i++) {
      hoarder.player.medkits[i] = CONSUMABLES.stackCap - 1;
    }
    expect(tallyDrops(stocked, 3000).medkit ?? 0).toBeGreaterThan(
      tallyDrops(hoarder, 3000).medkit ?? 0,
    );
  });
});
