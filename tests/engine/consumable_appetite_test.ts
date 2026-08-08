// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The drop ladder's APPETITE gate (`medkitAppetite` / `consumableAppetite`,
// applied in loot.ts): a stacked consumable's slice is bent by SUPPLY (fading
// as its pouch fills, down to a floor — a pickup the stack refuses mostly lies
// on the field, but one on the GROUND is still strategic bait) times NEED (a
// gentle lean as the pool it refills drains). Exercised on synthetic fixtures
// so the rule survives content deletion.

import { describe, expect, it } from "vitest";

import { CONSUMABLES, MEDKIT } from "@game/core";
import type { GameState } from "@game/core";
// Engine-internal: the kill funnel every drop walks through, and the two
// appetite reads the ladder scales its consumable slices by.
import { hitEnemy } from "../../engine/game/loot.ts";
import {
  consumableAppetite,
  medkitAppetite,
} from "../../engine/game/items/consumables.ts";

import { makeEnemy, startGame } from "./helpers.ts";

/** A mob level deep enough that every medkit tier has unlocked. */
const DEEP_MLVL = 99;

/** Kill `count` one-hp minions and tally what landed on the ground, by kind.
 *
 * `pin` runs before every kill: a tally this long dings the hero many times
 * over, and a level-up refills hp AND stamina — so a suite measuring a hurt or
 * winded hero must re-stage him each iteration or he silently heals into the
 * healthy case. The pouches need no pinning (nothing banks them here — the
 * pickup pass is `stepItems`, which this never runs). */
function tallyDrops(
  state: GameState,
  count: number,
  pin?: (s: GameState) => void,
): Record<string, number> {
  const tally: Record<string, number> = {};
  for (let k = 0; k < count; k++) {
    state.items = [];
    pin?.(state);
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
  state.players[0].hp = state.players[0].maxHp;
  state.players[0].stamina = state.players[0].maxStamina;
  // The all-clear pity rule forces equipment when the level's guaranteed
  // minimum is unmet — book it as already paid so the ladder rolls freely.
  state.minionEquipmentDrops = 99;
  return state;
}

describe("consumable appetite — supply", () => {
  it("pays the full rate while the pouch has real room", () => {
    const state = stagedRun();
    expect(consumableAppetite(state, state.players[0], "drink")).toBe(1);
    expect(medkitAppetite(state, state.players[0], DEEP_MLVL)).toBe(1);

    // Up to `appetiteStart` of the stack the rain is untouched.
    state.players[0].staminaPotions = Math.floor(
      CONSUMABLES.stackCap * CONSUMABLES.appetiteStart,
    );
    expect(consumableAppetite(state, state.players[0], "drink")).toBe(1);
  });

  it("fades over the top of the stack, bottoming out at the floor", () => {
    const state = stagedRun();
    const cap = CONSUMABLES.stackCap;

    state.players[0].staminaPotions = cap - 1;
    const nearlyFull = consumableAppetite(state, state.players[0], "drink");
    expect(nearlyFull).toBeGreaterThan(CONSUMABLES.appetiteFloor);
    expect(nearlyFull).toBeLessThan(1);

    // A full pouch keeps the FLOOR, never zero — a drop it can't bank is still
    // ground bait worth planning a dive (or a sprint) around.
    state.players[0].staminaPotions = cap;
    expect(consumableAppetite(state, state.players[0], "drink")).toBe(
      CONSUMABLES.appetiteFloor,
    );
    state.players[0].repairKits = cap;
    expect(consumableAppetite(state, state.players[0], "repair")).toBe(
      CONSUMABLES.appetiteFloor,
    );
  });

  it("weighs the medkit pouch by the tiers a kill could actually pay", () => {
    const state = stagedRun();
    const top = MEDKIT.tiers.length - 1;

    // A full LIGHT stack is irrelevant to a deep kill — it pays the top two
    // qualities, and both of those stacks are empty.
    state.players[0].medkits[0] = CONSUMABLES.stackCap;
    expect(medkitAppetite(state, state.players[0], DEEP_MLVL)).toBe(1);

    // A full TOP stack, on the other hand, kills most of the appetite even
    // with the tier under it empty: three drops in four would be refused.
    state.players[0].medkits[0] = 0;
    state.players[0].medkits[top] = CONSUMABLES.stackCap;
    const topFull = medkitAppetite(state, state.players[0], DEEP_MLVL);
    expect(topFull).toBeGreaterThan(CONSUMABLES.appetiteFloor);
    expect(topFull).toBeLessThan(0.6);

    // Every droppable stack full: down to the bait floor.
    state.players[0].medkits[top - 1] = CONSUMABLES.stackCap;
    expect(medkitAppetite(state, state.players[0], DEEP_MLVL)).toBe(
      CONSUMABLES.appetiteFloor,
    );
  });

  it("reads only the one unlocked stack in the opening game", () => {
    const state = stagedRun();
    // Below every tier gate but the first, only LIGHT kits drop — so a full
    // LIGHT stack alone takes the slice to its floor.
    state.players[0].medkits[0] = CONSUMABLES.stackCap;
    expect(medkitAppetite(state, state.players[0], 1)).toBe(
      CONSUMABLES.appetiteFloor,
    );
  });
});

describe("consumable appetite — need", () => {
  it("leans the medkit slice up as health drops", () => {
    const full = stagedRun();
    const hurt = stagedRun();
    hurt.players[0].hp = hurt.players[0].maxHp / 2;
    const dying = stagedRun();
    dying.players[0].hp = 1;

    expect(medkitAppetite(hurt, hurt.players[0], DEEP_MLVL)).toBeGreaterThan(
      medkitAppetite(full, full.players[0], DEEP_MLVL),
    );
    expect(medkitAppetite(dying, dying.players[0], DEEP_MLVL)).toBeGreaterThan(
      medkitAppetite(hurt, hurt.players[0], DEEP_MLVL),
    );
    // A gentle lean, not a mercy rope: a bone-dry pool pays at most the
    // configured bonus on top.
    expect(
      medkitAppetite(dying, dying.players[0], DEEP_MLVL),
    ).toBeLessThanOrEqual(1 + CONSUMABLES.appetiteNeedBonus);
  });

  it("leans the drink slice up as the sprint pool drains", () => {
    const rested = stagedRun();
    const winded = stagedRun();
    winded.players[0].stamina = 0;
    expect(
      consumableAppetite(winded, winded.players[0], "drink"),
    ).toBeGreaterThan(consumableAppetite(rested, rested.players[0], "drink"));
  });

  it("leans the repair slice up as the kit wears down", () => {
    const pristine = stagedRun();
    const worn = stagedRun();
    const weapon = worn.players[0].equipment.weapon;
    if (weapon.durability !== undefined) weapon.durability = 1;
    expect(consumableAppetite(worn, worn.players[0], "repair")).toBeGreaterThan(
      consumableAppetite(pristine, pristine.players[0], "repair"),
    );
  });

  it("still leans on need with the pouch full — the floor is a floor", () => {
    const state = stagedRun();
    state.players[0].staminaPotions = CONSUMABLES.stackCap;
    const rested = consumableAppetite(state, state.players[0], "drink");
    state.players[0].stamina = 0;
    expect(
      consumableAppetite(state, state.players[0], "drink"),
    ).toBeGreaterThan(rested);
  });
});

describe("consumable appetite — the drop ladder", () => {
  it("rains medkits and drinks on a hero with empty pouches", () => {
    const drops = tallyDrops(stagedRun(), 3000);
    expect(drops.medkit ?? 0).toBeGreaterThan(0);
    expect(drops.drink ?? 0).toBeGreaterThan(0);
  });

  it("thins medkits to a trickle on a full pouch without stopping them", () => {
    const empty = stagedRun();
    const stuffed = stagedRun();
    for (let i = 0; i < MEDKIT.tiers.length; i++) {
      stuffed.players[0].medkits[i] = CONSUMABLES.stackCap;
    }
    const full = tallyDrops(stuffed, 12000);
    // Still SOME — a grounded kit is bait a player can plan a dive around.
    expect(full.medkit ?? 0).toBeGreaterThan(0);
    expect(full.medkit ?? 0).toBeLessThan(tallyDrops(empty, 12000).medkit ?? 0);
    // The rest of the ladder is untouched — only the medkit slice narrowed.
    expect(full.equipment ?? 0).toBeGreaterThan(0);
    expect(full.drink ?? 0).toBeGreaterThan(0);
  });

  it("thins drinks and repair kits the same way on a full stack", () => {
    const empty = stagedRun();
    const stuffed = stagedRun();
    stuffed.players[0].staminaPotions = CONSUMABLES.stackCap;
    stuffed.players[0].repairKits = CONSUMABLES.stackCap;
    const full = tallyDrops(stuffed, 12000);
    const bare = tallyDrops(empty, 12000);
    expect(full.drink ?? 0).toBeGreaterThan(0);
    expect(full.drink ?? 0).toBeLessThan(bare.drink ?? 0);
    expect(full.repair ?? 0).toBeLessThan(bare.repair ?? 0);
  });

  it("keeps raining medkits for a hero who SPENDS them", () => {
    // The whole point of the gate: it thins a hoard, not the supply. A pouch
    // held at the appetite mark sees the authored rate.
    const stocked = stagedRun();
    stocked.players[0].medkits[MEDKIT.tiers.length - 1] = 1;
    const hoarder = stagedRun();
    for (let i = 0; i < MEDKIT.tiers.length; i++) {
      hoarder.players[0].medkits[i] = CONSUMABLES.stackCap - 1;
    }
    expect(tallyDrops(stocked, 6000).medkit ?? 0).toBeGreaterThan(
      tallyDrops(hoarder, 6000).medkit ?? 0,
    );
  });

  it("rains more medkits on a hurt hero than a healthy one", () => {
    const hurt = (s: GameState) => {
      s.players[0].hp = 1; // the need lean and the mercy ramp, pulling together
    };
    expect(tallyDrops(stagedRun(), 12000, hurt).medkit ?? 0).toBeGreaterThan(
      tallyDrops(stagedRun(), 12000).medkit ?? 0,
    );
  });

  it("keeps every band alive when the boosts run widest", () => {
    // A hero who is dying, winded, on a near-broken weapon AND carrying
    // nothing: every boost and lean is maxed at once. The cumulative ladder
    // must still fit under one roll, so the drink and arrow bands below the
    // widened medkit slice keep firing.
    const drops = tallyDrops(stagedRun(), 12000, (s) => {
      s.players[0].hp = 1;
      s.players[0].stamina = 0;
      const weapon = s.players[0].equipment.weapon;
      if (weapon.durability !== undefined) weapon.durability = 1;
    });
    expect(drops.medkit ?? 0).toBeGreaterThan(0);
    expect(drops.drink ?? 0).toBeGreaterThan(0);
    expect(drops.repair ?? 0).toBeGreaterThan(0);
    expect(drops.xp ?? 0).toBeGreaterThan(0);
  });
});
