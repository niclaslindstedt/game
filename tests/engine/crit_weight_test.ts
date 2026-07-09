// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The cadence-weighted crit rule of the damage-budget model: a quick blade
// crits light, a slow heavy hitter crits like a truck. `weaponCritMult`
// derives the multiplier from the cooldown (config WEAPON.critMultByCadence),
// a def may override it, and the blow itself resolves with the weight — the
// projectile carries it from the muzzle to the hit.

import { describe, expect, it } from "vitest";

import { step, WEAPON, weaponCritMult, type WeaponDef } from "@game/core";
// Engine-internal kill funnel — asserting the crit math right at the door.
import { hitEnemy } from "../../src/game/loot.ts";

import { equipBlaster, makeEnemy, startGame } from "./helpers.ts";

const weaponAt = (cooldownMs: number, critMult?: number): WeaponDef => ({
  id: "test_cadence",
  name: "TEST CADENCE",
  class: "melee",
  levelReq: 1,
  damage: 10,
  cooldownMs,
  range: 40,
  durability: 100,
  ...(critMult !== undefined ? { critMult } : {}),
  icon: "icon_medieval_sword",
});

describe("cadence-weighted crit", () => {
  it("derives the multiplier from the cooldown, with a def override", () => {
    const { fast, medium, slow } = WEAPON.critMultByCadence;
    expect(weaponCritMult(weaponAt(WEAPON.critFastBelowMs - 1))).toBe(fast);
    expect(weaponCritMult(weaponAt(WEAPON.critFastBelowMs))).toBe(medium);
    expect(weaponCritMult(weaponAt(WEAPON.critSlowFromMs - 1))).toBe(medium);
    expect(weaponCritMult(weaponAt(WEAPON.critSlowFromMs))).toBe(slow);
    // A deliberate exception pins its own weight.
    expect(weaponCritMult(weaponAt(300, 3.5))).toBe(3.5);
  });

  it("resolves the blow with the carried weight when it crits", () => {
    const state = startGame();
    state.enemies = [];
    const sturdy = makeEnemy({ pos: { x: 500, y: 500 }, hp: 100, maxHp: 100 });
    state.enemies.push(sturdy);
    state.rng = () => 0.001; // forces the crit roll (below base crit chance)
    hitEnemy(state, sturdy, 10, "melee", { critMult: 2.5 });
    expect(sturdy.hp).toBe(100 - 25); // 10 × the slow weapon's 2.5, not ×2
    const hit = state.events.find((e) => e.type === "enemyHit");
    expect(hit && "crit" in hit && hit.crit).toBe(true);
  });

  it("stamps the firing weapon's weight onto its projectiles", () => {
    const state = equipBlaster(startGame()); // ranged: the shot carries it
    state.enemies = [
      makeEnemy({
        pos: { x: state.player.pos.x + 150, y: state.player.pos.y },
      }),
    ];
    state.rng = () => 0.99;
    // The fixture blaster (cd 650, medium cadence) fires on the first step.
    state.player.weaponCooldownMs = 0;
    step(state, { steering: false, target: { x: 0, y: 0 }, jump: false }, 16);
    expect(state.projectiles.length).toBeGreaterThan(0);
    expect(state.projectiles[0]?.critMult).toBe(
      WEAPON.critMultByCadence.medium,
    );
  });
});
