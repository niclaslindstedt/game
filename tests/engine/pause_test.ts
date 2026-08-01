// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The pause screen: per-player since the screens split — the phase stays `playing`
// and the hero's own `screen` carries the menu. Solo, one hero with the menu
// up freezes the world (and its clock) exactly as the old `paused` phase did.

import { describe, expect, it } from "vitest";

import { pauseGame, resumeGame } from "@game/core";
import { clearStage, idle, makeEnemy, run, startGame } from "./helpers.ts";

describe("pause screen", () => {
  it("pauseGame freezes the run and resumeGame lifts it", () => {
    const state = startGame();
    expect(state.phase).toBe("playing");
    pauseGame(state, state.players[0]);
    expect(state.phase).toBe("playing");
    expect(state.players[0].screen).toBe("paused");
    resumeGame(state.players[0]);
    expect(state.players[0].screen).toBeUndefined();
  });

  it("the simulation clock does not advance while paused", () => {
    const state = startGame();
    pauseGame(state, state.players[0]);
    const before = state.stats.timeMs;
    run(state, idle, 500);
    expect(state.stats.timeMs).toBe(before);
  });

  it("enemies hold still while paused, then move again on resume", () => {
    const state = startGame();
    clearStage(state);
    const enemy = makeEnemy({
      pos: { x: state.players[0].pos.x + 200, y: state.players[0].pos.y },
      speed: 40,
    });
    state.enemies.push(enemy);
    pauseGame(state, state.players[0]);
    const frozenX = enemy.pos.x;
    run(state, idle, 500);
    expect(enemy.pos.x).toBe(frozenX); // no AI ran

    resumeGame(state.players[0]);
    run(state, idle, 500);
    expect(enemy.pos.x).toBeLessThan(frozenX); // walks toward the player again
  });

  it("pause/resume only toggle from the matching screen", () => {
    const state = startGame();
    // resume with nothing up is a no-op.
    resumeGame(state.players[0]);
    expect(state.players[0].screen).toBeUndefined();
    pauseGame(state, state.players[0]);
    // pause again while paused stays paused.
    pauseGame(state, state.players[0]);
    expect(state.players[0].screen).toBe("paused");
  });
});
