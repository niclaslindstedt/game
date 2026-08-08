// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Shared scaffolding for the engine test suites. Not a test file itself —
// vitest only collects `*_test.ts` / `*_tests.ts`.

import {
  AMMO,
  createGame,
  dismissIntro,
  enemyDef,
  getBalanceTuning,
  isWeaponDef,
  runLevelDef,
  skipCutscene,
  step,
  weaponDef,
} from "@game/core";
import type { Enemy, GameEvent, GameInput, GameState, Vec2 } from "@game/core";
// Engine-internal: the seed reveal a fresh run stamps around the spawn.
import { revealAround } from "../engine/game/fog.ts";

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
  // GOODCO HQ opens the hero DISARMED (his sword is drawn by the scripted
  // vanguard's first swing — see LevelDef.openingStrike). The engine- and
  // content-rule suites assume a hero who can already fight, so arm him here;
  // the opening-strike beat has its own suite (openingStrike_test.ts) that
  // stages from `createGame` to exercise the disarmed state directly.
  state.players[0].disarmed = false;
  return state;
}

/**
 * Swap the default melee starting weapon (the difficulty's wall piece) for a
 * LONG-REACH GUN. Suites that calibrate on ranged-at-distance behaviour (fire
 * an aimed bolt, kite at reach, pick mobs off across a gap) use this so they
 * test that behaviour explicitly rather than depending on whatever the game's
 * default starting weapon happens to be.
 *
 * THE TWO CATALOGS NAME DIFFERENT GUNS, which is why the id is resolved here
 * rather than spelled out at 30 call sites: `tests/engine/` runs on the
 * synthetic fixture ladder (whose ranged piece is `blaster`) and
 * `tests/content/` on the shipped one (`nine_mm`). The engine's own built-in
 * is no longer a gun at all — it is the EMPTY HAND — so there is no id that
 * means "a gun" in both.
 *
 * The pouch is stocked to match, because every SHIPPED gun eats ammunition and
 * a melee opening now starts empty-handed of rounds (see `startingAmmo`): an
 * unstocked gun would simply click, and the suite would be measuring the dry
 * swap instead of the shot it meant to.
 */
export function equipRangedSidearm(state: GameState): GameState {
  const defId = isWeaponDef("blaster") ? "blaster" : "nine_mm";
  state.players[0].equipment.weapon = {
    id: state.nextId++,
    defId,
    slot: "weapon",
    tier: "regular",
    // Pinned at ilvl 1 — item level prices affixes, not damage, so this is
    // just the honest level for a plain sidearm.
    ilvl: 1,
    affixes: [],
  };
  const kind = weaponDef(defId).ammo;
  if (kind !== undefined) state.players[0].ammo[kind] = AMMO.starting;
  state.players[0].weaponCooldownMs = 0;
  return state;
}

/**
 * Exhaust the level's wave budget so the horde spawner stays quiet and
 * tests keep surgical control over `state.enemies`.
 */
export function stopWaves(state: GameState): void {
  // Silence the SPAWN POINTS too: emptying the runtime list stops any point from
  // arming and emitting, so a surgically staged field stays as the test arranged
  // it (a `spawners` level is the wave-model's counterpart).
  state.spawners = [];
  const waves = runLevelDef(state).waves;
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
 *
 * Lifts the fog off the whole level too ({@link revealAll}), because a surgical
 * arrangement is meant to be a scene the hero can SEE: the auto-attack refuses
 * anything still in the dark (`clearOfFog`), and a run only uncovers
 * `MAP.revealRadius` around the hero, which is shorter than most weapons reach.
 * Without this, a mob parked at a weapon's edge would go unshot for a reason
 * the test never meant to be about. The fog's own suites stage their own grid.
 */
export function clearStage(state: GameState): void {
  stopWaves(state);
  state.enemies = state.enemies.filter(
    (e) => enemyDef(e.defId).role === "boss",
  );
  revealAll(state);
}

/**
 * Uncover the whole level's fog — every cell of `state.explored`.
 *
 * The hero's weapon (and his companions', and the conjured powers) will not
 * fire at anything standing in fog or in its frontier band, so any test that
 * parks a body further out than the reveal disc has to say that the player can
 * see it. Exploration never rolls back mid-run, so this is a state a real run
 * reaches — it is "the hero has walked this floor", not a cheat.
 */
export function revealAll(state: GameState): void {
  state.explored.fill(1);
}

/**
 * The opposite: put the fog back exactly as a fresh run starts it — the whole
 * level dark but the disc around the hero. The suites that are ABOUT the fog
 * (what it hides, what lifts it) stage with this after a {@link clearStage},
 * which lifts the fog wholesale for everyone else.
 */
export function refog(state: GameState): void {
  state.explored.fill(0);
  revealAround(state, state.players[0].pos);
}

/**
 * A spot exactly `range` px from `from` with nothing standing on it.
 *
 * Parking a test mob at a fixed offset is how a surgical arrangement used to be
 * written, and it stopped being safe the day every map became a carve: the spot
 * lands inside a prop on some seeds, the collision pass ejects the mob a hundred
 * px on the first tick, and a test measuring a distance quietly measures a
 * different one. This walks the bearings instead, so the RANGE is what the test
 * asked for and the direction is whatever the floor allows. Falls back to due
 * east when a map has no clear bearing at that range at all.
 */
export function openSpotNear(
  state: GameState,
  from: Vec2,
  range: number,
  clearance = 40,
): Vec2 {
  const BEARINGS = 24;
  for (let i = 0; i < BEARINGS; i++) {
    const a = (i / BEARINGS) * Math.PI * 2;
    const spot = {
      x: from.x + Math.cos(a) * range,
      y: from.y + Math.sin(a) * range,
    };
    if (spot.x < clearance || spot.y < clearance) continue;
    if (spot.x > state.level.width - clearance) continue;
    if (spot.y > state.level.height - clearance) continue;
    const blocked = state.obstacles.some((o) => {
      const reach =
        Math.max(o.radius, o.half?.x ?? 0, o.half?.y ?? 0) + clearance;
      return Math.hypot(o.pos.x - spot.x, o.pos.y - spot.y) < reach;
    });
    if (!blocked) return spot;
  }
  return { x: from.x + range, y: from.y };
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
  input: GameInput | readonly GameInput[],
  maxSteps: number,
  done?: (s: GameState) => boolean,
): number {
  for (let i = 0; i < maxSteps; i++) {
    if (done?.(state)) return i;
    step(state, input, DT);
  }
  return maxSteps;
}

/**
 * Play a running BOSS DEATH RITE out to its end.
 *
 * Felling a boss no longer resolves on the tick of the blow: the run drops into
 * the `bossDeath` phase and the scripted send-off plays (see
 * `engine/game/boss-death.ts`), and only when it ends do `bossDefeated` /
 * `bossFled`, the landmark corpse and the last words arrive. So any test that
 * kills a boss and then asserts on the aftermath has to get through the scene
 * first — this is that step, and it collects the events the rite emits on the
 * way so a caller watching for `bossFled` still sees it.
 *
 * A no-op when no rite is running, so it is safe to call unconditionally.
 */
export function settleBossRite(state: GameState): GameEvent[] {
  const seen: GameEvent[] = [];
  // Generous cap: the longest shipped rite is a shade over three seconds, and a
  // hung scene should fail the test rather than hang the suite.
  for (let i = 0; i < 600 && state.phase === "bossDeath"; i++) {
    step(state, idle, DT);
    seen.push(...state.events);
  }
  return seen;
}

/**
 * The BALANCE speed multipliers a moving HERO actually carries.
 *
 * The world's shipped PACE lives on these knobs rather than on the authored
 * numbers (`playerSpeed` / `mobSpeed`, both 0.8 — see tuning.ts), so an
 * assertion that predicts a distance from `PLAYER.speed` or an `EnemyDef.speed`
 * has to apply them: the authored figure is a pace nothing on the field
 * actually moves at.
 */
export function heroSpeedMult(): number {
  const balance = getBalanceTuning();
  return balance.tempo * balance.playerSpeed;
}

/** The same for a MONSTER's pace — see {@link heroSpeedMult}. */
export function mobSpeedMult(): number {
  const balance = getBalanceTuning();
  return balance.tempo * balance.mobSpeed;
}
