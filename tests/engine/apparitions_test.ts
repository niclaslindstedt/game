// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Apparitions (`EnemyDef.apparition`): dialogue-only figures. One rushes in
// and delivers its scene like any elite speaker, but nothing can hit it
// (weapons, abilities, hazards), its touch is cold air, it never counts as
// a foe — and once it has spoken it walks off and dissolves with an
// `apparitionVanished` event.

import { describe, expect, it } from "vitest";

import { advanceDialogue, APPARITION, dialogueContent, step } from "@game/core";
import type { Enemy, GameState } from "@game/core";
import {
  DT,
  equipBlaster,
  idle,
  makeEnemy,
  run,
  startGame,
} from "./helpers.ts";

/** The apparition level, staged down to the figure and the parked boss —
 * clearStage would sweep the apparition too (it keeps only bosses). */
function stageApparition(state: GameState): Enemy {
  state.enemies = state.enemies.filter(
    (e) => e.defId === "test_apparition" || e.defId === "test_boss",
  );
  const ghost = state.enemies.find((e) => e.defId === "test_apparition");
  expect(ghost).toBeDefined();
  return ghost!;
}

/** Park the figure beside the hero and play its scene through. */
function meetAndTapThrough(state: GameState, ghost: Enemy): void {
  ghost.pos = { x: state.player.pos.x + 40, y: state.player.pos.y };
  run(state, idle, 60, (s) => s.phase === "dialogue");
  expect(state.phase).toBe("dialogue");
  advanceDialogue(state);
  advanceDialogue(state);
  expect(state.phase).toBe("playing");
}

describe("apparitions", () => {
  it("never counts toward the level's foes", () => {
    const state = startGame(42, "test_apparition_level");
    // The placed roster is the apparition + the boss; only the boss is a foe.
    expect(state.stats.totalEnemies).toBe(1);
  });

  it("rushes in and delivers its scene like any elite speaker", () => {
    const state = startGame(42, "test_apparition_level");
    const ghost = stageApparition(state);
    ghost.pos = { x: state.player.pos.x + 200, y: state.player.pos.y };
    ghost.speed = 20;
    run(state, idle, 400, (s) => s.phase === "dialogue");
    expect(state.phase).toBe("dialogue");
    expect(dialogueContent(state.dialogue!).pages).toEqual([
      ["TEST APPARITION LINE ONE."],
      ["TEST APPARITION LINE TWO."],
    ]);
  });

  it("rides out a screen nuke that kills the minion beside it", () => {
    const state = startGame(42, "test_apparition_level");
    const ghost = stageApparition(state);
    ghost.spoke = true;
    ghost.vanishMs = 999_999;
    ghost.pos = { x: state.player.pos.x + 30, y: state.player.pos.y };
    state.enemies.push(
      makeEnemy({
        pos: { x: state.player.pos.x - 30, y: state.player.pos.y },
      }),
    );
    state.player.heldAbilities.push("test_nuke");
    step(
      state,
      { steering: false, target: { x: 0, y: 0 }, jump: false, useItem: true },
      DT,
    );
    expect(state.enemies.some((e) => e.defId === "test_minion")).toBe(false);
    expect(state.enemies).toContain(ghost);
    expect(ghost.hp).toBe(ghost.maxHp);
  });

  it("is never targeted by the auto-weapon", () => {
    const state = startGame(42, "test_apparition_level");
    const ghost = stageApparition(state);
    equipBlaster(state);
    // Mark it spoken so the scene doesn't pause the run mid-test.
    ghost.spoke = true;
    ghost.vanishMs = 999_999; // hold it on the board
    ghost.pos = { x: state.player.pos.x + 60, y: state.player.pos.y };
    run(state, idle, 30);
    expect(state.stats.shotsFired).toBe(0);
  });

  it("deals no contact damage", () => {
    const state = startGame(42, "test_apparition_level");
    const ghost = stageApparition(state);
    ghost.spoke = true;
    ghost.vanishMs = 999_999;
    ghost.pos = { ...state.player.pos };
    const hpBefore = state.player.hp;
    run(state, idle, 30);
    expect(state.player.hp).toBe(hpBefore);
  });

  it("walks off and dissolves after its scene", () => {
    const state = startGame(42, "test_apparition_level");
    const ghost = stageApparition(state);
    ghost.speed = 20;
    meetAndTapThrough(state, ghost);

    // It drifts away from the hero while the linger runs out…
    const before = Math.hypot(
      ghost.pos.x - state.player.pos.x,
      ghost.pos.y - state.player.pos.y,
    );
    run(state, idle, 20);
    const after = Math.hypot(
      ghost.pos.x - state.player.pos.x,
      ghost.pos.y - state.player.pos.y,
    );
    expect(after).toBeGreaterThan(before);

    // …then leaves the board with the vanish event.
    let vanished = false;
    for (
      let i = 0;
      i < Math.ceil(APPARITION.lingerMs / DT) + 10 && !vanished;
      i++
    ) {
      step(state, idle, DT);
      vanished = state.events.some((e) => e.type === "apparitionVanished");
    }
    expect(vanished).toBe(true);
    expect(state.enemies.some((e) => e.defId === "test_apparition")).toBe(
      false,
    );
    expect(state.stats.kills).toBe(0);
  });
});
