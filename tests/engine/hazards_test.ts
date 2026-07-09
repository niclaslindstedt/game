// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Environmental hazards (src/game/hazards.ts): gravity wells drag the
// grounded player/enemies/items and devour minions in the core (no kill, no
// XP, no loot — the hole pays nobody); asteroids spawn on the level's
// cadence, strike the player once per rock (jumpable), shove minions aside
// unharmed, and despawn off the player's stage.

import { describe, expect, it } from "vitest";

import {
  ASTEROIDS,
  createGame,
  difficultyDef,
  dismissIntro,
  JUMP,
  skipCutscene,
  step,
  WELLS,
} from "@game/core";
import type { Asteroid, Difficulty, GameState, GravityWell } from "@game/core";
import { clearStage, DT, idle, makeEnemy, run, startGame } from "./helpers.ts";

/** An asteroid-rain run started on a given rung, staged clean. */
function startAsteroidsOn(difficulty: Difficulty): GameState {
  const state = createGame(42, "test_asteroid_level", difficulty);
  skipCutscene(state);
  dismissIntro(state);
  clearStage(state);
  return state;
}

/** The bite one rock takes at `difficulty`, from the ladder's fraction. */
function asteroidBite(state: GameState, difficulty: Difficulty): number {
  return Math.max(
    1,
    Math.round(
      state.player.maxHp * difficultyDef(difficulty).asteroidDamageFrac,
    ),
  );
}

/** The well level's hole (config-default numbers), staged clean. */
function stageWell(state: GameState): GravityWell {
  clearStage(state);
  return state.wells[0]!;
}

/** A hand-built rock, aimed by the test rather than the spawner. */
function makeRock(overrides: Partial<Asteroid> & { pos: Asteroid["pos"] }) {
  return {
    id: 9100,
    dir: { x: 1, y: 0 },
    speed: 0,
    radius: 10,
    spin: 0,
    struck: false,
    ...overrides,
  };
}

describe("gravity wells", () => {
  it("builds the level's wells from config defaults", () => {
    const state = startGame(42, "test_well_level");
    expect(state.wells).toHaveLength(1);
    expect(state.wells[0]!.pullRadius).toBe(WELLS.pullRadius);
    expect(state.wells[0]!.coreDps).toBe(WELLS.coreDps);
  });

  it("drags the grounded player toward the core", () => {
    const state = startGame(42, "test_well_level");
    const well = stageWell(state);
    state.player.pos = { x: well.pos.x + 100, y: well.pos.y };
    step(state, idle, DT);
    expect(state.player.pos.x).toBeLessThan(well.pos.x + 100);
    expect(state.player.pos.y).toBe(well.pos.y);
  });

  it("has no reach past its pull radius", () => {
    const state = startGame(42, "test_well_level");
    const well = stageWell(state);
    const x = well.pos.x + WELLS.pullRadius + 20;
    state.player.pos = { x, y: well.pos.y };
    step(state, idle, DT);
    expect(state.player.pos.x).toBe(x);
  });

  it("a jumping player sails over the pull", () => {
    const state = startGame(42, "test_well_level");
    const well = stageWell(state);
    state.player.pos = { x: well.pos.x + 60, y: well.pos.y };
    state.player.z = JUMP.dodgeHeight + 30;
    state.player.vz = 100;
    step(state, idle, DT);
    expect(state.player.pos.x).toBe(well.pos.x + 60);
  });

  it("burns the player in the core, ticked at WELLS.tickMs", () => {
    const state = startGame(42, "test_well_level");
    const well = stageWell(state);
    state.player.pos = { ...well.pos };
    const hpBefore = state.player.hp;
    step(state, idle, DT);
    const tick = Math.round(well.coreDps * (WELLS.tickMs / 1000));
    expect(state.player.hp).toBe(hpBefore - tick);
    expect(state.events.some((e) => e.type === "playerHurt")).toBe(true);
    // The next frames inside the cooldown burn nothing.
    step(state, idle, DT);
    expect(state.player.hp).toBe(hpBefore - tick);
    // Past the cooldown the second tick lands.
    run(state, idle, Math.ceil(WELLS.tickMs / DT) + 1);
    expect(state.player.hp).toBe(hpBefore - tick * 2);
  });

  it("devours a minion at the core: no kill, no XP, no loot", () => {
    const state = startGame(42, "test_well_level");
    const well = stageWell(state);
    state.player.pos = { x: well.pos.x + 600, y: well.pos.y };
    state.enemies.push(
      makeEnemy({ pos: { x: well.pos.x + 40, y: well.pos.y } }),
    );
    let swallowed = false;
    for (let i = 0; i < 300 && !swallowed; i++) {
      step(state, idle, DT);
      swallowed = state.events.some((e) => e.type === "wellSwallowed");
    }
    expect(swallowed).toBe(true);
    expect(state.enemies.some((e) => e.defId === "test_minion")).toBe(false);
    expect(state.stats.kills).toBe(0);
    expect(state.stats.xpGained).toBe(0);
    expect(state.items).toHaveLength(0);
  });

  it("drags but never devours an elite or boss", () => {
    const state = startGame(42, "test_well_level");
    const well = stageWell(state);
    state.player.pos = { x: well.pos.x + 600, y: well.pos.y };
    const boss = state.enemies[0]!;
    boss.pos = { x: well.pos.x + 40, y: well.pos.y };
    run(state, idle, 300);
    // Still on the board, parked in the core the pull dragged it into.
    expect(state.enemies).toContain(boss);
  });

  it("parks dragged items on the rim instead of eating them", () => {
    const state = startGame(42, "test_well_level");
    const well = stageWell(state);
    state.player.pos = { x: well.pos.x + 600, y: well.pos.y };
    state.items.push({
      id: state.nextId++,
      kind: "medkit",
      pos: { x: well.pos.x + 80, y: well.pos.y },
    });
    run(state, idle, 300);
    const item = state.items[0]!;
    const d = Math.hypot(item.pos.x - well.pos.x, item.pos.y - well.pos.y);
    expect(d).toBeGreaterThanOrEqual(WELLS.itemRestRadius - 1);
    expect(d).toBeLessThanOrEqual(WELLS.itemRestRadius + 2);
  });
});

describe("asteroids", () => {
  it("spawns on the level's cadence, capped at maxAlive", () => {
    const state = startGame(42, "test_asteroid_level");
    clearStage(state);
    expect(state.asteroids).toHaveLength(0);
    // The fixture cadence is a fixed 800ms; each rock lives long enough
    // (despawn at 640px) that the cap must engage within a few intervals.
    run(state, idle, Math.ceil((800 * (ASTEROIDS.maxAlive + 3)) / DT));
    expect(state.asteroids.length).toBeGreaterThan(0);
    expect(state.asteroids.length).toBeLessThanOrEqual(ASTEROIDS.maxAlive);
  });

  it("never spawns on levels without the rain", () => {
    const state = startGame(42, "test_well_level");
    clearStage(state);
    run(state, idle, 200);
    expect(state.asteroids).toHaveLength(0);
  });

  it("strikes the grounded player once per rock", () => {
    const state = startAsteroidsOn("medium");
    state.asteroidTimerMs = 999_999; // the hand-built rock is the only one
    const hpBefore = state.player.hp;
    const bite = asteroidBite(state, "medium");
    state.asteroids.push(
      makeRock({
        pos: { x: state.player.pos.x - 2, y: state.player.pos.y },
      }),
    );
    step(state, idle, DT);
    expect(state.player.hp).toBe(hpBefore - bite);
    // The latch holds: the same rock never strikes twice.
    run(state, idle, 10);
    expect(state.player.hp).toBe(hpBefore - bite);
  });

  it("scales the bite by difficulty: a fraction of the hero's max hp", () => {
    // The ladder's asteroid fractions, gentlest first.
    const rungs: [Difficulty, number][] = [
      ["easy", 0.2],
      ["medium", 0.3],
      ["hard", 0.4],
      ["nightmare", 0.5],
      ["jesus", 0.75],
    ];
    for (const [difficulty, frac] of rungs) {
      const state = startAsteroidsOn(difficulty);
      state.asteroidTimerMs = 999_999;
      const hpBefore = state.player.hp;
      state.asteroids.push(
        makeRock({ pos: { x: state.player.pos.x - 2, y: state.player.pos.y } }),
      );
      step(state, idle, DT);
      const expected = Math.max(1, Math.round(state.player.maxHp * frac));
      expect(state.player.hp, difficulty).toBe(hpBefore - expected);
    }
  });

  it("a jumping player sails over a rock", () => {
    const state = startGame(42, "test_asteroid_level");
    clearStage(state);
    state.asteroidTimerMs = 999_999;
    state.player.z = JUMP.dodgeHeight + 30;
    state.player.vz = 100;
    const hpBefore = state.player.hp;
    state.asteroids.push(
      makeRock({ pos: { x: state.player.pos.x - 2, y: state.player.pos.y } }),
    );
    step(state, idle, DT);
    expect(state.player.hp).toBe(hpBefore);
  });

  it("shoves minions out of its path without hurting them", () => {
    const state = startGame(42, "test_asteroid_level");
    clearStage(state);
    state.asteroidTimerMs = 999_999;
    const minion = makeEnemy({
      pos: { x: state.player.pos.x + 200, y: state.player.pos.y + 3 },
    });
    state.enemies.push(minion);
    state.asteroids.push(
      makeRock({
        pos: { x: minion.pos.x - 4, y: minion.pos.y - 3 },
        speed: 150,
      }),
    );
    step(state, idle, DT);
    expect(minion.hp).toBe(minion.maxHp);
    const rock = state.asteroids[0]!;
    const gap = Math.hypot(
      minion.pos.x - rock.pos.x,
      minion.pos.y - rock.pos.y,
    );
    expect(gap).toBeGreaterThanOrEqual(rock.radius + 9 - 0.01);
  });

  it("despawns once it leaves the player's stage", () => {
    const state = startGame(42, "test_asteroid_level");
    clearStage(state);
    state.asteroidTimerMs = 999_999;
    state.asteroids.push(
      makeRock({
        pos: {
          x: state.player.pos.x + ASTEROIDS.despawnDistance + 10,
          y: state.player.pos.y,
        },
      }),
    );
    step(state, idle, DT);
    expect(state.asteroids).toHaveLength(0);
  });
});
