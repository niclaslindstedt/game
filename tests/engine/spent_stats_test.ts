// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// spentStats — the level-up and respec choosers show ONLY the points the
// player personally spent, kept apart from the difficulty head-start
// (create.ts), the automatic per-level growth (leveling.ts), and gear — all of
// which the EFFECTIVE stat folds in. This is the fix for a chooser that looked
// pre-filled with points the player never picked (e.g. at level 2).

import { afterEach, describe, expect, it } from "vitest";

import {
  allocateStat,
  baseStatBonus,
  beginRespec,
  createGame,
  deallocateStat,
  effectiveStat,
  extractLoadout,
  grantXp,
  setAutoStatGainsEnabled,
  STAT_NAMES,
  xpToLevelUp,
  type GameState,
} from "@game/core";

import { clearStage, runUntilChooser, startGame } from "./helpers.ts";

// The engine default is auto-growth ON; the tests that flip it restore it.
afterEach(() => setAutoStatGainsEnabled(true));

function spentTotal(state: GameState): number {
  return STAT_NAMES.reduce((sum, s) => sum + state.player.spentStats[s], 0);
}

/** Ding to level 2 and idle to the open chooser (its first appearance). */
function dingToChooser(state: GameState): void {
  clearStage(state);
  grantXp(state, xpToLevelUp(1));
  runUntilChooser(state);
}

describe("spentStats — the chooser tracks only the player's own picks", () => {
  it("a fresh hero has spent no points", () => {
    const state = startGame();
    expect(spentTotal(state)).toBe(0);
  });

  it("an automatic ding fills the effective stat but leaves the spent tally at zero", () => {
    setAutoStatGainsEnabled(true);
    const state = startGame();
    dingToChooser(state);
    // Leveling handed STAMINA free growth the effective stat now carries…
    expect(baseStatBonus(2, "stamina")).toBeGreaterThan(0);
    expect(effectiveStat(state, "stamina")).toBe(baseStatBonus(2, "stamina"));
    // …but the chooser's tally shows none of it — the player hasn't picked yet.
    expect(state.player.spentStats.stamina).toBe(0);
    expect(spentTotal(state)).toBe(0);
  });

  it("the difficulty head-start is not counted as spent", () => {
    const state = createGame(7, "test_level", "easy");
    // EASY banks a few pre-allocated points into the raw stats…
    expect(state.player.stats.strength).toBeGreaterThan(0);
    // …none of which read as the player's own picks on the chooser.
    expect(spentTotal(state)).toBe(0);
  });

  it("allocating a point records it as the player's own pick", () => {
    const state = startGame();
    dingToChooser(state);
    allocateStat(state, "strength");
    expect(state.player.spentStats.strength).toBe(1);
    expect(state.player.stats.strength).toBe(1);
  });

  it("a respec zeroes the tally, then it grows back as points are re-placed", () => {
    const state = startGame();
    state.player.pendingStatPoints = 2;
    allocateStat(state, "luck");
    allocateStat(state, "luck");
    expect(state.player.spentStats.luck).toBe(2);

    beginRespec(state);
    // The whole refunded pool is re-placed from scratch — spent restarts at 0.
    expect(spentTotal(state)).toBe(0);

    allocateStat(state, "speed");
    expect(state.player.spentStats.speed).toBe(1);
    deallocateStat(state, "speed");
    expect(state.player.spentStats.speed).toBe(0);
    // Floored — a spurious refund never drives the tally negative.
    deallocateStat(state, "speed");
    expect(state.player.spentStats.speed).toBe(0);
  });

  it("a loadout carries the spent tally to the next level", () => {
    const state = startGame();
    dingToChooser(state);
    allocateStat(state, "dexterity");

    const carried = extractLoadout(state);
    expect(carried.spentStats?.dexterity).toBe(1);

    const next = createGame(11, "test_level", "medium", carried);
    expect(next.player.spentStats.dexterity).toBe(1);
  });

  it("a pre-spentStats loadout falls back to its carried stats", () => {
    const legacy = extractLoadout(startGame());
    legacy.stats = {
      stamina: 3,
      strength: 2,
      dexterity: 0,
      intelligence: 0,
      speed: 0,
      luck: 0,
      spirit: 0,
    };
    delete legacy.spentStats;

    const next = createGame(13, "test_level", "medium", legacy);
    expect(next.player.spentStats.stamina).toBe(3);
    expect(next.player.spentStats.strength).toBe(2);
  });
});
