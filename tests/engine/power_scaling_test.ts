// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The campaign power-scaling rules added by the balance overhaul: conjured
// powerups keep pace with the horde's healthbars (abilityPowerScale), medkits
// come in D2-style static tiers that deepen with the monster level
// (rollMedkitTier), and the ding's stat-point grant grows up the levels
// (statPointsAt). Synthetic fixtures only.

import { describe, expect, it } from "vitest";

import {
  abilityPowerScale,
  autoPowerScale,
  LEVELING,
  MEDKIT,
  MENACE,
  statPointsAt,
  stasisRadius,
} from "@game/core";
import { rollMedkitTier } from "../../src/game/loot.ts";
import { abilityDef } from "../../src/game/defs/abilities.ts";

import { startGame } from "./helpers.ts";

describe("abilityPowerScale", () => {
  it("is 1 at level 1 with no INT — the catalog numbers ARE the opening", () => {
    const state = startGame();
    state.player.level = 1;
    state.player.stats.intelligence = 0;
    expect(abilityPowerScale(state)).toBeCloseTo(1, 5);
  });

  it("tracks the minion healthbar's growth, so a powerup keeps its bite", () => {
    const state = startGame();
    state.player.stats.intelligence = 0;
    // At the NEUTRAL offset the scale IS the mob bar's growth: the ratio of
    // ability damage to a level-appropriate healthbar stays constant.
    for (const level of [1, 10, 30, 55]) {
      state.player.level = level;
      const scale = abilityPowerScale(state);
      const bar =
        (1 + (level - 1) * MENACE.mobHpPerLevel) * autoPowerScale(level);
      // The INT term contributes the auto-stat INT... none is automatic
      // (only stamina/strength/dexterity are), so with 0 chosen INT the
      // ratio is exactly 1.
      expect(scale / bar).toBeCloseTo(1, 5);
    }
  });

  it("INTELLIGENCE deepens the burn", () => {
    const state = startGame();
    state.player.level = 5;
    state.player.stats.intelligence = 0;
    const plain = abilityPowerScale(state);
    state.player.stats.intelligence = 10;
    expect(abilityPowerScale(state)).toBeGreaterThan(plain * 1.3);
  });

  it("INT widens the stasis field, never its slow", () => {
    const state = startGame();
    const def = abilityDef("test_stasis");
    if (!def.stasis) throw new Error("fixture stasis missing");
    state.player.stats.intelligence = 0;
    const base = stasisRadius(state, def);
    state.player.stats.intelligence = 10;
    expect(stasisRadius(state, def)).toBeGreaterThan(base);
    expect(def.stasis.slowFactor).toBeLessThan(1); // authored, untouched
  });
});

describe("medkit tiers", () => {
  it("the opening only drops LIGHT kits", () => {
    const state = startGame();
    state.player.level = 1;
    for (let i = 0; i < 30; i++) {
      expect(rollMedkitTier(state)).toBe(0);
    }
  });

  it("deep content pays the deepest unlocked tier, sometimes one under", () => {
    const state = startGame();
    // Fixture medium offset −2: mlvl = level − 2. Reach the top tier's band.
    const top = MEDKIT.tiers.length - 1;
    state.player.level =
      (MEDKIT.tiers[top] as { minMlvl: number }).minMlvl + 4;
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) seen.add(rollMedkitTier(state));
    expect(seen.has(top)).toBe(true); // the deep kit drops
    expect(seen.has(top - 1)).toBe(true); // with the odd lighter one mixed in
    expect([...seen].every((t) => t >= top - 1)).toBe(true); // never lighter
  });

  it("tier heals ascend — a bigger kit is never a worse one", () => {
    for (let i = 1; i < MEDKIT.tiers.length; i++) {
      const prev = MEDKIT.tiers[i - 1] as { heal: number; minMlvl: number };
      const next = MEDKIT.tiers[i] as { heal: number; minMlvl: number };
      expect(next.heal).toBeGreaterThan(prev.heal);
      expect(next.minMlvl).toBeGreaterThan(prev.minMlvl);
    }
  });
});

describe("statPointsAt — the growing ding", () => {
  it("pays 1 through the opening and more every ten levels", () => {
    expect(statPointsAt(2)).toBe(1);
    expect(statPointsAt(9)).toBe(1);
    expect(statPointsAt(10)).toBe(2);
    expect(statPointsAt(40)).toBe(5);
    expect(statPointsAt(99)).toBe(1 + Math.floor(99 / 10));
  });

  it("rides the config knobs, not magic numbers", () => {
    expect(statPointsAt(LEVELING.statPointsBonusEvery)).toBe(
      LEVELING.statPointsPerLevel + 1,
    );
  });
});
