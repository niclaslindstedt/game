// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// AUTO PILOT is HARMLESS TO THE BUILD: the paid ride's bot allocates stat and
// talent points so it can fight, but when the ride stops those allocations are
// handed BACK as unspent points for the player to place themselves
// (`refundAutopilotBuild`). The refund reverts the chosen spec to the pre-ride
// snapshot while keeping the level/xp/gear the ride won, carries the handed-back
// points through the loadout, and the run's opener / a resume reopens the
// chooser so the pile is never left silently on the table.
//
// Talents are engine machinery (like the built-in `blaster` sidearm), so these
// tests reference the shipped talent ids directly.

import { describe, expect, it } from "vitest";

import {
  allocateStat,
  captureBuildSnapshot,
  chosenStatPointsThrough,
  createGame,
  dismissIntro,
  extractLoadout,
  hasPendingPoints,
  pauseGame,
  promptPendingPoints,
  reconcileTalentPoints,
  refundAutopilotBuild,
  resumeGame,
  skipCutscene,
  spendTalentPoint,
  talentRank,
} from "@game/core";
import type { GameState } from "@game/core";

import { startGame } from "./helpers.ts";

const STATS = [
  "stamina",
  "strength",
  "dexterity",
  "intelligence",
  "luck",
] as const;

/** Zero the five stats AND the chosen tally, for a clean from-scratch baseline
 * (no difficulty head-start muddying the point math). */
function wipeStats(state: GameState): void {
  for (const stat of STATS) {
    state.players[0].stats[stat] = 0;
    state.players[0].spentStats[stat] = 0;
  }
}

/** The points the ride earns flying levels 10 → 20 (and the bot spends). */
const RIDE_POINTS = chosenStatPointsThrough(20) - chosenStatPointsThrough(10);

/**
 * A hero mid-flight on the AUTO PILOT: he came to the ride at level 10 with a
 * hand-picked build (10 STR → one melee point, sunk into EXECUTIONER), and the
 * ride has since flown him to level 20 pouring the earned points into STR —
 * ranking EXECUTIONER up and buying TWIN STRIKE. Returns the state and the
 * pre-ride snapshot the ride captured on engage.
 */
function midRideHero() {
  const state = startGame();
  const p = state.players[0];
  wipeStats(state);
  p.level = 10;
  p.stats.strength = 10;
  p.spentStats.strength = 10;
  reconcileTalentPoints(state, state.players[0]);
  expect(spendTalentPoint(state, state.players[0], "executioner")).toBe(true);
  const snapshot = captureBuildSnapshot(state, state.players[0]);

  // The ride flies to 20 and the bot pours every earned point into STR,
  // ranking EXECUTIONER up and buying TWIN STRIKE.
  p.level = 20;
  p.stats.strength = 10 + RIDE_POINTS;
  p.spentStats.strength = 10 + RIDE_POINTS;
  p.talents.executioner = 2;
  p.talents.twin_strike = 1;
  p.pendingStatPoints = 0;
  reconcileTalentPoints(state, state.players[0]);
  return { state, snapshot };
}

describe("refundAutopilotBuild", () => {
  it("reverts the chosen spec to the pre-ride snapshot", () => {
    const { state, snapshot } = midRideHero();
    refundAutopilotBuild(state, state.players[0], snapshot);
    const p = state.players[0];
    expect(p.stats.strength).toBe(10);
    expect(p.spentStats.strength).toBe(10);
    expect(p.talents).toEqual({ executioner: 1 });
  });

  it("hands every point earned across the ride back as unspent", () => {
    const { state, snapshot } = midRideHero();
    refundAutopilotBuild(state, state.players[0], snapshot);
    // Exactly the points the ride spent across levels 10 → 20.
    expect(state.players[0].pendingStatPoints).toBe(RIDE_POINTS);
    // The talent queue is empty for now — the reverted 10 STR still just
    // supports the single EXECUTIONER rank; it re-mints as the points are placed.
    expect(state.players[0].pendingTalentPoints).toEqual([]);
    expect(hasPendingPoints(state.players[0])).toBe(true);
  });

  it("keeps the level, xp and gear the ride actually won", () => {
    const { state, snapshot } = midRideHero();
    const weapon = state.players[0].equipment.weapon;
    state.players[0].xp = 123;
    refundAutopilotBuild(state, state.players[0], snapshot);
    expect(state.players[0].level).toBe(20);
    expect(state.players[0].xp).toBe(123);
    expect(state.players[0].equipment.weapon).toBe(weapon);
  });

  it("refunds only the ride's DELTA, never a build folded in by a respec", () => {
    // A veteran who respecced folds his difficulty head-start into `spentStats`,
    // so the chosen tally sits ABOVE the level's trainable total. The refund
    // must hand back only what the ride added — measured as a delta — never that
    // pre-existing pile.
    const state = startGame();
    const p = state.players[0];
    wipeStats(state);
    p.level = 30;
    p.stats.strength = 50; // 50 chosen (head-start-inflated), above the curve
    p.spentStats.strength = 50;
    reconcileTalentPoints(state, state.players[0]);
    const snapshot = captureBuildSnapshot(state, state.players[0]);

    // The ride adds a modest 7 points.
    p.stats.strength = 57;
    p.spentStats.strength = 57;
    reconcileTalentPoints(state, state.players[0]);

    refundAutopilotBuild(state, state.players[0], snapshot);
    expect(state.players[0].pendingStatPoints).toBe(7);
    expect(state.players[0].spentStats.strength).toBe(50);
  });

  it("lets the player rebuild the whole spec down a different lane", () => {
    const { state, snapshot } = midRideHero();
    refundAutopilotBuild(state, state.players[0], snapshot);
    const owed = state.players[0].pendingStatPoints;
    // The bot flew MELEE (STR); the player pours it all into DEXTERITY instead —
    // the ride decided nothing, the spec is entirely the player's.
    for (let i = 0; i < owed; i++)
      expect(allocateStat(state, state.players[0], "dexterity")).toBe(true);
    expect(state.players[0].pendingStatPoints).toBe(0);
    expect(state.players[0].spentStats.dexterity).toBe(owed);
    // Crossing DEX milestones minted the player fresh RANGED talent points.
    expect(
      state.players[0].pendingTalentPoints.every((s) => s === "dexterity"),
    ).toBe(true);
    expect(state.players[0].pendingTalentPoints.length).toBeGreaterThan(0);
    // The melee pick the player brought to the ride is untouched.
    expect(talentRank(state, state.players[0], "executioner")).toBe(1);
  });
});

describe("carrying the refund across a bank + fresh run", () => {
  it("extractLoadout carries the handed-back points, applyLoadout restores them", () => {
    const { state, snapshot } = midRideHero();
    refundAutopilotBuild(state, state.players[0], snapshot);
    const owed = state.players[0].pendingStatPoints;
    expect(owed).toBeGreaterThan(0);

    const loadout = extractLoadout(state, state.players[0]);
    expect(loadout.pendingStatPoints).toBe(owed);

    // Dress a fresh run in the banked (refunded) build.
    const next = createGame(1, "test_level", "medium", loadout);
    expect(next.players[0].pendingStatPoints).toBe(owed);
    // The pre-ride talent rank rode along, unspent points and all.
    expect(talentRank(next, next.players[0], "executioner")).toBe(1);
  });

  it("the run's opener greets the chooser when the hero owes points", () => {
    const { state, snapshot } = midRideHero();
    refundAutopilotBuild(state, state.players[0], snapshot);
    const loadout = extractLoadout(state, state.players[0]);

    const next = createGame(1, "test_level", "medium", loadout);
    skipCutscene(next);
    dismissIntro(next);
    // The opener drops into play but greets the hero with his chooser open,
    // so the player places the handed-back points first.
    expect(next.phase).toBe("playing");
    expect(next.players[0].screen).toBe("levelup");
  });

  it("drops straight into play when nothing is owed (an ordinary carry)", () => {
    const carrier = startGame();
    carrier.players[0].level = 8;
    const loadout = extractLoadout(carrier, carrier.players[0]);
    expect(loadout.pendingStatPoints).toBe(0);
    const next = createGame(1, "test_level", "medium", loadout);
    skipCutscene(next);
    dismissIntro(next);
    expect(next.phase).toBe("playing");
    expect(next.players[0].screen).toBeUndefined();
  });
});

describe("promptPendingPoints and the pause screen", () => {
  it("opens the chooser mid-play when points are owed", () => {
    const state = startGame();
    state.players[0].pendingStatPoints = 3;
    expect(promptPendingPoints(state, state.players[0])).toBe(true);
    expect(state.players[0].screen).toBe("levelup");
  });

  it("is a no-op with nothing owed, or with another screen up", () => {
    const state = startGame();
    expect(promptPendingPoints(state, state.players[0])).toBe(false);
    expect(state.players[0].screen).toBeUndefined();
    // With the pause menu up it does NOT fight over the stage — the point
    // owed just waits, banked, until the field is back.
    pauseGame(state, state.players[0]);
    state.players[0].pendingStatPoints = 5;
    expect(promptPendingPoints(state, state.players[0])).toBe(false);
    expect(state.players[0].screen).toBe("paused");
  });

  it("a resume with points owed keeps them banked for the on-demand chooser", () => {
    const state = startGame();
    pauseGame(state, state.players[0]);
    state.players[0].pendingStatPoints = 2;
    resumeGame(state.players[0]);
    // No divert: the resume just takes the field back, the points wait.
    expect(state.players[0].screen).toBeUndefined();
    expect(state.players[0].pendingStatPoints).toBe(2);
    // The chooser opens on demand.
    expect(promptPendingPoints(state, state.players[0])).toBe(true);
    expect(state.players[0].screen).toBe("levelup");
  });

  it("a resume with nothing owed drops back into play", () => {
    const state = startGame();
    pauseGame(state, state.players[0]);
    resumeGame(state.players[0]);
    expect(state.players[0].screen).toBeUndefined();
  });
});
