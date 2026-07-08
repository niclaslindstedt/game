// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Shared scaffolding for the engine test suites. Not a test file itself —
// vitest only collects `*_test.ts` / `*_tests.ts`.

import {
  createGame,
  dismissIntro,
  enemyDef,
  LEVELING,
  levelDef,
  LOOT,
  PLAYER,
  skipCutscene,
  STAMINA,
  step,
  weaponDef,
} from "@game/core";
import type { Enemy, GameInput, GameState, StatName } from "@game/core";

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
 * their own id. The seasoned arrival (a mid-campaign start's derived level
 * and inherited kit — see src/game/arrival.ts) is stripped back to the
 * authored level-1 baseline, so every suite stages from the same bare hero
 * it was calibrated against; the arrival itself is covered by
 * `tests/engine/arrival_test.ts` and the mars content suite.
 */
export function startGame(seed: number = SEED, levelId = "moon"): GameState {
  const state = createGame(seed, levelId);
  bareHero(state);
  skipCutscene(state);
  dismissIntro(state);
  return state;
}

/** Reset a run's hero to the authored level-1 baseline: crude sword, bare
 * hands, empty bag — undoing the seasoned arrival for surgical staging. */
export function bareHero(state: GameState): GameState {
  const player = state.player;
  player.level = 1;
  player.xp = 0;
  player.xpToNext = LEVELING.baseXpToLevel;
  player.pendingStatPoints = 0;
  for (const stat of Object.keys(player.stats) as StatName[]) {
    player.stats[stat] = 0;
  }
  player.equipment.weapon = {
    id: state.nextId++,
    defId: "crude_sword",
    slot: "weapon",
    tier: "regular",
    affixes: [],
    durability: weaponDef("crude_sword").durability,
  };
  player.equipment.suit = null;
  player.equipment.charm = null;
  player.heldAbilities = [];
  player.inventory = new Array<null>(LOOT.baseInventorySize).fill(null);
  player.maxHp = PLAYER.maxHp;
  player.hp = PLAYER.maxHp;
  player.armor = 0;
  player.maxStamina = STAMINA.base;
  player.stamina = STAMINA.base;
  return state;
}

/**
 * Swap the default melee `crude_sword` starting weapon for the unbreakable
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
