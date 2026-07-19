// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Employee stampedes (src/game/hazards.ts, stepStampedes): a wall of runners
// that charges right-to-left across the field at great speed, TRAMPLES minions
// in its band (flung aside AND killed outright — no XP, no loot, an
// environmental death that can't be farmed), shoves elites/bosses, and — catching
// the grounded hero — strikes him ONCE (a difficulty-scaled max-hp bite AND a
// knockdown, Player.knockoutMs). A jump sails clean over the wall; a hero
// already down is never trampled twice.

import { describe, expect, it } from "vitest";

import {
  createGame,
  difficultyDef,
  dismissIntro,
  JUMP,
  skipCutscene,
  STAMPEDES,
  step,
} from "@game/core";
import type { Difficulty, GameState, Stampede } from "@game/core";
import {
  clearStage,
  DT,
  idle,
  makeEnemy,
  run,
  startGame,
  steerTo,
} from "./helpers.ts";

/** A stampede run staged clean with no live herd spawning under the test (the
 * cadence timer parked far out). */
function startStampedes(difficulty: Difficulty = "medium"): GameState {
  const state = createGame(42, "test_stampede_level", difficulty);
  skipCutscene(state);
  dismissIntro(state);
  clearStage(state);
  state.stampedeTimerMs = 999_999;
  return state;
}

/** The bite one herd takes at the run's difficulty — a fraction of max hp. */
function herdBite(state: GameState): number {
  return Math.max(
    1,
    Math.round(
      state.player.maxHp * difficultyDef(state.difficulty).stampedeDamageFrac,
    ),
  );
}

/** A hand-built herd, parked by the test rather than the spawner. */
function makeStampede(
  overrides: Partial<Stampede> & { pos: Stampede["pos"] },
): Stampede {
  return {
    id: 9300,
    speed: 0,
    runners: [],
    struck: false,
    ...overrides,
  };
}

/** Drop a herd right on top of the hero. */
function herdOnHero(state: GameState): Stampede {
  const herd = makeStampede({ pos: { ...state.player.pos } });
  state.stampedes.push(herd);
  return herd;
}

describe("stampedes — spawning", () => {
  it("spawns a five-runner herd on the level's cadence, capped at maxAlive", () => {
    const state = startGame(42, "test_stampede_level");
    clearStage(state);
    expect(state.stampedes).toHaveLength(0);
    run(state, idle, Math.ceil((800 * (STAMPEDES.maxAlive + 3)) / DT));
    expect(state.stampedes.length).toBeGreaterThan(0);
    expect(state.stampedes.length).toBeLessThanOrEqual(STAMPEDES.maxAlive);
    expect(state.stampedes[0]?.runners).toHaveLength(STAMPEDES.runnerCount);
  });

  it("never spawns on levels without stampedes", () => {
    const state = startGame(42, "test_well_level");
    clearStage(state);
    run(state, idle, 200);
    expect(state.stampedes).toHaveLength(0);
  });
});

describe("stampedes — the trample of the hero", () => {
  it("catches the grounded hero: a bite AND a knockdown", () => {
    const state = startStampedes();
    const hpBefore = state.player.hp;
    const bite = herdBite(state);
    herdOnHero(state);
    step(state, idle, DT);
    expect(state.player.hp).toBe(hpBefore - bite);
    // The hazard pass runs AFTER the player's knockout tick-down, so the timer
    // is set full this tick and only starts draining next tick.
    expect(state.player.knockoutMs).toBe(STAMPEDES.knockdownMs);
    expect(state.events.some((e) => e.type === "stampedeHit")).toBe(true);
  });

  it("scales the bite by difficulty: 10/15/20/30/40% of the hero's max hp", () => {
    const rungs: [Difficulty, number][] = [
      ["easy", 0.1],
      ["medium", 0.15],
      ["hard", 0.2],
      ["nightmare", 0.3],
      ["jesus", 0.4],
    ];
    for (const [difficulty, frac] of rungs) {
      const state = startStampedes(difficulty);
      const hpBefore = state.player.hp;
      herdOnHero(state);
      step(state, idle, DT);
      const expected = Math.max(1, Math.round(state.player.maxHp * frac));
      expect(hpBefore - state.player.hp, difficulty).toBe(expected);
    }
  });

  it("a jumping hero sails over the whole wall — no strike, no knockdown", () => {
    const state = startStampedes();
    state.player.z = JUMP.dodgeHeight + 30;
    state.player.vz = 100;
    const hpBefore = state.player.hp;
    herdOnHero(state);
    step(state, idle, DT);
    expect(state.player.hp).toBe(hpBefore);
    expect(state.player.knockoutMs).toBe(0);
  });

  it("never tramples a hero already down — no chain-lock", () => {
    const state = startStampedes();
    state.player.knockoutMs = 400;
    const hpBefore = state.player.hp;
    herdOnHero(state);
    step(state, idle, DT);
    expect(state.player.hp).toBe(hpBefore);
    expect(state.player.knockoutMs).toBeLessThan(400);
  });

  it("strikes only once per herd, even as it charges over him", () => {
    const state = startStampedes();
    const herd = makeStampede({
      pos: { x: state.player.pos.x + 30, y: state.player.pos.y },
      speed: 200,
    });
    state.stampedes.push(herd);
    const hpBefore = state.player.hp;
    // Let it charge across the hero over several ticks.
    run(state, idle, 8);
    // One bite only (the knockdown makes further ticks no-ops anyway).
    expect(hpBefore - state.player.hp).toBe(herdBite(state));
  });
});

describe("stampedes — trampling the horde", () => {
  it("kills a minion in its path outright — no XP, no loot, no farm", () => {
    const state = startStampedes();
    state.player.pos = { x: 400, y: 400 };
    const minion = makeEnemy({ pos: { x: 1200, y: 800 } });
    state.enemies.push(minion);
    const xpBefore = state.player.xp;
    const killsBefore = state.stats.kills;
    const itemsBefore = state.items.length;
    state.stampedes.push(makeStampede({ pos: { ...minion.pos } }));
    step(state, idle, DT);
    expect(state.enemies).not.toContain(minion);
    expect(state.events.some((e) => e.type === "stampedeTrample")).toBe(true);
    // Environmental death: nothing credited to the player.
    expect(state.player.xp).toBe(xpBefore);
    expect(state.stats.kills).toBe(killsBefore);
    expect(state.items.length).toBe(itemsBefore);
  });

  it("shoves an elite/boss out of the band without killing it", () => {
    const state = startStampedes();
    state.player.pos = { x: 400, y: 400 };
    const boss = makeEnemy(
      { pos: { x: 1200, y: 800 }, hp: 500, maxHp: 500 },
      "test_boss",
    );
    state.enemies.push(boss);
    const hpBefore = boss.hp;
    state.stampedes.push(makeStampede({ pos: { ...boss.pos } }));
    step(state, idle, DT);
    // Still alive on the board, only nudged aside.
    expect(state.enemies).toContain(boss);
    expect(boss.hp).toBe(hpBefore);
    expect(Math.hypot(boss.pos.x - 1200, boss.pos.y - 800)).toBeGreaterThan(0);
  });
});

describe("stampedes — charging off the stage", () => {
  it("despawns a herd that has charged clear of the player", () => {
    const state = startStampedes();
    state.player.pos = { x: 400, y: 400 };
    state.stampedes.push(
      makeStampede({
        pos: { x: 400 - STAMPEDES.despawnDistance - 20, y: 400 },
        speed: 0,
      }),
    );
    step(state, idle, DT);
    expect(state.stampedes).toHaveLength(0);
  });
});

describe("stampedes — the hero lies helpless after a trample", () => {
  it("freezes the trampled hero, then he gets up when the timer lapses", () => {
    const state = startStampedes();
    state.player.pos = { x: 400, y: 400 };
    herdOnHero(state);
    step(state, idle, DT); // trampled — now down
    expect(state.player.knockoutMs).toBeGreaterThan(0);
    // Steering does nothing while he's down.
    const at = { ...state.player.pos };
    step(state, steerTo(at.x + 400, at.y), DT);
    expect(state.player.pos).toEqual(at);
    // Ride out the knockdown; he recovers and moves again.
    run(state, idle, Math.ceil(STAMPEDES.knockdownMs / DT) + 2);
    expect(state.player.knockoutMs).toBe(0);
    step(state, steerTo(at.x + 400, at.y), DT);
    expect(state.player.pos.x).toBeGreaterThan(at.x);
  });
});
