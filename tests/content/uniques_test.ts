// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Hand-authored UNIQUE items: the registry integrity and `mintUnique` — fixed
// name + bonuses on a base, a ±band roll on the base damage/armor, unbreakable.
// Exercised through the SHIPPED uniques (GROK OMEGA's five) and real bases.

import {
  effectiveStat,
  equipmentLevelReq,
  gearDef,
  isWeaponDef,
  meetsLevelReq,
  mintUnique,
  UNIQUE_IDS,
  uniqueDef,
  weaponDamageFor,
  weaponDef,
  type Equipment,
} from "@game/core";
import { describe, expect, it } from "vitest";

import { startGame } from "../helpers.ts";

describe("unique registry", () => {
  it("every shipped unique has a matching base and slot", () => {
    expect(UNIQUE_IDS.length).toBeGreaterThanOrEqual(5);
    for (const id of UNIQUE_IDS) {
      const def = uniqueDef(id);
      const isWeapon = isWeaponDef(def.base);
      // Weapon uniques sit in the weapon slot; everything else is gear.
      expect(def.slot === "weapon").toBe(isWeapon);
      // The base resolves (throws otherwise).
      expect(isWeapon ? weaponDef(def.base) : gearDef(def.base)).toBeTruthy();
      // At most one scaling bonus, and small.
      const scaling = def.bonuses.filter(
        (b) => b.kind === "statPct" || b.kind === "maxHpPct",
      );
      expect(scaling.length).toBeLessThanOrEqual(1);
      for (const s of scaling) expect(s.value).toBeLessThanOrEqual(0.03);
    }
  });
});

describe("mintUnique", () => {
  it("stamps the fixed identity: name, tier, ilvl, bonuses, unbreakable", () => {
    const state = startGame();
    const def = uniqueDef("boundstride");
    const item = mintUnique(state, "boundstride");
    expect(item.tier).toBe("unique");
    expect(item.name).toBe(def.name);
    expect(item.slot).toBe(def.slot);
    expect(item.ilvl).toBe(def.ilvl);
    expect(item.affixes).toEqual(def.bonuses);
    // Unique/legendary finds mint unbreakable (no durability).
    expect(item.durability).toBeUndefined();
  });

  it("rolls a ±band on a WEAPON's base damage; bonuses stay identical", () => {
    const state = startGame();
    const hi = { ...state, rng: () => 1 }; // roll = +band
    const lo = { ...state, rng: () => 0 }; // roll = −band
    const strong = mintUnique(hi as typeof state, "the_jailbreak");
    const weak = mintUnique(lo as typeof state, "the_jailbreak");
    expect(strong.baseRoll).toBeGreaterThan(weak.baseRoll as number);
    // The variance shows up in the actual per-hit damage…
    expect(weaponDamageFor(state, strong)).toBeGreaterThan(
      weaponDamageFor(state, weak),
    );
    // …but the fixed bonuses are the same on both copies.
    expect(strong.affixes).toEqual(weak.affixes);
  });

  it("rolls a ±band into an ARMOR piece's stamped armor", () => {
    const state = startGame();
    const hi = mintUnique(
      { ...state, rng: () => 1 } as typeof state,
      "truthseeker",
    );
    const lo = mintUnique(
      { ...state, rng: () => 0 } as typeof state,
      "truthseeker",
    );
    const base = gearDef("microlattice_plate").armor ?? 0;
    // A ±10% band around the base value — a better-rolled copy is worth chasing.
    expect(hi.armor as number).toBeGreaterThan(lo.armor as number);
    expect(hi.armor as number).toBeCloseTo(base * 1.1, 0);
    expect(lo.armor as number).toBeCloseTo(base * 0.9, 0);
  });

  it("equips at the BASE item's level, well below its (higher) ilvl", () => {
    const state = startGame();
    const item = mintUnique(state, "walled_garden"); // ilvl 67, base actuator_greaves
    const baseReq = equipmentLevelReq("actuator_greaves");
    // The ilvl scales power, not the requirement — wearable far below it.
    expect(baseReq).toBeLessThan(uniqueDef("walled_garden").ilvl);
    state.player.level = baseReq;
    expect(meetsLevelReq(state, item)).toBe(true);
  });

  it("a scaling unique bonus reaches the hero's effective stat once worn", () => {
    const state = startGame();
    state.player.stats.intelligence = 20;
    const before = effectiveStat(state, "intelligence");
    // THE PANOPTICON carries +3% INTELLIGENCE (a scaling bonus).
    const panopticon: Equipment = mintUnique(
      { ...state, rng: () => 0.5 } as typeof state,
      "the_panopticon",
    );
    state.player.equipment.head = panopticon;
    expect(effectiveStat(state, "intelligence")).toBe(
      Math.round(before * 1.03),
    );
  });
});
