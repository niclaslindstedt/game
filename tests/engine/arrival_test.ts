// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The seasoned arrival (src/game/arrival.ts): a run that starts past the
// campaign opener spawns the hero as if he cleared the earlier levels — a
// player level derived from their rosters through the real XP curve, stat
// points auto-spent, and the previous level's kit in hand. The opener
// itself is untouched: level 1, crude sword, bare hands.

import { describe, expect, it } from "vitest";

import { ARRIVAL, createGame, LEVELING, PLAYER } from "@game/core";
// Importing the helper installs the fixture catalogs as a side effect.
import { SEED } from "./helpers.ts";

// The fixture reference level's total roster XP (spawns + wave budget), the
// number the derivation discounts by ARRIVAL.clearShare:
//   spawns  8×10 + 6×45 + 4×90 + 550(boss) = 1 260
//   waves   500×10 + 400×45 + 300×90       = 50 000
const FIX_LEVEL_XP = 51_260;

describe("seasoned arrival", () => {
  it("leaves the campaign opener exactly as authored", () => {
    const state = createGame(SEED, "test_level");
    expect(state.player.level).toBe(1);
    expect(state.player.equipment.weapon.defId).toBe("crude_sword");
    expect(state.player.equipment.suit).toBeNull();
    expect(state.player.equipment.charm).toBeNull();
    expect(state.player.heldAbilities).toEqual([]);
    expect(Object.values(state.player.stats).every((v) => v === 0)).toBe(true);
  });

  it("derives the player level from the cleared rosters through the XP curve", () => {
    const state = createGame(SEED, "test_level_2");
    const player = state.player;

    // Walk the same curve the derivation walks, from the known roster total.
    let xp = Math.round(FIX_LEVEL_XP * ARRIVAL.clearShare);
    let level = 1;
    let xpToNext: number = LEVELING.baseXpToLevel;
    while (xp >= xpToNext) {
      xp -= xpToNext;
      level++;
      xpToNext = Math.round(
        LEVELING.baseXpToLevel * Math.pow(LEVELING.xpGrowth, level - 1),
      );
    }
    expect(player.level).toBe(level);
    expect(player.level).toBeGreaterThan(5); // sanity: genuinely seasoned
    expect(player.xp).toBe(xp);
    expect(player.xpToNext).toBe(xpToNext);
  });

  it("auto-spends every banked stat point round-robin", () => {
    const state = createGame(SEED, "test_level_2");
    const player = state.player;
    expect(player.pendingStatPoints).toBe(0);
    const spent = Object.values(player.stats).reduce((a, b) => a + b, 0);
    expect(spent).toBe((player.level - 1) * LEVELING.statPointsPerLevel);
    // Round-robin keeps the spread flat: no stat more than one ahead.
    const values = Object.values(player.stats);
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
  });

  it("arrives with the previous level's kit, fresh and fastened", () => {
    const state = createGame(SEED, "test_level_2");
    const player = state.player;
    // test_level's scripted early-drop weapon is its signature.
    expect(player.equipment.weapon.defId).toBe("test_hammer");
    expect(player.equipment.weapon.durability).toBeGreaterThan(0);
    expect(player.equipment.suit?.defId).toBe("test_suit");
    expect(player.equipment.charm?.defId).toBe("test_charm");
    // The plated suit arrives fastened, and health/stamina arrive full at
    // the grown maxima.
    expect(player.armor).toBeGreaterThan(0);
    expect(player.hp).toBe(player.maxHp);
    expect(player.maxHp).toBeGreaterThan(PLAYER.maxHp);
    expect(player.stamina).toBe(player.maxStamina);
    // A couple of the previous level's powerups ride along.
    expect(player.heldAbilities).toEqual(
      ["test_orbit", "test_storm"].slice(0, ARRIVAL.heldAbilities),
    );
  });

  it("keeps the seasoned start deterministic per (seed, level)", () => {
    const a = createGame(SEED, "test_level_2");
    const b = createGame(SEED, "test_level_2");
    expect(a.player.level).toBe(b.player.level);
    expect(a.player.stats).toEqual(b.player.stats);
    expect(a.player.equipment.weapon.defId).toBe(
      b.player.equipment.weapon.defId,
    );
  });
});
