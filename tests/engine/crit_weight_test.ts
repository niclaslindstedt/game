// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// CRIT DAMAGE is a CLASS trait, not a per-item number: a flat class FLOOR
// (`baseCritMult` — ranged > melee > magic) deepened by DEXTERITY, the precision
// slope (`weaponCritMult`). A DEX-max ranged build crits hardest; a DEX-less
// caster stays at its floor and is HARD-CAPPED under melee's floor, so magic can
// never out-crit a bruiser. The blow resolves with the carried weight — the
// projectile carries it from the muzzle to the hit.

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
  it("orders the class floors ranged > melee > magic", () => {
    expect(baseCritMult(weaponAt("ranged"))).toBe(STATS.critMultByClass.ranged);
    expect(baseCritMult(weaponAt("melee"))).toBe(STATS.critMultByClass.melee);
    expect(baseCritMult(weaponAt("magic"))).toBe(STATS.critMultByClass.magic);
    expect(STATS.critMultByClass.ranged).toBeGreaterThan(
      STATS.critMultByClass.melee,
    );
    expect(STATS.critMultByClass.melee).toBeGreaterThan(
      STATS.critMultByClass.magic,
    );
  });

  it("deepens crit damage with DEXTERITY for every class", () => {
    const state = startGame();
    const ranged = { ...state.player.equipment.weapon, defId: "test_pistol" };
    const melee = { ...state.player.equipment.weapon, defId: "crude_sword" };
    state.player.stats.dexterity = 80;
    for (const [w, cls] of [
      [ranged, "ranged"],
      [melee, "melee"],
    ] as const) {
      expect(weaponCritMult(state, w)).toBeCloseTo(
        STATS.critMultByClass[cls] +
          effectiveStat(state, "dexterity") * STATS.critDamagePerDex,
        6,
      );
    }
  });

  it("makes a DEX-max ranged build crit harder than a low-DEX melee build", () => {
    const state = startGame();
    const ranged = { ...state.player.equipment.weapon, defId: "test_pistol" };
    const melee = { ...state.player.equipment.weapon, defId: "crude_sword" };
    state.player.stats.dexterity = 200; // the marksman's precision
    const rangedCrit = weaponCritMult(state, ranged);
    state.player.stats.dexterity = 30; // a bruiser barely invests DEX
    const meleeCrit = weaponCritMult(state, melee);
    expect(rangedCrit).toBeGreaterThan(meleeCrit);
  });

  it("HARD-CAPS a magic crit so a DEX-stacking mage never out-crits melee", () => {
    const state = startGame();
    const magic = { ...state.player.equipment.weapon, defId: "test_wand" };
    state.player.stats.dexterity = 250; // absurd for a caster, but gear could
    expect(weaponCritMult(state, magic)).toBe(STATS.magicCritCap);
    expect(STATS.magicCritCap).toBeLessThanOrEqual(STATS.critMultByClass.melee);
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
    expect(sturdy.hp).toBe(200 - 25); // 10 × the carried 2.5
    const hit = state.events.find((e) => e.type === "enemyHit");
    expect(hit && "crit" in hit && hit.crit).toBe(true);
  });

  it("crits a conjured SPELL blow for the flat spellCritMult", () => {
    const state = startGame();
    const sturdy = makeEnemy({
      pos: { x: 500, y: 500 },
      hp: 200,
      maxHp: 200,
      mlvl: 1,
    });
    state.enemies = [sturdy];
    state.rng = () => 0.001; // force the crit
    hitEnemy(state, sturdy, 10, "magic"); // no critMult → conjured/spell path
    expect(sturdy.hp).toBe(200 - 10 * STATS.spellCritMult);
  });

  it("stamps the firing weapon's DEX-scaled weight onto its projectiles", () => {
    const state = equipBlaster(startGame()); // ranged: the shot carries it
    state.player.stats.dexterity = 60;
    state.enemies = [
      makeEnemy({
        pos: { x: state.player.pos.x + 150, y: state.player.pos.y },
      }),
    ];
    state.rng = () => 0.99;
    state.player.weaponCooldownMs = 0;
    step(state, { steering: false, target: { x: 0, y: 0 }, jump: false }, 16);
    expect(state.projectiles.length).toBeGreaterThan(0);
    expect(state.projectiles[0]?.critMult).toBeCloseTo(
      weaponCritMult(state, state.player.equipment.weapon),
      6,
    );
  });
});
