// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The class-based crit rule of the damage-budget model: a weapon carries NO
// per-weapon crit stat — its crit weight is a flat class base (`baseCritMult`:
// physical ×2, magic ×1.5). STRENGTH then deepens a MELEE crit and
// INTELLIGENCE a MAGIC one (`weaponCritMult`, the live per-swing multiplier);
// a ranged crit takes the flat physical base. The blow resolves with the
// carried weight — the projectile carries it from the muzzle to the hit.

import { describe, expect, it } from "vitest";

import {
  STATS,
  baseCritMult,
  effectiveStat,
  step,
  weaponCritMult,
  type WeaponClass,
  type WeaponDef,
} from "@game/core";
// Engine-internal kill funnel — asserting the crit math right at the door.
import { hitEnemy } from "../../src/game/loot.ts";

import { equipBlaster, makeEnemy, startGame } from "./helpers.ts";

const weaponAt = (cls: WeaponClass): WeaponDef => ({
  id: "test_class",
  name: "TEST CLASS",
  class: cls,
  levelReq: 1,
  damage: 10,
  cooldownMs: 500,
  range: 40,
  durability: 100,
  icon: "icon_medieval_sword",
});

describe("class-based crit weight", () => {
  it("bases the multiplier on class, not cadence — physical ×2, magic ×1.5", () => {
    expect(baseCritMult(weaponAt("melee"))).toBe(STATS.critMultiplier);
    expect(baseCritMult(weaponAt("ranged"))).toBe(STATS.critMultiplier);
    expect(baseCritMult(weaponAt("magic"))).toBe(STATS.magicCritMultiplier);
    expect(STATS.critMultiplier).toBe(2);
    expect(STATS.magicCritMultiplier).toBe(1.5);
  });

  it("deepens a MELEE crit with STRENGTH and a MAGIC crit with INTELLIGENCE", () => {
    const state = startGame();
    const melee = { ...state.player.equipment.weapon, defId: "crude_sword" };
    const magic = { ...state.player.equipment.weapon, defId: "test_wand" };
    // The live multiplier is the class base plus the governing stat's slope,
    // read through effectiveStat (diminishing returns + level bonus folded in).
    state.player.stats.strength = 40;
    state.player.stats.intelligence = 60;
    expect(weaponCritMult(state, melee)).toBeCloseTo(
      STATS.critMultiplier +
        effectiveStat(state, "strength") * STATS.critDamagePerStr,
      6,
    );
    expect(weaponCritMult(state, magic)).toBeCloseTo(
      STATS.magicCritMultiplier +
        effectiveStat(state, "intelligence") * STATS.critDamagePerInt,
      6,
    );
    // A magic crit stays governed by INT alone — STR doesn't touch it.
    const beforeStr = weaponCritMult(state, magic);
    state.player.stats.strength += 40;
    expect(weaponCritMult(state, magic)).toBe(beforeStr);
  });

  it("gives a RANGED crit the flat physical base regardless of STR/INT", () => {
    const state = startGame();
    const ranged = { ...state.player.equipment.weapon, defId: "test_pistol" };
    state.player.stats.strength = 50;
    state.player.stats.intelligence = 50;
    expect(weaponCritMult(state, ranged)).toBe(STATS.critMultiplier);
  });

  it("resolves the blow with the carried weight when it crits", () => {
    const state = startGame();
    state.enemies = [];
    const sturdy = makeEnemy({
      pos: { x: 500, y: 500 },
      hp: 200,
      maxHp: 200,
      mlvl: 1, // a level-1 mob carries ~no armor, so we measure pure crit weight
    });
    state.enemies.push(sturdy);
    state.rng = () => 0.001; // forces the crit roll (below base crit chance)
    hitEnemy(state, sturdy, 10, "melee", { critMult: 2.5 });
    expect(sturdy.hp).toBe(200 - 25); // 10 × the carried 2.5, not the ×2 default
    const hit = state.events.find((e) => e.type === "enemyHit");
    expect(hit && "crit" in hit && hit.crit).toBe(true);
  });

  it("stamps the firing weapon's stat-scaled weight onto its projectiles", () => {
    const state = equipBlaster(startGame()); // ranged: the shot carries it
    state.enemies = [
      makeEnemy({
        pos: { x: state.player.pos.x + 150, y: state.player.pos.y },
      }),
    ];
    state.rng = () => 0.99;
    state.player.weaponCooldownMs = 0;
    step(state, { steering: false, target: { x: 0, y: 0 }, jump: false }, 16);
    expect(state.projectiles.length).toBeGreaterThan(0);
    // The blaster is ranged, so the carried weight is the flat physical base.
    expect(state.projectiles[0]?.critMult).toBe(STATS.critMultiplier);
  });
});
