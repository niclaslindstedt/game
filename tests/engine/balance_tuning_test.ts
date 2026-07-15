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
  heroDamageLevel,
  heroPowerLevel,
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
    setBalanceTuning({ xpGain: 1000, mobHp: -5, mobDamage: Number.NaN });
    const tuning = getBalanceTuning();
    expect(tuning.xpGain).toBe(100); // clamped to the ceiling (100×)
    expect(tuning.mobHp).toBe(0); // clamped to the floor (system off)
    expect(tuning.mobDamage).toBe(1); // NaN never lands
    // A partial patch leaves the other knobs alone.
    expect(tuning.dropRate).toBe(1);
  });

  it("accepts a knob turned fully off", () => {
    setBalanceTuning({ dropRate: 0 });
    expect(getBalanceTuning().dropRate).toBe(0);
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
  // past 1, so every kill drops something). Each mob is finished from half
  // its (inflated) bar with a blow well under its max hp, so the OVERKILL
  // TOLL (`overkillEfficiency`) never discounts the roll being measured.
  function killTen(state: GameState): void {
    for (let i = 0; i < 10; i++) {
      const enemy = makeEnemy({
        id: 9000 + i,
        pos: { x: state.player.pos.x + 60, y: state.player.pos.y },
        hp: 45,
        maxHp: 200,
      });
      state.enemies.push(enemy);
      hitEnemy(state, enemy, 45, undefined, { rollAccuracy: false });
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

describe("repairDrops", () => {
  // Same saturated-drop setup as equipmentShare: ten minions finished from
  // half their inflated bar so no overkill toll discounts the roll.
  function killTen(state: GameState): void {
    for (let i = 0; i < 10; i++) {
      const enemy = makeEnemy({
        id: 9000 + i,
        pos: { x: state.player.pos.x + 60, y: state.player.pos.y },
        hp: 45,
        maxHp: 200,
      });
      state.enemies.push(enemy);
      hitEnemy(state, enemy, 45, undefined, { rollAccuracy: false });
    }
  }

  it("widens the repair-kit slice of the drop ladder", () => {
    // Knob off: the repair band collapses, so no kill drops a repair kit.
    setBalanceTuning({ dropRate: 20, repairDrops: 0 });
    const none = startGame();
    clearStage(none);
    killTen(none);
    expect(none.items.filter((i) => i.kind === "repair").length).toBe(0);

    // Cranked up: the repair band swallows the ladder below equipment, so the
    // rain is thick with repair kits.
    setBalanceTuning({ dropRate: 20, repairDrops: 20 });
    const rich = startGame();
    clearStage(rich);
    killTen(rich);
    expect(
      rich.items.filter((i) => i.kind === "repair").length,
    ).toBeGreaterThan(0);
  });
});

describe("gearQuality", () => {
  it("scales the D2 rarity roll an equipment drop rolls", () => {
    const N = 200;
    // A big gear-quality multiplier lifts every tier's chance toward its cap,
    // so off a deep (all-tiers-open) mob almost nothing lands white.
    setBalanceTuning({ gearQuality: 20 });
    const rich = startGame();
    const richAboveWhite = Array.from(
      { length: N },
      () => rollEquipment(rich, { mlvl: 99 }).tier,
    ).filter((tier) => tier !== "regular").length;

    // Neutral odds off the same seed keep the roll honest — whites still turn
    // up (the rarity cap leaves room for the make-quality roll).
    resetBalanceTuning();
    const plain = startGame();
    const plainAboveWhite = Array.from(
      { length: N },
      () => rollEquipment(plain, { mlvl: 99 }).tier,
    ).filter((tier) => tier !== "regular").length;

    expect(richAboveWhite).toBeGreaterThan(plainAboveWhite);
    expect(richAboveWhite).toBeGreaterThanOrEqual(N * 0.95);
    expect(N - plainAboveWhite).toBeGreaterThan(0); // whites still drop
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

describe("hero power level — character level only", () => {
  it("weapon damage and gear never toughen the horde", () => {
    const state = startGame();
    const char = state.player.level;
    // An absurd damage roll runs the DIAGNOSTIC damage level well above the
    // character level, but the horde no longer follows it at all.
    state.player.equipment.weapon.affixes.push({ kind: "damagePct", value: 9 });
    expect(heroDamageLevel(state)).toBeGreaterThan(char);
    expect(heroPowerLevel(state)).toBe(char);
    // A twink rack is likewise ignored — power is the character level, period.
    state.player.equipment.weapon.affixes.pop();
    state.player.equipment.weapon.ilvl = 70;
    expect(heroPowerLevel(state)).toBe(char);
  });
});
