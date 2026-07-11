// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Shared scaffolding for the engine test suites. Not a test file itself —
// vitest only collects `*_test.ts` / `*_tests.ts`.

import {
  createGame,
  dismissIntro,
  enemyDef,
  levelDef,
  skipCutscene,
  step,
} from "@game/core";
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

/**
 * A run already past the prelude scene and the intro text box. The moon is
 * the reference level for the engine-rule suites — their geometry and
 * tuning assertions were calibrated against it; level-specific suites pass
 * their own id. No loadout is passed, so every suite stages from the same
 * authored level-1 hero (the difficulty's wall weapon, bare hands); the loadout carry-over
 * itself is covered by `tests/engine/arrival_test.ts` and the mars suite.
 */
export function startGame(seed: number = SEED, levelId = "moon"): GameState {
  const state = createGame(seed, levelId);
  skipCutscene(state);
  dismissIntro(state);
  // SpaceZ HQ opens the hero DISARMED (his sword is drawn by the scripted
  // vanguard's first swing — see LevelDef.openingStrike). The engine- and
  // content-rule suites assume a hero who can already fight, so arm him here;
  // the opening-strike beat has its own suite (openingStrike_test.ts) that
  // stages from `createGame` to exercise the disarmed state directly.
  state.player.disarmed = false;
  return state;
}

/**
 * Swap the default melee starting weapon (the difficulty's wall piece) for the unbreakable
 * ranged blaster sidearm. Suites that calibrate on ranged-at-distance
 * behaviour (fire an aimed bolt, kite at reach, pick mobs off across a gap)
 * use this so they test that behaviour explicitly rather than depending on
 * whatever the game's default starting weapon happens to be. Minted without
 * durability, so it matches the old exempt-from-the-loot-lever baseline.
 */
export function equipBlaster(state: GameState): GameState {
  state.player.equipment.weapon = {
    id: state.nextId++,
    defId: "blaster",
    slot: "weapon",
    tier: "regular",
    // Pinned at the def's levelReq (1) so the ITEM-LEVEL damage term
    // (WEAPON.damagePerIlvl) stays 1 and suites measure catalog damage.
    ilvl: 1,
    affixes: [],
  };
  state.player.weaponCooldownMs = 0;
  return state;
}

/**
 * Exhaust the level's wave budget so the horde spawner stays quiet and
 * tests keep surgical control over `state.enemies`.
 */
export function stopWaves(state: GameState): void {
  const waves = levelDef(state.level.id).waves;
  if (!waves) return;
  waves.budget.forEach((entry, i) => {
    state.waveSpawned[i] = entry.count;
  });
  // A spent budget on a killBoss level starts the endless STRAGGLER trickle
  // (see stepSpawner) — park its cooldown effectively forever so a surgically
  // staged field stays exactly as the test arranged it. Suites probing the
  // trickle itself reset `trickleMs` to 0 explicitly.
  state.trickleMs = Number.MAX_SAFE_INTEGER;
}

/**
 * Strip the level to just the parked, far-away boss (waves included).
 * Tests that want a clean stage must keep him: removing every boss clears
 * the objective and starts the victory countdown.
 */
export function clearStage(state: GameState): void {
  stopWaves(state);
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
    mlvl: 99,
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
