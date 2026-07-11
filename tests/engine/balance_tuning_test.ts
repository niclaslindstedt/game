// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The developer BALANCE TUNING multipliers (src/game/tuning.ts): runtime
// knobs over the shipped config, applied at each rule's one read site. The
// engine default is neutral (all 1); every test that turns a knob restores
// the defaults so ordering can't leak. Runs on synthetic fixtures.

import { afterEach, describe, expect, it } from "vitest";

import {
  BALANCE_TUNING_DEFAULTS,
  dropChance,
  getBalanceTuning,
  grantXp,
  hitEnemy,
  menaceSensitivity,
  resetBalanceTuning,
  rollEquipment,
  setBalanceTuning,
  step,
  weaponDamage,
} from "@game/core";
import type { GameState } from "@game/core";
import { clearStage, DT, idle, makeEnemy, run, startGame } from "./helpers.ts";

afterEach(() => resetBalanceTuning());

describe("balance tuning plumbing", () => {
  it("defaults to neutral multipliers", () => {
    expect(getBalanceTuning()).toEqual(BALANCE_TUNING_DEFAULTS);
  });

  it("clamps applied values and ignores garbage", () => {
    setBalanceTuning({ xpGain: 1000, mobHp: 0, mobDamage: Number.NaN });
    const tuning = getBalanceTuning();
    expect(tuning.xpGain).toBe(20); // clamped to the ceiling
    expect(tuning.mobHp).toBe(0.05); // clamped to the floor
    expect(tuning.mobDamage).toBe(1); // NaN never lands
    // A partial patch leaves the other knobs alone.
    expect(tuning.dropRate).toBe(1);
  });

  it("resets every knob to neutral", () => {
    setBalanceTuning({ xpGain: 2, hordeSize: 0.5 });
    resetBalanceTuning();
    expect(getBalanceTuning()).toEqual(BALANCE_TUNING_DEFAULTS);
  });
});

describe("xpGain", () => {
  it("scales every XP grant at the door", () => {
    const state = startGame();
    grantXp(state, 100);
    expect(state.stats.xpGained).toBe(100);

    setBalanceTuning({ xpGain: 2 });
    grantXp(state, 100);
    expect(state.stats.xpGained).toBe(300); // +200 for the same kill
  });
});

describe("playerDamage", () => {
  it("scales the hero's weapon damage", () => {
    const state = startGame();
    const base = weaponDamage(state);
    setBalanceTuning({ playerDamage: 2 });
    expect(weaponDamage(state)).toBeCloseTo(base * 2, 6);
  });
});

describe("mobHp", () => {
  it("toughens every spawned monster", () => {
    const plain = startGame();
    setBalanceTuning({ mobHp: 2 });
    const tough = startGame(); // same seed, same placed spawns
    expect(tough.enemies.length).toBe(plain.enemies.length);
    for (let i = 0; i < plain.enemies.length; i++) {
      const a = plain.enemies[i]!;
      const b = tough.enemies[i]!;
      // Doubled at the spawn chokepoint (rounding is inside the multiply).
      expect(b.maxHp).toBeGreaterThanOrEqual(a.maxHp * 2 - 1);
      expect(b.maxHp).toBeLessThanOrEqual(a.maxHp * 2 + 1);
    }
  });
});

describe("mobDamage", () => {
  // Two identical-seed runs, one knob turned: the extra multiplication
  // consumes no rng, so every dodge/crit roll matches and the damage the
  // player takes scales exactly.
  function takeContactDamage(): number {
    const state = startGame();
    clearStage(state);
    // An unkillable mob parked on the hero: contact lands on cooldown no
    // matter how the hero swings back.
    state.enemies.push(
      makeEnemy({
        pos: { ...state.player.pos },
        hp: 1_000_000,
        maxHp: 1_000_000,
      }),
    );
    for (let i = 0; i < 80; i++) step(state, idle, DT);
    return state.stats.damageTaken;
  }

  it("scales monster contact damage", () => {
    const base = takeContactDamage();
    expect(base).toBeGreaterThan(0);
    setBalanceTuning({ mobDamage: 4 });
    expect(takeContactDamage()).toBe(base * 4);
  });
});

describe("hordeSize", () => {
  function hordeAfter(steps: number): number {
    const state = startGame();
    run(state, idle, steps);
    return state.enemies.length;
  }

  it("scales the wave spawner's floor and cap", () => {
    const base = hordeAfter(200);
    setBalanceTuning({ hordeSize: 4 });
    expect(hordeAfter(200)).toBeGreaterThan(base);
  });
});

describe("dropRate", () => {
  it("scales the per-kill drop chance", () => {
    const state = startGame();
    const base = dropChance(state);
    setBalanceTuning({ dropRate: 3 });
    expect(dropChance(state)).toBeCloseTo(base * 3, 6);
  });
});

describe("equipmentShare", () => {
  // Ten minion kills with the drop chance saturated (dropRate 20 pushes it
  // past 1, so every kill drops something).
  function killTen(state: GameState): void {
    for (let i = 0; i < 10; i++) {
      const enemy = makeEnemy({
        id: 9000 + i,
        pos: { x: state.player.pos.x + 60, y: state.player.pos.y },
      });
      state.enemies.push(enemy);
      hitEnemy(state, enemy, 1_000_000, undefined, { rollAccuracy: false });
    }
  }

  it("widens the equipment slice of the drop ladder", () => {
    setBalanceTuning({ dropRate: 20, equipmentShare: 0.05 });
    const lean = startGame();
    clearStage(lean);
    killTen(lean);
    const leanEquipment = lean.items.filter(
      (i) => i.kind === "equipment",
    ).length;

    // 0.25 × 20 saturates the slice: every non-nuke drop is equipment.
    setBalanceTuning({ dropRate: 20, equipmentShare: 20 });
    const rich = startGame();
    clearStage(rich);
    killTen(rich);
    // 10 rolled drops land on top of the level's 3 scheduled early drops.
    expect(rich.items.length).toBeGreaterThanOrEqual(10);
    const richEquipment = rich.items.filter(
      (i) => i.kind === "equipment",
    ).length;

    expect(richEquipment).toBeGreaterThan(leanEquipment);
    expect(richEquipment).toBeGreaterThanOrEqual(8); // nuke slice may steal one
  });
});

describe("gearQuality", () => {
  it("scales the tier odds an equipment drop rolls", () => {
    // 20× saturates the rare roll (0.06 × 20 > 1), so off a tier-open mob
    // every mint lands rare or better.
    setBalanceTuning({ gearQuality: 20 });
    const state = startGame();
    for (let i = 0; i < 20; i++) {
      const item = rollEquipment(state, { mlvl: 99 });
      expect(item.tier).not.toBe("regular");
      expect(item.tier).not.toBe("magic");
    }

    // Neutral odds off the same seed still pay out mostly regular finds.
    resetBalanceTuning();
    const plain = startGame();
    const regulars = Array.from(
      { length: 20 },
      () => rollEquipment(plain, { mlvl: 99 }).tier,
    ).filter((tier) => tier === "regular").length;
    expect(regulars).toBeGreaterThan(0);
  });
});

describe("menaceGain", () => {
  it("scales how fast the meter heats", () => {
    const state = startGame();
    const base = menaceSensitivity(state);
    expect(base).toBeGreaterThan(0);
    setBalanceTuning({ menaceGain: 3 });
    expect(menaceSensitivity(state)).toBeCloseTo(base * 3, 6);
  });
});
