// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The damage-range rule: every blow rolls its damage inside a band around the
// weapon's average `damage` (config WEAPON.damageVariance, or a def override),
// so combat reads with a little life instead of one repeated figure. Two
// guarantees matter — the roll stays inside the band and centres on the mean,
// and it draws off the `fxRng` FLAVOR stream so it can never perturb the loot
// stream (`rng`) that seeded content tests depend on.

import { describe, expect, it } from "vitest";

import {
  WEAPON,
  rollWeaponDamage,
  weaponDamageFor,
  weaponDamageRange,
} from "@game/core";
import { rngState } from "@game/lib/rng.ts";

import { equipBlaster, startGame } from "./helpers.ts";

describe("damage variance", () => {
  it("keeps every roll inside the weapon's variance band", () => {
    const state = equipBlaster(startGame());
    const weapon = state.player.equipment.weapon;
    const avg = weaponDamageFor(state, weapon);
    const v = WEAPON.damageVariance; // the fixture blaster takes the default
    const lo = avg * (1 - v);
    const hi = avg * (1 + v);
    for (let i = 0; i < 500; i++) {
      const rolled = rollWeaponDamage(state, weapon);
      expect(rolled).toBeGreaterThanOrEqual(lo - 1e-9);
      expect(rolled).toBeLessThanOrEqual(hi + 1e-9);
    }
  });

  it("centres on the average and actually varies", () => {
    const state = equipBlaster(startGame());
    const weapon = state.player.equipment.weapon;
    const avg = weaponDamageFor(state, weapon);
    let sum = 0;
    const seen = new Set<number>();
    const N = 2000;
    for (let i = 0; i < N; i++) {
      const rolled = rollWeaponDamage(state, weapon);
      sum += rolled;
      seen.add(Math.round(rolled * 1000));
    }
    // Many distinct outcomes — not a single repeated number.
    expect(seen.size).toBeGreaterThan(50);
    // Mean lands near the catalog average (within 5% over a large sample).
    expect(sum / N).toBeCloseTo(avg, 0);
  });

  it("reports a min/max range straddling the average", () => {
    const state = equipBlaster(startGame());
    const weapon = state.player.equipment.weapon;
    const avg = weaponDamageFor(state, weapon);
    const { min, max } = weaponDamageRange(state, weapon);
    expect(min).toBeLessThan(avg);
    expect(max).toBeGreaterThan(avg);
    expect(min).toBeLessThan(max);
  });

  it("never advances the loot stream", () => {
    const state = equipBlaster(startGame());
    const weapon = state.player.equipment.weapon;
    const before = rngState(state.rng);
    for (let i = 0; i < 100; i++) rollWeaponDamage(state, weapon);
    // The flavor roll draws off fxRng alone — the loot/crit stream is untouched.
    expect(rngState(state.rng)).toBe(before);
  });
});
