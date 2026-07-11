// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Diminishing returns on stats (`diminishStat` in leveling.ts): effective
// stat points are linear up to STATS.statSoftCap, flatten past it, and
// saturate toward softCap + 1/statTaper — so a grown hero's stat pile stops
// compounding while the horde's flat per-level ramp keeps climbing. The
// horde's compensation (`autoPowerScale`) rides the SAME curve, so the
// kills-per-level accounting stays whole.

import {
  autoPowerScale,
  baseStatBonus,
  diminishStat,
  effectiveStat,
  MENACE,
  mobHpScaleFor,
  STATS,
} from "@game/core";
import { describe, expect, it } from "vitest";

import { startGame } from "./helpers.ts";

describe("diminishStat — the curve", () => {
  it("is the identity below the soft cap (the early game is untouched)", () => {
    expect(diminishStat(0)).toBe(0);
    expect(diminishStat(1)).toBe(1);
    expect(diminishStat(STATS.statSoftCap)).toBe(STATS.statSoftCap);
    // Negative totals (a cursed piece) pass through untouched too.
    expect(diminishStat(-10)).toBe(-10);
  });

  it("pays less per raw point past the cap, monotonically", () => {
    const cap = STATS.statSoftCap;
    // Still growing…
    expect(diminishStat(cap + 20)).toBeGreaterThan(diminishStat(cap + 10));
    // …but each raw point past the cap realizes less than a full point…
    expect(diminishStat(cap + 10)).toBeLessThan(cap + 10);
    // …and the marginal value keeps shrinking (concave tail).
    const early = diminishStat(cap + 11) - diminishStat(cap + 10);
    const late = diminishStat(cap + 101) - diminishStat(cap + 100);
    expect(early).toBeLessThan(1);
    expect(late).toBeLessThan(early);
  });

  it("saturates toward softCap + 1/taper — no stat pile grows forever", () => {
    const asymptote = STATS.statSoftCap + 1 / STATS.statTaper;
    expect(diminishStat(1_000_000)).toBeLessThan(asymptote);
    expect(diminishStat(1_000_000)).toBeGreaterThan(asymptote * 0.9);
  });
});

describe("diminishing returns reach the derived stats", () => {
  it("effectiveStat routes the flat total through the curve", () => {
    const state = startGame();
    const over = STATS.statSoftCap + 60;
    state.player.stats.strength = over;
    expect(effectiveStat(state, "strength")).toBe(
      Math.round(diminishStat(over)),
    );
    // Below the cap nothing changes.
    state.player.stats.strength = 5;
    expect(effectiveStat(state, "strength")).toBe(5);
  });

  it("a chosen point on a grown hero is worth less than on a fresh one", () => {
    const gain = (from: number): number => {
      const state = startGame();
      state.player.stats.strength = from;
      const before = effectiveStat(state, "strength");
      state.player.stats.strength = from + 10;
      return effectiveStat(state, "strength") - before;
    };
    expect(gain(STATS.statSoftCap + 100)).toBeLessThan(gain(0));
  });

  it("autoPowerScale mirrors the curve, so the horde never overshoots the hero", () => {
    // The compensation applies the SAME diminishing curve to the auto-only
    // sums that the hero's own damage/cadence reads apply to his total.
    const level = 40;
    const expected =
      (1 +
        diminishStat(baseStatBonus(level, "strength")) *
          STATS.damageBonusPerPoint.strength) *
      (1 +
        diminishStat(baseStatBonus(level, "dexterity")) *
          STATS.attackSpeedPerStat);
    expect(autoPowerScale(level)).toBeCloseTo(expected, 10);
    // And stripped of the auto curve, the mob ladder is still the bare
    // linear ramp — the cancellation the leveling model rides.
    expect(
      mobHpScaleFor(level, "nightmare") / autoPowerScale(level),
    ).toBeCloseTo(1 + (level - 1) * MENACE.mobHpPerLevel, 10);
  });
});
