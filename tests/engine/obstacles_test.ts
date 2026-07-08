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
  equipBlaster,
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
  const kind = jumpable ? "rock" : "boulder";
  const obstacle: Obstacle = {
    id: 8000,
    kind,
    sprite: kind,
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
    // A grounded (non-phasing) mob on the far side must not reach the
    // player through the rock. Low rocks don't hide the player, so it
    // still aggros — and piles up against the stone.
    const guard = makeEnemy(
      {
        pos: { x: obstacle.pos.x + 30, y: obstacle.pos.y },
        speed: 40,
        hp: 1_000_000, // survives the auto-attack for the whole run
        maxHp: 1_000_000,
      },
      "test_stalker",
    );
    state.enemies.push(guard);
    run(state, idle, 600);
    expect(guard.pos.x).toBeGreaterThanOrEqual(
      obstacle.pos.x +
        obstacle.radius +
        enemyDef("test_stalker").radius -
        0.001,
    );
  });

  it("lets a phasing ghost drift straight through solid stone", () => {
    const state = startGame();
    clearStage(state);
    const obstacle = placeObstacle(state, 60, false);
    const ghost = makeEnemy({
      pos: { x: obstacle.pos.x + 30, y: obstacle.pos.y },
      speed: 40,
      hp: 1_000_000,
      maxHp: 1_000_000,
    });
    state.enemies.push(ghost);
    run(state, idle, 600);
    // Through the boulder and onto the player, stone notwithstanding.
    expect(ghost.pos.x).toBeLessThan(obstacle.pos.x - obstacle.radius);
    expect(state.stats.damageTaken).toBeGreaterThan(0);
  });
});

describe("walls block shots", () => {
  it("a projectile dies at a tall obstacle instead of passing through", () => {
    const state = startGame();
    clearStage(state);
    const obstacle = placeObstacle(state, 60, false);
    const victim = makeEnemy({
      pos: { x: obstacle.pos.x + 60, y: obstacle.pos.y },
      hp: 1000,
      maxHp: 1000,
    });
    state.enemies.push(victim);
    state.projectiles.push({
      id: 7000,
      pos: { ...state.player.pos },
      dir: { x: 1, y: 0 },
      speed: 400, // fast enough that only the swept check can catch the wall
      radius: 2,
      damage: 50,
      lifetimeMs: 3000,
      weaponClass: "ranged",
      sprite: "bolt",
      z: 0,
    });
    run(state, idle, 200);
    expect(state.projectiles).toHaveLength(0); // eaten by the wall
    expect(victim.hp).toBe(1000); // never touched
  });

  it("a projectile flies clean over a low, jumpable obstacle", () => {
    const state = startGame();
    clearStage(state);
    const obstacle = placeObstacle(state, 60, true);
    const victim = makeEnemy({
      pos: { x: obstacle.pos.x + 60, y: obstacle.pos.y },
      hp: 1000,
      maxHp: 1000,
    });
    state.enemies.push(victim);
    state.projectiles.push({
      id: 7000,
      pos: { ...state.player.pos },
      dir: { x: 1, y: 0 },
      speed: 400,
      radius: 2,
      damage: 50,
      lifetimeMs: 3000,
      weaponClass: "ranged",
      sprite: "bolt",
      z: 0,
    });
    run(state, idle, 200, (s) => s.projectiles.length === 0);
    expect(victim.hp).toBeLessThan(1000); // the shot connected
  });

  it("auto-aim never targets a monster behind a wall", () => {
    const state = equipBlaster(startGame()); // ranged, so a clear shot would fire
    clearStage(state);
    const obstacle = placeObstacle(state, 60, false);
    // In range of the blaster, but walled off.
    const hidden = makeEnemy({
      pos: { x: obstacle.pos.x + 40, y: obstacle.pos.y },
      hp: 1000,
      maxHp: 1000,
    });
    state.enemies.push(hidden);
    run(state, idle, 300);
    expect(state.stats.shotsFired).toBe(0);
    expect(hidden.hp).toBe(1000);
  });

  it("auto-aim still fires over a jumpable obstacle", () => {
    const state = equipBlaster(startGame()); // ranged: the shot clears the rock
    clearStage(state);
    const obstacle = placeObstacle(state, 60, true);
    const target = makeEnemy({
      pos: { x: obstacle.pos.x + 40, y: obstacle.pos.y },
      hp: 1000,
      maxHp: 1000,
    });
    state.enemies.push(target);
    run(state, idle, 300);
    expect(state.stats.shotsFired).toBeGreaterThan(0);
  });
});

describe("obstacle generation", () => {
  it("scatters the level's obstacles clear of the player spawn", () => {
    for (const seed of [1, 2, 3, 42]) {
      const state = createGame(seed, "test_level");
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
      const state = createGame(seed, "test_level");
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
