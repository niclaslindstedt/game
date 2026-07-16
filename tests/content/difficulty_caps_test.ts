// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The SHIPPED per-difficulty mob-level HARD CAPS (DifficultyDef mobLevelMin/Max)
// and the WoW-style level-difference XP they lean on. These assert the real
// catalog's numbers (easy 1–34 … jesus 58+), so they live in tests/content/
// against the shipped difficulties, not the fixture rungs.

import { describe, expect, it } from "vitest";

import {
  levelDiffXpMult,
  mobArmorMult,
  mobHpScaleFor,
  mobLevelFor,
  mobLevelXp,
} from "@game/core";

describe("shipped mob-level hard caps", () => {
  it("clamps the horde level into each difficulty's band", () => {
    // EASY [1,34]: tracks player−3, but STOPS at 34 once the hero out-levels it.
    expect(mobLevelFor(10, "easy")).toBe(7);
    expect(mobLevelFor(40, "easy")).toBe(34); // ceiling
    // MEDIUM 2–36, HARD 3–38: same shape, a notch higher.
    expect(mobLevelFor(50, "medium")).toBe(36);
    expect(mobLevelFor(50, "hard")).toBe(38);
    // NIGHTMARE [38,56]: a freshly-arrived L34 hero meets FLOORED L38 mobs.
    expect(mobLevelFor(34, "nightmare")).toBe(38); // floor
    expect(mobLevelFor(50, "nightmare")).toBe(50); // tracks in-band
    expect(mobLevelFor(60, "nightmare")).toBe(56); // ceiling
    // JESUS floors at 58, then tracks up (offset +2) with no ceiling in play.
    expect(mobLevelFor(56, "jesus")).toBe(58);
    expect(mobLevelFor(90, "jesus")).toBe(92);
  });

  it("caps the horde's hp at the ceiling instead of scaling forever", () => {
    // Over-levelled easy: the hp scale at hero 40 and 50 is identical — mobs are
    // both stuck at level 34, where uncapped it would keep climbing.
    expect(mobHpScaleFor(40, "easy")).toBeCloseTo(
      mobHpScaleFor(50, "easy"),
      10,
    );
    expect(mobHpScaleFor(50, "easy")).toBeLessThan(
      mobHpScaleFor(50, "nightmare"),
    );
  });

  it("pays a bonus for floored mobs and a pittance for ceiling-stuck ones", () => {
    // A fresh L34 hero entering nightmare fights L38 mobs — an above-level bonus.
    const nmFloor = mobLevelFor(34, "nightmare");
    expect(levelDiffXpMult(nmFloor, 34)).toBeGreaterThan(1);
    // An over-levelled L45 hero farming easy meets stuck L34 mobs — grey-ish XP.
    const easyCeil = mobLevelFor(45, "easy");
    expect(levelDiffXpMult(easyCeil, 45)).toBeLessThan(0.5);
    // A same-level reference mob is neutral (diff 0 → ×1), so the leveling
    // curve's anchor (referenceMobXp = mobLevelXp(L, L)) is unchanged.
    expect(levelDiffXpMult(30, 30)).toBe(1);
    expect(mobLevelXp(30, 30)).toBeGreaterThan(0);
  });
});

describe("mob armor (physical mitigation, rises by rung)", () => {
  it("shaves physical blows but lets magic through untouched", () => {
    // Melee/ranged (physical) are mitigated on every rung that carries armor…
    expect(mobArmorMult("medium", "melee")).toBeCloseTo(0.95); // 5% base
    expect(mobArmorMult("nightmare", "ranged")).toBeCloseTo(0.9); // +5%
    expect(mobArmorMult("jesus", "melee")).toBeCloseTo(0.85); // +10%
    // …MAGIC and class-less sources (powerups, procs, environment) ignore it.
    expect(mobArmorMult("jesus", "magic")).toBe(1);
    expect(mobArmorMult("jesus", undefined)).toBe(1);
  });

  it("rises up the difficulty ladder", () => {
    expect(mobArmorMult("jesus", "melee")).toBeLessThan(
      mobArmorMult("nightmare", "melee"),
    );
    expect(mobArmorMult("nightmare", "melee")).toBeLessThanOrEqual(
      mobArmorMult("medium", "melee"),
    );
  });
});
