// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Solid obstacles: nothing walks through one, jumpable ones can be cleared
// mid-air by the player (never by monsters), and generation keeps them off
// spawns and landmarks.

import { describe, expect, it } from "vitest";

import { createGame, enemyDef, OBSTACLES, PLAYER, step } from "@game/core";
import type { GameState, Obstacle } from "@game/core";
import {
  clearStage,
  DT,
  idle,
  makeEnemy,
  run,
  startGame,
  steerTo,
} from "./helpers.ts";

function placeObstacle(
  state: GameState,
  dx: number,
  jumpable: boolean,
  radius = 12,
): Obstacle {
  const obstacle: Obstacle = {
    id: 8000,
    kind: jumpable ? "rock" : "boulder",
    pos: { x: state.player.pos.x + dx, y: state.player.pos.y },
    radius,
    jumpable,
  };
  state.obstacles = [obstacle];
  return obstacle;
}

describe("obstacle collision", () => {
  it("stops the player from walking through", () => {
    const state = startGame();
    clearStage(state);
    const obstacle = placeObstacle(state, 40, false);
    run(state, steerTo(state.player.pos.x + 200, state.player.pos.y), 300);
    // Pinned against the near edge, never inside or past it.
    expect(state.player.pos.x).toBeLessThanOrEqual(
      obstacle.pos.x - obstacle.radius - PLAYER.radius + 0.001,
    );
  });

  it("lets a high-jumping player clear a jumpable obstacle", () => {
    const state = startGame();
    clearStage(state);
    const obstacle = placeObstacle(state, 40, true);
    const target = { x: state.player.pos.x + 200, y: state.player.pos.y };
    // Hold the player airborne above the clear height while crossing.
    for (let i = 0; i < 400 && state.player.pos.x < target.x - 10; i++) {
      state.player.z = OBSTACLES.clearHeight + 10;
      state.player.vz = 0;
      step(state, steerTo(target.x, target.y), DT);
    }
    expect(state.player.pos.x).toBeGreaterThan(
      obstacle.pos.x + obstacle.radius,
    );
  });

  it("blocks even an airborne player at a tall obstacle", () => {
    const state = startGame();
    clearStage(state);
    const obstacle = placeObstacle(state, 40, false);
    const target = { x: state.player.pos.x + 200, y: state.player.pos.y };
    for (let i = 0; i < 300; i++) {
      state.player.z = OBSTACLES.clearHeight + 10;
      state.player.vz = 0;
      step(state, steerTo(target.x, target.y), DT);
    }
    expect(state.player.pos.x).toBeLessThanOrEqual(
      obstacle.pos.x - obstacle.radius - PLAYER.radius + 0.001,
    );
  });

  it("walls off monsters — including the jumpable rocks", () => {
    const state = startGame();
    clearStage(state);
    const obstacle = placeObstacle(state, 60, true);
    // A ghost on the far side must not reach the player through the rock.
    const ghost = makeEnemy({
      pos: { x: obstacle.pos.x + 30, y: obstacle.pos.y },
      speed: 40,
      hp: 1_000_000, // survives the auto-blaster for the whole run
      maxHp: 1_000_000,
    });
    state.enemies.push(ghost);
    run(state, idle, 600);
    expect(ghost.pos.x).toBeGreaterThanOrEqual(
      obstacle.pos.x + obstacle.radius + enemyDef("ghost").radius - 0.001,
    );
  });
});

describe("obstacle generation", () => {
  it("scatters the level's obstacles clear of the player spawn", () => {
    for (const seed of [1, 2, 3, 42]) {
      const state = createGame(seed, "moon");
      expect(state.obstacles.length).toBeGreaterThan(0);
      for (const obstacle of state.obstacles) {
        const d = Math.hypot(
          obstacle.pos.x - state.playerSpawn.x,
          obstacle.pos.y - state.playerSpawn.y,
        );
        expect(d).toBeGreaterThan(OBSTACLES.spawnClearance);
      }
    }
  });

  it("never spawns a monster inside an obstacle", () => {
    for (const seed of [1, 2, 3, 42]) {
      const state = createGame(seed, "moon");
      for (const enemy of state.enemies) {
        for (const obstacle of state.obstacles) {
          const d = Math.hypot(
            enemy.pos.x - obstacle.pos.x,
            enemy.pos.y - obstacle.pos.y,
          );
          expect(d).toBeGreaterThanOrEqual(obstacle.radius);
        }
      }
    }
  });
});
