// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The post-victory EPILOGUE (LevelDef.outro) and its VICTORY QUAKE: on a
// level that ships outro pages, clearing the objective arms the quake for
// the whole loot-grab window, and the countdown ends in the `outro` phase
// (advanceOutro pages through to the `victory` splash) instead of jumping
// straight to it. Runs on the synthetic fixtures (test_outro_level).

import { describe, expect, it } from "vitest";

import { advanceOutro, RUN, skipOutro, step } from "@game/core";
import type { GameState } from "@game/core";

import { idle, run, startGame } from "./helpers.ts";

/** Clear the objective: remove the parked boss, then let step() notice. */
function winObjective(state: GameState): void {
  state.enemies = [];
  step(state, idle, 16);
}

describe("the outro epilogue (LevelDef.outro)", () => {
  it("arms the victory quake alongside the countdown", () => {
    const state = startGame(42, "test_outro_level");
    expect(state.quakeMs).toBe(0);
    winObjective(state);
    expect(state.victoryCountdownMs).not.toBeNull();
    expect(state.quakeMs).toBeGreaterThan(0);
  });

  it("enters the outro phase when the countdown runs out, victory event first", () => {
    const state = startGame(42, "test_outro_level");
    winObjective(state);
    run(state, idle, Math.ceil(RUN.victoryDelayMs / 16) + 2);
    expect(state.phase).toBe("outro");
    expect(state.outroPage).toBe(0);
    // The quake burned down with the countdown.
    expect(state.quakeMs).toBe(0);
  });

  it("advanceOutro pages through to the victory splash", () => {
    const state = startGame(42, "test_outro_level");
    winObjective(state);
    run(state, idle, Math.ceil(RUN.victoryDelayMs / 16) + 2);
    advanceOutro(state); // page 1 → 2
    expect(state.phase).toBe("outro");
    advanceOutro(state); // past the last page
    expect(state.phase).toBe("victory");
  });

  it("skipOutro bails straight to the splash", () => {
    const state = startGame(42, "test_outro_level");
    winObjective(state);
    run(state, idle, Math.ceil(RUN.victoryDelayMs / 16) + 2);
    skipOutro(state);
    expect(state.phase).toBe("victory");
  });

  it("levels without an outro go straight to victory, no quake", () => {
    const state = startGame(42, "test_well_level");
    state.enemies = [];
    step(state, idle, 16);
    expect(state.quakeMs).toBe(0);
    run(state, idle, Math.ceil(RUN.victoryDelayMs / 16) + 2);
    expect(state.phase).toBe("victory");
  });
});
