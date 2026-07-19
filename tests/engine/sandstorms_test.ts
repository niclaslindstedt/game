// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Sand storms (src/game/hazards.ts, stepSandstorms): small dust squalls that
// drift across the field, shove minions aside unharmed, and CATCH the grounded
// hero once — a difficulty-scaled bite of his max hp PLUS a knockout, where he
// lies prone and helpless for SANDSTORMS.knockoutMs while the storm passes over
// him and fades. A jump sails clear; a hero already down is never caught twice.

import { describe, expect, it } from "vitest";

import {
  createGame,
  difficultyDef,
  dismissIntro,
  JUMP,
  SANDSTORMS,
  skipCutscene,
  step,
} from "@game/core";
import type { Difficulty, GameState, SandStorm } from "@game/core";
import {
  clearStage,
  DT,
  idle,
  makeEnemy,
  run,
  startGame,
  steerTo,
} from "./helpers.ts";

/** A sand-storm run started on a given rung, staged clean with no live storm
 * spawning under the test (the cadence timer parked far out). */
function startStormsOn(difficulty: Difficulty): GameState {
  const state = createGame(42, "test_sandstorm_level", difficulty);
  skipCutscene(state);
  dismissIntro(state);
  clearStage(state);
  state.sandstormTimerMs = 999_999;
  return state;
}

/** The bite one storm takes at `difficulty`, from the ladder's fraction. */
function stormBite(state: GameState, difficulty: Difficulty): number {
  return Math.max(
    1,
    Math.round(
      state.player.maxHp * difficultyDef(difficulty).sandstormDamageFrac,
    ),
  );
}

/** A hand-built storm, parked by the test rather than the spawner. */
function makeStorm(
  overrides: Partial<SandStorm> & { pos: SandStorm["pos"] },
): SandStorm {
  return {
    id: 9200,
    dir: { x: 1, y: 0 },
    speed: 0,
    radius: 32,
    spin: 0,
    struck: false,
    fadeMs: null,
    ...overrides,
  };
}

/** Drop a storm right on top of the hero. */
function stormOnHero(state: GameState): SandStorm {
  const storm = makeStorm({ pos: { ...state.player.pos } });
  state.sandstorms.push(storm);
  return storm;
}

describe("sand storms — spawning", () => {
  it("spawns on the level's cadence, capped at maxAlive", () => {
    const state = startGame(42, "test_sandstorm_level");
    clearStage(state);
    expect(state.sandstorms).toHaveLength(0);
    // The fixture cadence is a fixed 800ms; each storm lives long enough
    // (despawn at 700px) that the cap must engage within a few intervals.
    run(state, idle, Math.ceil((800 * (SANDSTORMS.maxAlive + 3)) / DT));
    expect(state.sandstorms.length).toBeGreaterThan(0);
    expect(state.sandstorms.length).toBeLessThanOrEqual(SANDSTORMS.maxAlive);
  });

  it("never spawns on levels without storms", () => {
    const state = startGame(42, "test_well_level");
    clearStage(state);
    run(state, idle, 200);
    expect(state.sandstorms).toHaveLength(0);
  });
});

describe("sand storms — the strike", () => {
  it("catches the grounded hero: a bite AND a knockout", () => {
    const state = startStormsOn("medium");
    const hpBefore = state.player.hp;
    const bite = stormBite(state, "medium");
    stormOnHero(state);
    step(state, idle, DT);
    expect(state.player.hp).toBe(hpBefore - bite);
    expect(state.player.knockoutMs).toBeGreaterThan(0);
    expect(state.events.some((e) => e.type === "sandstormHit")).toBe(true);
  });

  it("scales the bite by difficulty: a fraction of the hero's max hp", () => {
    const rungs: [Difficulty, number][] = [
      ["easy", 0.1],
      ["medium", 0.15],
      ["hard", 0.2],
      ["nightmare", 0.28],
      ["jesus", 0.4],
    ];
    for (const [difficulty, frac] of rungs) {
      const state = startStormsOn(difficulty);
      const hpBefore = state.player.hp;
      stormOnHero(state);
      step(state, idle, DT);
      const expected = Math.max(1, Math.round(state.player.maxHp * frac));
      expect(state.player.hp, difficulty).toBe(hpBefore - expected);
    }
  });

  it("a jumping hero sails over the gust — no strike, no knockout", () => {
    const state = startStormsOn("medium");
    state.player.z = JUMP.dodgeHeight + 30;
    state.player.vz = 100;
    const hpBefore = state.player.hp;
    stormOnHero(state);
    step(state, idle, DT);
    expect(state.player.hp).toBe(hpBefore);
    expect(state.player.knockoutMs).toBe(0);
  });

  it("never catches a hero already knocked out — no chain-lock", () => {
    const state = startStormsOn("medium");
    state.player.knockoutMs = 400;
    const hpBefore = state.player.hp;
    stormOnHero(state);
    step(state, idle, DT);
    // No fresh bite, and the timer only counts DOWN (never re-armed to full).
    expect(state.player.hp).toBe(hpBefore);
    expect(state.player.knockoutMs).toBeLessThan(400);
  });

  it("shoves minions out of its path without hurting them", () => {
    const state = startStormsOn("medium");
    // Keep the hero clear so the storm's only job this test is the shove.
    state.player.pos = { x: 400, y: 400 };
    const minion = makeEnemy({ pos: { x: 1200, y: 803 } });
    state.enemies.push(minion);
    const hpBefore = minion.hp;
    state.sandstorms.push(
      makeStorm({ pos: { x: minion.pos.x - 4, y: minion.pos.y - 3 } }),
    );
    step(state, idle, DT);
    // Pushed off the storm's center, unharmed.
    expect(distanceMoved(minion.pos, { x: 1200, y: 803 })).toBeGreaterThan(0);
    expect(minion.hp).toBe(hpBefore);
  });
});

describe("sand storms — passing over and fading", () => {
  it("a struck storm fades out and despawns after fadeMs", () => {
    const state = startStormsOn("medium");
    const storm = stormOnHero(state);
    step(state, idle, DT);
    expect(storm.struck).toBe(true);
    expect(storm.fadeMs).not.toBeNull();
    // It lingers through the fade window, then is gone.
    run(state, idle, Math.ceil(SANDSTORMS.fadeMs / DT) + 2);
    expect(state.sandstorms).toHaveLength(0);
  });

  it("despawns a storm that has drifted off the stage", () => {
    const state = startStormsOn("medium");
    state.sandstorms.push(
      makeStorm({
        pos: {
          x: state.player.pos.x + SANDSTORMS.despawnDistance + 20,
          y: state.player.pos.y,
        },
        speed: 0,
      }),
    );
    step(state, idle, DT);
    expect(state.sandstorms).toHaveLength(0);
  });
});

describe("knockout — the hero lies helpless", () => {
  it("freezes movement: a steered hero doesn't budge while down", () => {
    const state = startStormsOn("medium");
    state.player.knockoutMs = 500;
    const at = { ...state.player.pos };
    step(state, steerTo(at.x + 400, at.y), DT);
    expect(state.player.pos).toEqual(at);
    expect(state.player.moving).toBe(false);
    // The timer ticked down toward recovery.
    expect(state.player.knockoutMs).toBe(500 - DT);
  });

  it("pins the hero flat to the floor while down", () => {
    const state = startStormsOn("medium");
    state.player.knockoutMs = 500;
    state.player.z = JUMP.dodgeHeight;
    state.player.vz = 80;
    step(state, { ...idle, jump: true }, DT);
    expect(state.player.z).toBe(0);
    expect(state.player.vz).toBe(0);
  });

  it("blocks the auto-weapon while down, then swings once up", () => {
    const state = startStormsOn("medium");
    state.player.pos = { x: 400, y: 400 };
    // A fat-hp minion right on top of the hero, well inside any weapon reach.
    const minion = makeEnemy({
      pos: { x: 410, y: 400 },
      hp: 100_000,
      maxHp: 100_000,
    });
    state.enemies.push(minion);
    state.player.knockoutMs = 10 * DT;
    const before = state.stats.damageDealt;
    // Nine ticks still fully down (the tenth would stand him up): no damage.
    run(state, idle, 9);
    expect(state.player.knockoutMs).toBeGreaterThan(0);
    expect(state.stats.damageDealt).toBe(before);
    // Play on — he stands and the auto-attack lands.
    run(state, idle, 30);
    expect(state.stats.damageDealt).toBeGreaterThan(before);
  });

  it("gets up when the timer lapses and regains control", () => {
    const state = startStormsOn("medium");
    state.player.pos = { x: 400, y: 400 };
    state.player.knockoutMs = 2 * DT;
    // First tick: still down. Second: the timer hits 0 and the recover fires.
    step(state, idle, DT);
    expect(state.player.knockoutMs).toBe(DT);
    step(state, idle, DT);
    expect(state.player.knockoutMs).toBe(0);
    expect(state.events.some((e) => e.type === "knockoutRecovered")).toBe(true);
    // Up and mobile again.
    const at = { ...state.player.pos };
    step(state, steerTo(at.x + 400, at.y), DT);
    expect(state.player.pos.x).toBeGreaterThan(at.x);
  });
});

/** Straight-line distance a point has moved from its start. */
function distanceMoved(
  now: { x: number; y: number },
  from: { x: number; y: number },
): number {
  return Math.hypot(now.x - from.x, now.y - from.y);
}
