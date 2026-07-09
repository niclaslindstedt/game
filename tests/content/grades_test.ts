// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// BASE GRADES — this game's Normal → EXCEPTIONAL → ELITE ladder (see
// src/game/defs/grades.ts): every pool base ships two generated upgraded
// versions (same look, higher numbers, remapped level requirements running
// to 100), and the loot roll folds them into each level's pool so drops
// keep introducing new bases all campaign. A content suite — it pins the
// shipped catalogs, not an engine rule.

import { describe, expect, it } from "vitest";

import {
  GEAR_DEFS,
  gradeVariantIds,
  LEVEL_ORDER,
  LEVELS,
  rollEquipment,
  WEAPON_DEFS,
  weaponDef,
  type GearDef,
  type WeaponDef,
} from "@game/core";

import { startGame } from "../helpers.ts";

/** Every pool base id, per family, across the shipped levels. */
function pooledIds(family: "weapon" | "gear"): string[] {
  const ids = new Set<string>();
  for (const levelId of LEVEL_ORDER) {
    const loot = LEVELS[levelId]!.loot;
    const pool = family === "weapon" ? loot.weaponPool : loot.gearPool;
    for (const id of pool) ids.add(id);
  }
  return [...ids];
}

const weaponVariants = Object.values(WEAPON_DEFS).filter((d) => d.grade);
const gearVariants = Object.values(GEAR_DEFS).filter((d) => d.grade);

describe("the grade catalog", () => {
  it("every pool weapon has an exceptional and an elite version", () => {
    for (const baseId of pooledIds("weapon")) {
      const variants = gradeVariantIds(baseId);
      expect(variants, baseId).toHaveLength(2);
      for (const id of variants) {
        const def = WEAPON_DEFS[id];
        expect(def, id).toBeDefined();
        expect(def!.gradeBase, id).toBe(baseId);
      }
    }
  });

  it("every pool ARMOR piece has them too (charms and bags never grade)", () => {
    for (const baseId of pooledIds("gear")) {
      const base = GEAR_DEFS[baseId]!;
      const variants = gradeVariantIds(baseId);
      if (base.armor === undefined) {
        expect(variants, baseId).toHaveLength(0);
        continue;
      }
      expect(variants, baseId).toHaveLength(2);
      for (const id of variants) {
        expect(GEAR_DEFS[id]?.gradeBase, id).toBe(baseId);
      }
    }
  });

  it("no variant id collides with a hand-authored def", () => {
    // A collision would silently overwrite the authored def at merge time —
    // every def carrying a grade must be a generated one (gradeBase set),
    // and every generated id must resolve back to a live base.
    for (const def of [...weaponVariants, ...gearVariants]) {
      expect(def.gradeBase, def.id).toBeDefined();
      expect(
        WEAPON_DEFS[def.gradeBase!] ?? GEAR_DEFS[def.gradeBase!],
        def.id,
      ).toBeDefined();
      expect(def.id).not.toBe(def.gradeBase);
    }
  });

  it("variants keep the base's look and behavior — only numbers move", () => {
    for (const def of weaponVariants) {
      const base = weaponDef(def.gradeBase!);
      expect(def.icon).toBe(base.icon);
      expect(def.class).toBe(base.class);
      expect(def.cooldownMs).toBe(base.cooldownMs);
      expect(def.range).toBe(base.range);
      expect(def.sweepDeg).toBe(base.sweepDeg);
      expect(def.projectile?.sprite).toBe(base.projectile?.sprite);
    }
    for (const def of gearVariants) {
      const base = GEAR_DEFS[def.gradeBase!]!;
      expect(def.icon).toBe(base.icon);
      expect(def.slot).toBe(base.slot);
    }
  });

  it("each rung asks more levels and pays more, up to requirement 100", () => {
    const reqSpan = { min: Infinity, max: 0 };
    const check = (
      base: WeaponDef | GearDef,
      exceptional: WeaponDef | GearDef,
      elite: WeaponDef | GearDef,
      pays: (def: WeaponDef | GearDef) => number,
    ) => {
      const reqs = [
        base.levelReq ?? 1,
        exceptional.levelReq ?? 1,
        elite.levelReq ?? 1,
      ];
      expect(reqs[1], exceptional.id).toBeGreaterThan(reqs[0]!);
      expect(reqs[2], elite.id).toBeGreaterThan(reqs[1]!);
      expect(pays(exceptional), exceptional.id).toBeGreaterThan(pays(base));
      expect(pays(elite), elite.id).toBeGreaterThan(pays(exceptional));
      reqSpan.min = Math.min(reqSpan.min, reqs[1]!);
      reqSpan.max = Math.max(reqSpan.max, reqs[2]!);
    };
    for (const baseId of pooledIds("weapon")) {
      const [excId, eliteId] = gradeVariantIds(baseId);
      check(
        WEAPON_DEFS[baseId]!,
        WEAPON_DEFS[excId!]!,
        WEAPON_DEFS[eliteId!]!,
        (d) => (d as WeaponDef).damage,
      );
    }
    for (const baseId of pooledIds("gear")) {
      if (GEAR_DEFS[baseId]!.armor === undefined) continue;
      const [excId, eliteId] = gradeVariantIds(baseId);
      check(
        GEAR_DEFS[baseId]!,
        GEAR_DEFS[excId!]!,
        GEAR_DEFS[eliteId!]!,
        (d) => (d as GearDef).armor!,
      );
    }
    // The ladder starts past the normal band and runs to the level cap.
    expect(reqSpan.min).toBeGreaterThanOrEqual(24);
    expect(reqSpan.max).toBe(100);
  });
});

describe("grades in the loot roll", () => {
  it("deep monsters pay upgraded bases out of the authored pool", () => {
    const state = startGame();
    const grades = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const piece = rollEquipment(state, { slot: "weapon", mlvl: 100 });
      const def = weaponDef(piece.defId);
      if (def.grade) grades.add(def.grade);
    }
    // A level-100 horde hands out both exceptional and elite versions.
    expect(grades.has("exceptional")).toBe(true);
    expect(grades.has("elite")).toBe(true);
  });

  it("low-level monsters never drop them (the levelReq gate holds)", () => {
    const state = startGame();
    for (let i = 0; i < 200; i++) {
      const piece = rollEquipment(state, { slot: "weapon", mlvl: 10 });
      expect(weaponDef(piece.defId).grade).toBeUndefined();
    }
  });
});
