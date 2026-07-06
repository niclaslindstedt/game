// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Shared scaffolding for the engine test suites. Not a test file itself —
// vitest only collects `*_test.ts` / `*_tests.ts`.

import { createGame, dismissIntro, enemyDef, step } from "@game/core";
import type { Enemy, GameInput, GameState } from "@game/core";

export const SEED = 42;
export const DT = 16;

export const idle: GameInput = {
  steering: false,
  target: { x: 0, y: 0 },
  jump: false,
};

export function steerTo(x: number, y: number): GameInput {
  return { steering: true, target: { x, y }, jump: false };
}

export const jumpOnce: GameInput = {
  steering: false,
  target: { x: 0, y: 0 },
  jump: true,
};

/** A run already past the intro text box. */
export function startGame(seed: number = SEED): GameState {
  const state = createGame(seed);
  dismissIntro(state);
  return state;
}

/**
 * Strip the level to just the parked, far-away boss. Tests that want a
 * clean stage must keep him: removing every boss clears the objective and
 * starts the victory countdown.
 */
export function clearStage(state: GameState): void {
  state.enemies = state.enemies.filter(
    (e) => enemyDef(e.defId).role === "boss",
  );
}

/**
 * A hand-placed monster for surgical arrangements. Stationary by default so
 * tests control the geometry; stats beyond hp/speed come from its def.
 */
export function makeEnemy(
  overrides: Partial<Enemy> & { pos: Enemy["pos"] },
  defId = "ghost",
): Enemy {
  return {
    id: 9000,
    defId,
    home: { ...overrides.pos },
    hp: 45,
    maxHp: 45,
    speed: 0,
    contactCooldownMs: 0,
    ...overrides,
  };
}

/** Step repeatedly until `done` or the safety cap trips. */
export function run(
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
