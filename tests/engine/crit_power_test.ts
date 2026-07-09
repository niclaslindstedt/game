// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The crit-power rule: a blow reports where it landed in the weapon's variance
// band as a normalized `roll` in [0, 1] (see `rollWeaponHit`), so the app can
// size a crit's popup by how hard it hit — a top-of-band slam grows bigger than
// a glancing crit. The roll rides the same `fxRng` draw as the damage, so it
// never perturbs the loot/crit stream, and a variance-free weapon lands at a
// neutral 0.5.

import { describe, expect, it } from "vitest";

import { WEAPON, rollWeaponHit, weaponDamageFor } from "@game/core";
import { rngState } from "@game/lib/rng.ts";
// Engine-internal kill funnel — asserting the crit-power passthrough at the door.
import { hitEnemy } from "../../src/game/loot.ts";

import { equipBlaster, makeEnemy, startGame } from "./helpers.ts";

describe("crit power", () => {
  it("reports the roll's position in the variance band", () => {
    const state = equipBlaster(startGame());
    const weapon = state.player.equipment.weapon;
    const avg = weaponDamageFor(state, weapon);
    const v = WEAPON.damageVariance; // the fixture blaster takes the default
    for (let i = 0; i < 500; i++) {
      const { damage, roll } = rollWeaponHit(state, weapon);
      expect(roll).toBeGreaterThanOrEqual(0);
      expect(roll).toBeLessThanOrEqual(1);
      // roll = 0 is the soft end (avg*(1-v)), roll = 1 the hard end (avg*(1+v)).
      const factor = 1 - v + roll * 2 * v;
      expect(damage).toBeCloseTo(avg * factor, 6);
    }
  });

  it("spans the full [0, 1] band over many rolls", () => {
    const state = equipBlaster(startGame());
    const weapon = state.player.equipment.weapon;
    let lo = 1;
    let hi = 0;
    for (let i = 0; i < 2000; i++) {
      const { roll } = rollWeaponHit(state, weapon);
      lo = Math.min(lo, roll);
      hi = Math.max(hi, roll);
    }
    expect(lo).toBeLessThan(0.1);
    expect(hi).toBeGreaterThan(0.9);
  });

  it("never advances the loot stream", () => {
    const state = equipBlaster(startGame());
    const weapon = state.player.equipment.weapon;
    const before = rngState(state.rng);
    for (let i = 0; i < 100; i++) rollWeaponHit(state, weapon);
    expect(rngState(state.rng)).toBe(before);
  });

  it("rides the blow's roll out as critPower on a crit", () => {
    const state = startGame();
    state.enemies = [
      makeEnemy({ pos: { x: 500, y: 500 }, hp: 100, maxHp: 100 }),
    ];
    state.rng = () => 0.001; // force the crit roll (below base crit chance)
    hitEnemy(state, state.enemies[0]!, 10, "melee", {
      critMult: 2,
      damageRoll: 0.8,
    });
    const hit = state.events.find((e) => e.type === "enemyHit");
    expect(hit && "critPower" in hit && hit.critPower).toBe(0.8);
  });

  it("omits critPower when the blow is not a crit", () => {
    const state = startGame();
    state.enemies = [
      makeEnemy({ pos: { x: 500, y: 500 }, hp: 100, maxHp: 100 }),
    ];
    state.rng = () => 0.99; // no crit
    hitEnemy(state, state.enemies[0]!, 10, "melee", {
      critMult: 2,
      damageRoll: 0.8,
    });
    const hit = state.events.find((e) => e.type === "enemyHit");
    expect(hit && "critPower" in hit && hit.critPower).toBeUndefined();
  });
});
