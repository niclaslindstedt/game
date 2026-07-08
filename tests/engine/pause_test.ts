// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The pause phase: the world (and its clock) freeze while `paused`, exactly
// like the other non-`playing` phases, and pause/resume only toggle mid-run.

import { describe, expect, it } from "vitest";

import { pauseGame, resumeGame } from "@game/core";
import { clearStage, idle, makeEnemy, run, startGame } from "./helpers.ts";

describe("pause phase", () => {
  it("pauseGame freezes the run and resumeGame lifts it", () => {
    const state = startGame();
    expect(state.phase).toBe("playing");
    pauseGame(state);
    expect(state.phase).toBe("paused");
    resumeGame(state);
    expect(state.phase).toBe("playing");
  });

  it("the simulation clock does not advance while paused", () => {
    const state = startGame();
    pauseGame(state);
    const before = state.stats.timeMs;
    run(state, idle, 500);
    expect(state.stats.timeMs).toBe(before);
  });

  it("enemies hold still while paused, then move again on resume", () => {
    const state = startGame();
    clearStage(state);
    const enemy = makeEnemy({
      pos: { x: state.player.pos.x + 200, y: state.player.pos.y },
      speed: 40,
    });
    state.enemies.push(enemy);
    pauseGame(state);
    const frozenX = enemy.pos.x;
    run(state, idle, 500);
    expect(enemy.pos.x).toBe(frozenX); // no AI ran

    resumeGame(state);
    run(state, idle, 500);
    expect(enemy.pos.x).toBeLessThan(frozenX); // walks toward the player again
  });

  it("pause/resume only toggle from the matching phase", () => {
    const state = startGame();
    // resume from playing is a no-op.
    resumeGame(state);
    expect(state.phase).toBe("playing");
    pauseGame(state);
    // pause again while paused stays paused.
    pauseGame(state);
    expect(state.phase).toBe("paused");
  });
});
