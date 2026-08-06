// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The pause screen: per-player since the screens split — the phase stays `playing`
// and the hero's own `screen` carries the menu. Solo, one hero with the menu
// up freezes the world (and its clock) exactly as the old `paused` phase did.

import { describe, expect, it } from "vitest";

import {
  advanceDialogue,
  canPauseGame,
  collectStoryItem,
  pauseGame,
  resumeGame,
} from "@game/core";
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

  it("opens over an in-world dialogue and hands the scene back", () => {
    const state = startGame();
    clearStage(state);
    state.enemies.push(
      makeEnemy(
        { pos: { x: state.players[0].pos.x + 40, y: state.players[0].pos.y } },
        "test_boss",
      ),
    );
    run(state, idle, 60, (s) => s.phase === "dialogue");
    expect(state.phase).toBe("dialogue");

    expect(canPauseGame(state, state.players[0])).toBe(true);
    pauseGame(state, state.players[0]);
    // The scene keeps the global stage; the menu rides on the hero's screen.
    expect(state.phase).toBe("dialogue");
    expect(state.players[0].screen).toBe("paused");
    expect(state.dialogue).not.toBeNull();

    resumeGame(state.players[0]);
    expect(state.players[0].screen).toBeUndefined();
    expect(state.phase).toBe("dialogue");
    expect(state.dialogue?.page).toBe(0); // no page turned behind the menu
  });

  it("opens over a story-item find too — every scene, not only an arrival", () => {
    const state = startGame();
    clearStage(state);
    collectStoryItem(state, "test_key", { ...state.players[0].pos });
    expect(state.phase).toBe("dialogue");
    pauseGame(state, state.players[0]);
    expect(state.players[0].screen).toBe("paused");
    resumeGame(state.players[0]);
    advanceDialogue(state);
    expect(state.phase).toBe("playing");
  });

  it("stays shut over the scenes that own the whole stage", () => {
    const state = startGame();
    for (const phase of ["cutscene", "intro", "outro", "victory"] as const) {
      state.phase = phase;
      expect(canPauseGame(state, state.players[0])).toBe(false);
      pauseGame(state, state.players[0]);
      expect(state.players[0].screen).toBeUndefined();
    }
  });

  it("refuses a hero who already has another screen up", () => {
    const state = startGame();
    state.players[0].screen = "inventory";
    expect(canPauseGame(state, state.players[0])).toBe(false);
    pauseGame(state, state.players[0]);
    expect(state.players[0].screen).toBe("inventory");
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
