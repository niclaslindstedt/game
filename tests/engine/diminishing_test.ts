// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The LEVEL-SCALED stat cap (`statCap` + `diminishStat` in leveling.ts): chosen
// points are LINEAR up to a ceiling that rises with level (a full spec realizes
// its raw value, undiminished), GEAR pushes past that ceiling on a diminishing
// tail (felt, never walled, never wasted), and the ceiling is hard-capped at
// `STATS.statHardCap` (250). The chooser can't PLACE a point past the cap, and
// the derived PROBABILITY channels (crit, dodge) saturate toward sub-100% caps
// so a 250-high stat can't drive them to a degenerate certainty.

import {
  ARMOR,
  armorReduction,
  allocateStat,
  autoPowerScale,
  baseStatBonus,
  diminishStat,
  DODGE,
  effectiveStat,
  mobHpLevelFactor,
  mobHpScaleFor,
  playerCritChance,
  playerDodgeChance,
  setAutoStatGainsEnabled,
  STATS,
  statCap,
} from "@game/core";
import { afterEach, describe, expect, it } from "vitest";

import { startGame } from "./helpers.ts";

describe("statCap — the level-scaled ceiling", () => {
  it("starts at the base ceiling and rises with level", () => {
    // At level 1 no points have been chosen, so the ceiling is just the base
    // headroom gear can fill linearly.
    expect(statCap(1)).toBe(STATS.statCeilingBase);
    // Every ding adds its chosen-point grant to the ceiling, so it climbs.
    expect(statCap(20)).toBeGreaterThan(statCap(10));
    expect(statCap(40)).toBeGreaterThan(statCap(20));
  });

  it("hard-caps at STATS.statHardCap (250) in the endgame", () => {
    expect(statCap(99)).toBe(STATS.statHardCap);
    // The cap is reached well before 99 (~L66 on the point schedule) and never
    // exceeds the roof.
    expect(statCap(70)).toBe(STATS.statHardCap);
    expect(statCap(66)).toBeLessThanOrEqual(STATS.statHardCap);
  });
});

describe("diminishStat — linear to the cap, diminishing tail past it", () => {
  it("is the identity at and below the level's cap (a full spec is undiminished)", () => {
    const level = 40;
    const cap = statCap(level);
    expect(diminishStat(0, level)).toBe(0);
    expect(diminishStat(1, level)).toBe(1);
    expect(diminishStat(cap, level)).toBe(cap);
    // Negative totals (a cursed piece) pass through untouched too.
    expect(diminishStat(-10, level)).toBe(-10);
  });

  it("pays less per raw point past the cap, monotonically (the gear tail)", () => {
    const level = 40;
    const cap = statCap(level);
    // Gear over the cap still gains — never walled…
    expect(diminishStat(cap + 50, level)).toBeGreaterThan(
      diminishStat(cap + 10, level),
    );
    // …but each raw point past the cap realizes less than a full point…
    expect(diminishStat(cap + 10, level)).toBeLessThan(cap + 10);
    // …and the marginal value keeps shrinking (concave tail).
    const early = diminishStat(cap + 11, level) - diminishStat(cap + 10, level);
    const late =
      diminishStat(cap + 101, level) - diminishStat(cap + 100, level);
    expect(early).toBeLessThan(1);
    expect(late).toBeLessThan(early);
  });

  it("saturates toward cap + 1/taper — no gear pile grows forever", () => {
    const level = 40;
    const cap = statCap(level);
    const asymptote = cap + 1 / STATS.statTaper;
    expect(diminishStat(1_000_000, level)).toBeLessThan(asymptote);
    expect(diminishStat(1_000_000, level)).toBeGreaterThan(asymptote * 0.9);
  });

  it("a grown hero realizes MORE of the same raw pile (the ceiling rose)", () => {
    // A raw stat that sits past a low-level hero's cap sits UNDER a grown
    // hero's, so the same pile is worth more effective stat later — keeping a
    // main stat relevant as you level rather than flattening at a fixed 40.
    const raw = 120;
    expect(diminishStat(raw, 99)).toBeGreaterThan(diminishStat(raw, 20));
    // At 99 the cap (250) is above 120, so it's fully linear there.
    expect(diminishStat(raw, 99)).toBe(raw);
  });
});

describe("effectiveStat routes the flat total through the level-aware curve", () => {
  it("diminishes gear past the hero's current cap", () => {
    const state = startGame();
    state.player.level = 40;
    const cap = statCap(40);
    const over = cap + 60;
    state.player.stats.strength = over;
    expect(effectiveStat(state, "strength")).toBe(
      Math.round(diminishStat(over, 40)),
    );
    // Below the cap nothing changes.
    state.player.stats.strength = 5;
    expect(effectiveStat(state, "strength")).toBe(5);
  });
});

describe("allocateStat — the chooser hard-walls placement at the cap", () => {
  it("refuses to place a chosen point once the stat is at statCap(level)", () => {
    const state = startGame();
    state.player.level = 99; // cap === 250
    state.player.pendingStatPoints = 5;
    state.player.stats.strength = statCap(99);
    expect(allocateStat(state, "strength")).toBe(false);
    // The point is untouched — still spendable elsewhere.
    expect(state.player.pendingStatPoints).toBe(5);
    // A stat with room still takes it.
    state.player.stats.dexterity = 0;
    expect(allocateStat(state, "dexterity")).toBe(true);
    expect(state.player.pendingStatPoints).toBe(4);
  });
});

describe("derived probability channels saturate below 1.0", () => {
  it("crit chance approaches but never reaches critCap, even maxed", () => {
    const state = startGame();
    state.player.level = 99;
    // A degenerate crit build: every stat slammed to the roof.
    for (const stat of [
      "strength",
      "dexterity",
      "intelligence",
      "luck",
    ] as const)
      state.player.stats[stat] = 100_000;
    const crit = playerCritChance(state, undefined);
    expect(crit).toBeLessThan(STATS.critCap);
    // …but heavy investment does climb most of the way there (an expensive top,
    // not a wasted stat).
    expect(crit).toBeGreaterThan(STATS.critCap * 0.9);
  });

  it("dodge approaches but never reaches DODGE.max, even maxed", () => {
    const state = startGame();
    state.player.level = 99;
    state.player.stats.dexterity = 100_000;
    state.player.stats.luck = 100_000;
    const dodge = playerDodgeChance(state);
    expect(dodge).toBeLessThan(DODGE.max);
    expect(dodge).toBeGreaterThan(DODGE.max * 0.5);
  });

  it("armor reduction never exceeds ARMOR.maxReduction", () => {
    const state = startGame();
    // Even against a level-1 attacker (the smallest k, the most favourable
    // reduction), the clamp holds.
    expect(armorReduction(state, 1)).toBeLessThanOrEqual(ARMOR.maxReduction);
  });
});

describe("autoPowerScale mirrors the curve when the auto flag is on", () => {
  afterEach(() => {
    // The engine default is OFF (the experimental opt-in); restore it.
    setAutoStatGainsEnabled(false);
  });

  it("applies the SAME level-aware curve the hero's own reads apply", () => {
    setAutoStatGainsEnabled(true);
    const level = 40;
    const expected =
      (1 +
        diminishStat(baseStatBonus(level, "strength"), level) *
          STATS.damageBonusPerPoint.strength) *
      (1 +
        diminishStat(baseStatBonus(level, "dexterity"), level) *
          STATS.attackSpeedPerStat);
    expect(autoPowerScale(level)).toBeCloseTo(expected, 10);
    // And stripped of the auto curve, the mob ladder is the geometric hp-by-
    // level factor (fixture nightmare is uncapped at the neutral offset, so the
    // mob level IS the hero's) — the free growth still cancels out.
    expect(
      mobHpScaleFor(level, "nightmare") / autoPowerScale(level),
    ).toBeCloseTo(mobHpLevelFactor(level), 10);
  });

  it("is neutral (1) while the auto flag is off — the shipped default", () => {
    setAutoStatGainsEnabled(false);
    expect(autoPowerScale(40)).toBe(1);
    expect(baseStatBonus(40, "strength")).toBe(0);
  });
});
