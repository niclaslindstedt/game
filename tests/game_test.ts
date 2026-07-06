// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Simulation tests: run the engine headlessly with a fixed seed and fixed
// timestep, exactly like the app's game loop does, and assert on the rules.

import { describe, expect, it } from "vitest";

import {
  createGame,
  ENEMY,
  LEVEL,
  MEDKIT,
  PLAYER,
  step,
  WEAPON,
} from "../src/index.ts";
import type { GameInput, GameState } from "../src/index.ts";

const SEED = 42;
const DT = 16;

const idle: GameInput = { steering: false, target: { x: 0, y: 0 } };

function steerTo(x: number, y: number): GameInput {
  return { steering: true, target: { x, y } };
}

/** Step repeatedly until `done` or the safety cap trips. */
function run(
  state: GameState,
  input: GameInput,
  maxSteps: number,
  done?: (s: GameState) => boolean,
): number {
  for (let i = 0; i < maxSteps; i++) {
    if (done?.(state)) return i;
    step(state, input, DT);
  }
  return maxSteps;
}

describe("createGame", () => {
  it("builds a playing state with the configured entities", () => {
    const state = createGame(SEED);
    expect(state.phase).toBe("playing");
    expect(state.enemies).toHaveLength(ENEMY.count);
    expect(state.items).toHaveLength(MEDKIT.count);
    expect(state.player.hp).toBe(PLAYER.maxHp);
    expect(state.stats.totalEnemies).toBe(ENEMY.count);
  });

  it("is deterministic for a given seed", () => {
    const a = createGame(SEED);
    const b = createGame(SEED);
    expect(a.enemies.map((e) => e.pos)).toEqual(b.enemies.map((e) => e.pos));
    expect(a.items.map((i) => i.pos)).toEqual(b.items.map((i) => i.pos));
  });

  it("spawns enemies away from the player", () => {
    const state = createGame(SEED);
    for (const enemy of state.enemies) {
      const d = Math.hypot(
        enemy.pos.x - state.player.pos.x,
        enemy.pos.y - state.player.pos.y,
      );
      expect(d).toBeGreaterThanOrEqual(ENEMY.minSpawnDistance);
    }
  });
});

describe("steering", () => {
  it("moves the player toward the held target and stops on arrival", () => {
    const state = createGame(SEED);
    const target = { x: state.player.pos.x + 60, y: state.player.pos.y };
    step(state, steerTo(target.x, target.y), DT);
    expect(state.player.pos.x).toBeGreaterThan(LEVEL.width / 2);
    expect(state.player.moving).toBe(true);
    expect(state.player.facing.x).toBeCloseTo(1);

    run(state, steerTo(target.x, target.y), 200);
    // The player parks within the arrive radius of the target (anti-jitter).
    expect(Math.abs(state.player.pos.x - target.x)).toBeLessThanOrEqual(
      PLAYER.arriveRadius,
    );
  });

  it("does not move while the pointer is released", () => {
    const state = createGame(SEED);
    const before = { ...state.player.pos };
    step(state, idle, DT);
    expect(state.player.pos).toEqual(before);
    expect(state.player.moving).toBe(false);
  });

  it("clamps the player inside the finite level", () => {
    const state = createGame(SEED);
    run(state, steerTo(-1000, -1000), 600);
    expect(state.player.pos.x).toBe(PLAYER.radius);
    expect(state.player.pos.y).toBe(PLAYER.radius);
  });
});

describe("weapon", () => {
  it("auto-fires only when an enemy is in range", () => {
    const state = createGame(SEED);
    state.enemies = [
      {
        id: 999,
        pos: {
          x: state.player.pos.x + WEAPON.range + 100,
          y: state.player.pos.y,
        },
        hp: ENEMY.hp,
        maxHp: ENEMY.hp,
        speed: 0,
        contactCooldownMs: 0,
      },
    ];
    step(state, idle, DT);
    expect(state.projectiles).toHaveLength(0);

    state.enemies[0]!.pos.x = state.player.pos.x + WEAPON.range - 50;
    step(state, idle, DT);
    expect(state.projectiles).toHaveLength(1);
    expect(state.stats.shotsFired).toBe(1);
    expect(state.events).toContainEqual({ type: "shot" });
  });

  it("kills an enemy after enough hits and records the kill", () => {
    const state = createGame(SEED);
    state.enemies = [
      {
        id: 999,
        pos: { x: state.player.pos.x + 80, y: state.player.pos.y },
        hp: ENEMY.hp,
        maxHp: ENEMY.hp,
        speed: 0,
        contactCooldownMs: 0,
      },
    ];
    state.items = [];
    run(state, idle, 2000, (s) => s.enemies.length === 0);
    expect(state.stats.kills).toBe(1);
    expect(state.stats.damageDealt).toBeGreaterThanOrEqual(ENEMY.hp);
    expect(state.phase).toBe("victory");
  });
});

describe("enemies", () => {
  it("chase the player and deal contact damage with a cooldown", () => {
    const state = createGame(SEED);
    state.enemies = [
      {
        id: 999,
        pos: { x: state.player.pos.x + 40, y: state.player.pos.y },
        hp: 1000000,
        maxHp: 1000000,
        speed: ENEMY.speed,
        contactCooldownMs: 0,
      },
    ];
    const before = state.enemies[0]!.pos.x;
    step(state, idle, DT);
    expect(state.enemies[0]!.pos.x).toBeLessThan(before);

    run(state, idle, 300, (s) => s.stats.damageTaken > 0);
    expect(state.player.hp).toBe(PLAYER.maxHp - ENEMY.contactDamage);

    // Immediately after a hit the cooldown must block a second hit.
    step(state, idle, DT);
    expect(state.stats.damageTaken).toBe(ENEMY.contactDamage);
  });
});

describe("items", () => {
  it("heals the player on pickup, capped at max hp", () => {
    const state = createGame(SEED);
    state.enemies = [];
    state.player.hp = PLAYER.maxHp - 10;
    state.items = [{ id: 999, kind: "medkit", pos: { ...state.player.pos } }];
    step(state, idle, DT);
    expect(state.player.hp).toBe(PLAYER.maxHp);
    expect(state.items).toHaveLength(0);
    expect(state.stats.itemsCollected).toBe(1);
    expect(state.events).toContainEqual({
      type: "itemCollected",
      kind: "medkit",
    });
  });
});

describe("win and lose", () => {
  it("ends in victory when the last enemy dies", () => {
    const state = createGame(SEED);
    state.enemies = state.enemies.slice(0, 1);
    state.enemies[0]!.pos = {
      x: state.player.pos.x + 60,
      y: state.player.pos.y,
    };
    state.enemies[0]!.speed = 0;
    run(state, idle, 2000, (s) => s.phase !== "playing");
    expect(state.phase).toBe("victory");
    expect(state.events).toContainEqual({ type: "victory" });
  });

  it("ends in defeat when the player's hp reaches zero", () => {
    const state = createGame(SEED);
    state.player.hp = 1;
    state.enemies[0]!.pos = { ...state.player.pos };
    step(state, idle, DT);
    expect(state.phase).toBe("defeat");
    expect(state.player.hp).toBe(0);
    expect(state.events).toContainEqual({ type: "defeat" });
  });

  it("freezes the simulation after the game ends", () => {
    const state = createGame(SEED);
    state.player.hp = 1;
    state.enemies[0]!.pos = { ...state.player.pos };
    step(state, idle, DT);
    const time = state.stats.timeMs;
    step(state, steerTo(0, 0), DT);
    expect(state.stats.timeMs).toBe(time);
    expect(state.events).toHaveLength(0);
  });
});
