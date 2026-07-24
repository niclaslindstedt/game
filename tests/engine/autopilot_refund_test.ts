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
  "spirit",
] as const;

/** Zero the six stats AND the chosen tally, for a clean from-scratch baseline
 * (no difficulty head-start muddying the point math). */
function wipeStats(state: GameState): void {
  for (const stat of STATS) {
    state.player.stats[stat] = 0;
    state.player.spentStats[stat] = 0;
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
  const p = state.player;
  wipeStats(state);
  p.level = 10;
  p.stats.strength = 10;
  p.spentStats.strength = 10;
  reconcileTalentPoints(state);
  expect(spendTalentPoint(state, "executioner")).toBe(true);
  const snapshot = captureBuildSnapshot(state);

  // The ride flies to 20 and the bot pours every earned point into STR,
  // ranking EXECUTIONER up and buying TWIN STRIKE.
  p.level = 20;
  p.stats.strength = 10 + RIDE_POINTS;
  p.spentStats.strength = 10 + RIDE_POINTS;
  p.talents.executioner = 2;
  p.talents.twin_strike = 1;
  p.pendingStatPoints = 0;
  reconcileTalentPoints(state);
  return { state, snapshot };
}

describe("refundAutopilotBuild", () => {
  it("reverts the chosen spec to the pre-ride snapshot", () => {
    const { state, snapshot } = midRideHero();
    refundAutopilotBuild(state, snapshot);
    const p = state.player;
    expect(p.stats.strength).toBe(10);
    expect(p.spentStats.strength).toBe(10);
    expect(p.talents).toEqual({ executioner: 1 });
  });

  it("hands every point earned across the ride back as unspent", () => {
    const { state, snapshot } = midRideHero();
    refundAutopilotBuild(state, snapshot);
    // Exactly the points the ride spent across levels 10 → 20.
    expect(state.player.pendingStatPoints).toBe(RIDE_POINTS);
    // The talent queue is empty for now — the reverted 10 STR still just
    // supports the single EXECUTIONER rank; it re-mints as the points are placed.
    expect(state.pendingTalentPoints).toEqual([]);
    expect(hasPendingPoints(state)).toBe(true);
  });

  it("keeps the level, xp and gear the ride actually won", () => {
    const { state, snapshot } = midRideHero();
    const weapon = state.player.equipment.weapon;
    state.player.xp = 123;
    refundAutopilotBuild(state, snapshot);
    expect(state.player.level).toBe(20);
    expect(state.player.xp).toBe(123);
    expect(state.player.equipment.weapon).toBe(weapon);
  });

  it("refunds only the ride's DELTA, never a build folded in by a respec", () => {
    // A veteran who respecced folds his difficulty head-start into `spentStats`,
    // so the chosen tally sits ABOVE the level's trainable total. The refund
    // must hand back only what the ride added — measured as a delta — never that
    // pre-existing pile.
    const state = startGame();
    const p = state.player;
    wipeStats(state);
    p.level = 30;
    p.stats.strength = 50; // 50 chosen (head-start-inflated), above the curve
    p.spentStats.strength = 50;
    reconcileTalentPoints(state);
    const snapshot = captureBuildSnapshot(state);

    // The ride adds a modest 7 points.
    p.stats.strength = 57;
    p.spentStats.strength = 57;
    reconcileTalentPoints(state);

    refundAutopilotBuild(state, snapshot);
    expect(state.player.pendingStatPoints).toBe(7);
    expect(state.player.spentStats.strength).toBe(50);
  });

  it("lets the player rebuild the whole spec down a different lane", () => {
    const { state, snapshot } = midRideHero();
    refundAutopilotBuild(state, snapshot);
    const owed = state.player.pendingStatPoints;
    // The bot flew MELEE (STR); the player pours it all into DEXTERITY instead —
    // the ride decided nothing, the spec is entirely the player's.
    for (let i = 0; i < owed; i++)
      expect(allocateStat(state, "dexterity")).toBe(true);
    expect(state.player.pendingStatPoints).toBe(0);
    expect(state.player.spentStats.dexterity).toBe(owed);
    // Crossing DEX milestones minted the player fresh RANGED talent points.
    expect(state.pendingTalentPoints.every((s) => s === "dexterity")).toBe(
      true,
    );
    expect(state.pendingTalentPoints.length).toBeGreaterThan(0);
    // The melee pick the player brought to the ride is untouched.
    expect(talentRank(state, "executioner")).toBe(1);
  });
});

describe("carrying the refund across a bank + fresh run", () => {
  it("extractLoadout carries the handed-back points, applyLoadout restores them", () => {
    const { state, snapshot } = midRideHero();
    refundAutopilotBuild(state, snapshot);
    const owed = state.player.pendingStatPoints;
    expect(owed).toBeGreaterThan(0);

    const loadout = extractLoadout(state);
    expect(loadout.pendingStatPoints).toBe(owed);

    // Dress a fresh run in the banked (refunded) build.
    const next = createGame(1, "test_level", "medium", loadout);
    expect(next.player.pendingStatPoints).toBe(owed);
    // The pre-ride talent rank rode along, unspent points and all.
    expect(talentRank(next, "executioner")).toBe(1);
  });

  it("the run's opener greets the chooser when the hero owes points", () => {
    const { state, snapshot } = midRideHero();
    refundAutopilotBuild(state, snapshot);
    const loadout = extractLoadout(state);

    const next = createGame(1, "test_level", "medium", loadout);
    skipCutscene(next);
    dismissIntro(next);
    // Instead of dropping straight into play, the opener opens the level-up
    // chooser so the player places the handed-back points first.
    expect(next.phase).toBe("levelup");
  });

  it("drops straight into play when nothing is owed (an ordinary carry)", () => {
    const carrier = startGame();
    carrier.player.level = 8;
    const loadout = extractLoadout(carrier);
    expect(loadout.pendingStatPoints).toBe(0);
    const next = createGame(1, "test_level", "medium", loadout);
    skipCutscene(next);
    dismissIntro(next);
    expect(next.phase).toBe("playing");
  });
});

describe("promptPendingPoints / resumeGame diversion", () => {
  it("opens the chooser mid-play when points are owed", () => {
    const state = startGame();
    state.player.pendingStatPoints = 3;
    expect(promptPendingPoints(state)).toBe(true);
    expect(state.phase).toBe("levelup");
  });

  it("is a no-op with nothing owed, or from a non-playing phase", () => {
    const state = startGame();
    expect(promptPendingPoints(state)).toBe(false);
    expect(state.phase).toBe("playing");
    // From the pause screen it does NOT divert — a resume handles that path
    // (so the music resumes with it); the point owed just waits.
    pauseGame(state);
    state.player.pendingStatPoints = 5;
    expect(promptPendingPoints(state)).toBe(false);
    expect(state.phase).toBe("paused");
  });

  it("a resume with points owed opens the chooser, not play", () => {
    const state = startGame();
    pauseGame(state);
    state.player.pendingStatPoints = 2;
    resumeGame(state);
    expect(state.phase).toBe("levelup");
  });

  it("a resume with nothing owed drops back into play", () => {
    const state = startGame();
    pauseGame(state);
    resumeGame(state);
    expect(state.phase).toBe("playing");
  });
});
