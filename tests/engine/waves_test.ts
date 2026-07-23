// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The horde spawner: the wave budget streams thousands of monsters in over
// the level — starting as a trickle, escalating to a flood — landing in a
// ring outside the player's view, capped by the live limit, and counted
// into the totals the HUD and the loot guarantees rely on.

import { describe, expect, it } from "vitest";

import {
  allocateStat,
  ENEMY_AI,
  enemyDef,
  levelDef,
  PLAYER,
  step,
} from "@game/core";
import type { GameState } from "@game/core";
import { DT, idle, startGame } from "./helpers.ts";

const WAVES = levelDef("test_level").waves!;
import { distance as dist } from "@game/lib/vec.ts";
const isBoss = (defId: string) => enemyDef(defId).role === "boss";
const isMinion = (defId: string) => enemyDef(defId).role === "minion";
const spawnedSoFar = (state: GameState) =>
  state.waveSpawned.reduce((sum, n) => sum + n, 0);

/**
 * Step with idle input, auto-spending level-ups so time keeps flowing,
 * holding the player airborne so the horde can never end the run early,
 * and keeping the weapon quiet so no kills muddy the spawn counts (the
 * near-floor would refill every death, hiding the windowed ramp). The camp
 * clock is reset every step — a genuinely parked player would STARVE the
 * spawner (config CAMPING; see camping_test.ts), and these suites measure
 * the ramp a player on the move experiences.
 */
function stepThrough(state: GameState, steps: number): void {
  for (let i = 0; i < steps; i++) {
    state.player.z = 100;
    state.player.vz = 0;
    state.player.weaponCooldownMs = 1_000_000;
    state.campMs = 0;
    step(state, idle, DT);
    while (state.player.pendingStatPoints > 0) allocateStat(state, "stamina");
  }
}

describe("wave spawner", () => {
  it("counts the whole wave budget into totalEnemies", () => {
    const state = startGame();
    const budget = WAVES.budget.reduce((sum, entry) => sum + entry.count, 0);
    expect(budget).toBeGreaterThanOrEqual(1000); // an absurd haunting
    expect(state.stats.totalEnemies).toBe(state.enemies.length + budget);
  });

  it("starts as a trickle and escalates", () => {
    const state = startGame();
    stepThrough(state, 1875); // 30s
    const early = spawnedSoFar(state);
    stepThrough(state, 1875); // 60s
    const mid = spawnedSoFar(state) - early;
    stepThrough(state, 1875); // 90s
    const late = spawnedSoFar(state) - early - mid;

    expect(early).toBeGreaterThan(0);
    expect(mid).toBeGreaterThan(early);
    expect(late).toBeGreaterThan(mid);
  });

  it("respects the live cap and the spawn ring", () => {
    const state = startGame();
    state.stats.timeMs = WAVES.rampDurationMs; // the whole budget is due
    const firstNewId = state.nextId;
    step(state, idle, DT);

    const minions = state.enemies.filter((e) => isMinion(e.defId));
    expect(minions.length).toBe(WAVES.maxAlive);
    for (const enemy of state.enemies) {
      if (enemy.id < firstNewId) continue;
      expect(dist(enemy.pos, state.player.pos)).toBeGreaterThanOrEqual(
        ENEMY_AI.minSpawnDistance,
      );
    }
  });

  it("defers capped spawns instead of dropping them", () => {
    const state = startGame();
    state.stats.timeMs = WAVES.rampDurationMs;
    step(state, idle, DT);
    const afterCap = spawnedSoFar(state);

    // Cull half the field: the spawner backfills on the next step.
    state.enemies = state.enemies.filter(
      (e, i) => isBoss(e.defId) || i % 2 === 0,
    );
    step(state, idle, DT);
    expect(spawnedSoFar(state)).toBeGreaterThan(afterCap);
    expect(
      state.enemies.filter((e) => isMinion(e.defId)).length,
    ).toBeLessThanOrEqual(WAVES.maxAlive);
  });

  it("stays deterministic while the horde streams in", () => {
    const a = startGame();
    const b = startGame();
    stepThrough(a, 1200);
    stepThrough(b, 1200);
    expect(a.enemies.map((e) => e.pos)).toEqual(b.enemies.map((e) => e.pos));
    expect(a.waveSpawned).toEqual(b.waveSpawned);
  });

  it("keeps at least minAlive minions in the field from the first step", () => {
    const state = startGame();
    // Strip the placed spawns: the floor alone must repopulate the screen.
    state.enemies = state.enemies.filter((e) => isBoss(e.defId));
    step(state, idle, DT);
    expect(state.enemies.filter((e) => isMinion(e.defId)).length).toBe(
      WAVES.minAlive,
    );
  });

  it("stirs extra monsters awake as the player walks", () => {
    const state = startGame();
    stepThrough(state, 1); // settle the opening floor spawns
    const before = spawnedSoFar(state);

    // Bank a long walk without simulating it step by step.
    state.moveSpawnCredit = WAVES.moveSpawnEvery * 5;
    state.player.z = 100; // stay untouchable, as stepThrough does
    step(state, idle, DT);
    expect(spawnedSoFar(state)).toBeGreaterThanOrEqual(before + 5);
    expect(state.moveSpawnCredit).toBeLessThan(WAVES.moveSpawnEvery);
  });

  it("banks walked distance into moveSpawnCredit while steering", () => {
    const state = startGame();
    const target = { x: state.player.pos.x + 200, y: state.player.pos.y };
    step(state, { steering: true, target, jump: false }, DT);
    // One step's walk (well under moveSpawnEvery, so nothing is spent yet).
    expect(state.moveSpawnCredit).toBeCloseTo((PLAYER.speed * DT) / 1000, 3);

    step(state, idle, DT);
    expect(state.moveSpawnCredit).toBeCloseTo((PLAYER.speed * DT) / 1000, 3);
  });
});
