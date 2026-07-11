// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Per-map XP caps (config XP_CAP, `xpLevelCap`/`xpCapMultiplier` in
// leveling.ts): every (level × difficulty) pair has a hero-level ceiling —
// XP diminishes across the approach and stops AT the cap, so re-running an
// outgrown map farms loot, never levels. The fixture catalog ships two story
// levels, so the rung's first/last band lands whole on them.

import {
  grantXp,
  LEVELING,
  levelPosition,
  XP_CAP,
  xpCapMultiplier,
  xpLevelCap,
  xpToLevelUp,
} from "@game/core";
import { describe, expect, it } from "vitest";

import { clearStage, startGame } from "./helpers.ts";

describe("xpLevelCap — the per-map ceiling", () => {
  it("lands the rung's first/last band on the story order", () => {
    // Fixtures ship two story indexes: test_level (first) and test_level_2
    // (last), so the band's endpoints land on them exactly.
    expect(levelPosition("test_level")).toEqual({ position: 0, total: 2 });
    expect(levelPosition("test_level_2")).toEqual({ position: 1, total: 2 });
    const band = XP_CAP.capByDifficulty.medium!;
    expect(xpLevelCap("test_level", "medium")).toBe(band.first);
    expect(xpLevelCap("test_level_2", "medium")).toBe(band.last);
  });

  it("harder rungs cap higher on the same map", () => {
    expect(xpLevelCap("test_level", "easy")).toBeLessThan(
      xpLevelCap("test_level", "medium"),
    );
    expect(xpLevelCap("test_level", "medium")).toBeLessThan(
      xpLevelCap("test_level", "jesus"),
    );
  });

  it("never exceeds the global level cap, and unknown rungs are uncapped", () => {
    expect(xpLevelCap("test_level_2", "jesus")).toBeLessThanOrEqual(
      LEVELING.maxLevel,
    );
    // A difficulty outside the shipped ladder (a fixture rung) is uncapped —
    // only the global maxLevel holds.
    expect(xpLevelCap("test_level", "custom_rung")).toBe(LEVELING.maxLevel);
  });
});

describe("xpCapMultiplier — the taper into the wall", () => {
  it("pays full XP until the fade band, halves per level, zeroes at the cap", () => {
    const cap = 20;
    const fadeFrom = cap - XP_CAP.fadeLevels;
    expect(xpCapMultiplier(1, cap)).toBe(1);
    expect(xpCapMultiplier(fadeFrom, cap)).toBe(1);
    expect(xpCapMultiplier(fadeFrom + 1, cap)).toBeCloseTo(0.5);
    expect(xpCapMultiplier(fadeFrom + 2, cap)).toBeCloseTo(0.25);
    expect(xpCapMultiplier(cap, cap)).toBe(0);
    expect(xpCapMultiplier(cap + 10, cap)).toBe(0);
  });
});

describe("grantXp obeys the per-map cap", () => {
  it("a hero AT the map's cap gains nothing — the map only pays loot now", () => {
    const state = startGame(); // test_level on medium → cap = band.first
    clearStage(state);
    const cap = xpLevelCap("test_level", "medium");
    state.player.level = cap;
    state.player.xpToNext = xpToLevelUp(cap);
    grantXp(state, 100_000);
    expect(state.player.xp).toBe(0);
    expect(state.player.level).toBe(cap);
    expect(state.stats.xpGained).toBe(0);
  });

  it("a hero inside the fade band gains a diminished grant", () => {
    const state = startGame();
    clearStage(state);
    const cap = xpLevelCap("test_level", "medium");
    const level = cap - 1; // deepest fade rung above zero
    state.player.level = level;
    state.player.xpToNext = xpToLevelUp(level);
    grantXp(state, 1000);
    expect(state.player.xp).toBe(
      Math.round(1000 * xpCapMultiplier(level, cap)),
    );
  });

  it("a hero well under the cap gains full XP", () => {
    const state = startGame();
    clearStage(state);
    grantXp(state, 50); // level 1 vs cap 26: far below the fade band
    expect(state.player.xp).toBe(50);
  });
});
