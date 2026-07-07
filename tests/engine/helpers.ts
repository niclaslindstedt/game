// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Engine-suite scaffolding. Importing this installs the synthetic fixtures
// (fixtures.ts) as the engine's active catalogs, so every engine-rule test
// runs on content-agnostic defs (`test_level`, `test_minion`, …) rather than
// this game's shipped content. `startGame`/`makeEnemy` default to the fixture
// ids; the pure helpers are re-exported from the shared root helper.

import { createGame, dismissIntro, skipCutscene } from "@game/core";
import type { Enemy, GameState } from "@game/core";

import { installFixtures } from "./fixtures.ts";

// Register fixtures before any test builds a game.
installFixtures();

export {
  SEED,
  DT,
  idle,
  steerTo,
  jumpOnce,
  stopWaves,
  clearStage,
  run,
} from "../helpers.ts";

/**
 * A run already past any prelude and the intro text box, on the synthetic
 * `test_level` — the reference level the engine-rule suites calibrate
 * against.
 */
export function startGame(seed = 42, levelId = "test_level"): GameState {
  const state = createGame(seed, levelId);
  skipCutscene(state);
  dismissIntro(state);
  return state;
}

/**
 * A hand-placed monster for surgical arrangements. Stationary by default;
 * stats beyond hp/speed come from its def. Defaults to the fixture minion
 * (hp 45), matching the shipped `makeEnemy` this replaces.
 */
export function makeEnemy(
  overrides: Partial<Enemy> & { pos: Enemy["pos"] },
  defId = "test_minion",
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
