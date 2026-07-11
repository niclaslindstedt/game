// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Hand-authored UNIQUE items: the registry integrity and `mintUnique` — fixed
// name + bonuses on a base, a ±band roll on the base damage/armor, unbreakable.
// Exercised through the SHIPPED uniques (GROK OMEGA's five) and real bases.

import {
  DIFFICULTY_ORDER,
  effectiveStat,
  ENEMY_DEFS,
  equipmentLevelReq,
  gearDef,
  isWeaponDef,
  LEVELS,
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
      // At most one scaling bonus, and small — within the engine mint clamp.
      const scaling = def.bonuses.filter(
        (b) => b.kind === "statPct" || b.kind === "maxHpPct",
      );
      expect(scaling.length).toBeLessThanOrEqual(1);
      for (const s of scaling) expect(s.value).toBeLessThanOrEqual(0.02);
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
    const item = mintUnique(state, "walled_garden"); // ilvl 67, base fluted_greaves
    const baseReq = equipmentLevelReq("fluted_greaves");
    // The ilvl scales power, not the requirement — wearable far below it.
    expect(baseReq).toBeLessThan(uniqueDef("walled_garden").ilvl);
    state.player.level = baseReq;
    expect(meetsLevelReq(state, item)).toBe(true);
  });

  it("a scaling unique bonus reaches the hero's effective stat once worn", () => {
    const state = startGame();
    state.player.stats.intelligence = 20;
    const before = effectiveStat(state, "intelligence");
    // THE PANOPTICON carries +2% INTELLIGENCE (a scaling bonus, at the
    // UNIQUE.scalingPctCap ceiling).
    const panopticon: Equipment = mintUnique(
      { ...state, rng: () => 0.5 } as typeof state,
      "the_panopticon",
    );
    state.player.equipment.head = panopticon;
    expect(effectiveStat(state, "intelligence")).toBe(
      Math.round(before * 1.02),
    );
  });
});

describe("boss unique drop tables", () => {
  // Every shipped unique is placed on exactly one boss/rung, and every id a
  // boss lists resolves — no dangling references either way.
  const wiring = Object.values(ENEMY_DEFS)
    .filter((def) => def.uniquesByDifficulty)
    .flatMap((def) =>
      Object.entries(def.uniquesByDifficulty ?? {}).flatMap(([diff, ids]) =>
        (ids ?? []).map((id) => ({ boss: def.id, diff, id })),
      ),
    );

  // World-drop uniques are wired on the LEVEL (`loot.worldUniques`), not a boss.
  const worldWiring = Object.values(LEVELS).flatMap((def) =>
    Object.entries(def.loot.worldUniques ?? {}).flatMap(([diff, ids]) =>
      (ids ?? []).map((id) => ({ level: def.id, diff, id })),
    ),
  );

  // Merchant-stall uniques are SOLD by a level's trader instead of dropping
  // (`LevelDef.merchant.stockUniques` — Eastworld's PUTAIN estate): the third
  // home kind, no difficulty rung (the stall stocks on every rung).
  const stallWiring = Object.values(LEVELS).flatMap((def) =>
    (def.merchant?.stockUniques ?? []).map((id) => ({ level: def.id, id })),
  );

  it("references only real uniques, on real difficulty rungs", () => {
    for (const { diff, id } of [...wiring, ...worldWiring]) {
      expect(DIFFICULTY_ORDER).toContain(diff);
      expect(() => uniqueDef(id)).not.toThrow();
    }
  });

  it("places every shipped unique exactly once (boss table, world drop, or stall)", () => {
    const placed = [...wiring, ...worldWiring, ...stallWiring]
      .map((w) => w.id)
      .sort();
    expect(placed).toEqual([...UNIQUE_IDS].sort());
    // No id has two homes.
    expect(new Set(placed).size).toBe(placed.length);

    // Stall stock resolves against real uniques too.
    for (const { id } of stallWiring) {
      expect(() => uniqueDef(id)).not.toThrow();
    }
  });

  it("gives each rung a full boss set — 7 uniques per difficulty", () => {
    // 5 boss weapon/armor pieces + 1 MUSKRAT bag + 1 GROK charm = 7.
    const perRung: Record<string, number> = {};
    for (const { diff } of wiring) perRung[diff] = (perRung[diff] ?? 0) + 1;
    for (const diff of DIFFICULTY_ORDER) expect(perRung[diff]).toBe(7);
  });
});

// The ilvl model (scripts/weapon-ilvl.mjs) is the single source of truth for what
// a unique's `ilvl` means — ilvl = base.levelReq + bonusBudget, priced off the
// live combat constants. These guards keep every shipped ilvl honest going
// forward: authored == computed, and no non-keeper deviates over its budget cap.
describe("unique ilvl model (weapon-ilvl.mjs)", () => {
  it("every unique's authored ilvl equals its computed ilvl", async () => {
    const { computeAll } = await import("../../scripts/weapon-ilvl.mjs");
    for (const r of computeAll())
      expect(`${r.id}=${r.authored}`).toBe(`${r.id}=${r.computed}`);
  });

  it("no non-keeper unique exceeds its power-budget cap", async () => {
    const { computeAll } = await import("../../scripts/weapon-ilvl.mjs");
    // Over-budget keepers are opt-in via `UniqueDef.keeper` (a scaling stat that
    // grows into best-in-slot); everything else must fit under the cap.
    const over = computeAll().filter((r) => r.overBudget);
    expect(over.map((r) => r.id)).toEqual([]);
  });
});
