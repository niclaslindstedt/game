// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The horde spawner: the wave budget streams thousands of monsters in over
// the level — starting as a trickle, escalating to a flood — landing in a
// ring outside the player's view, capped by the live limit, and counted
// into the totals the HUD and the loot guarantees rely on.

import { describe, expect, it } from "vitest";

import { allocateStat, ENEMY_AI, enemyDef, LEVELS, step } from "@game/core";
import type { GameState } from "@game/core";
import { DT, idle, makeEnemy, run, startGame } from "./helpers.ts";

const WAVES = LEVELS.moon!.waves!;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);
const isBoss = (defId: string) => enemyDef(defId).role === "boss";
const spawnedSoFar = (state: GameState) =>
  state.waveSpawned.reduce((sum, n) => sum + n, 0);

/**
 * Step with idle input, auto-spending level-ups so time keeps flowing and
 * holding the player airborne so the horde can never end the run early.
 */
function stepThrough(state: GameState, steps: number): void {
  for (let i = 0; i < steps; i++) {
    state.player.z = 100;
    state.player.vz = 0;
    step(state, idle, DT);
    while (state.player.pendingStatPoints > 0) allocateStat(state, "health");
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

    const minions = state.enemies.filter((e) => !isBoss(e.defId));
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
      state.enemies.filter((e) => !isBoss(e.defId)).length,
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

  it("holds the trophy back while the horde is still coming", () => {
    const state = startGame();
    state.items = [];
    state.enemies = state.enemies.filter((e) => isBoss(e.defId));
    state.enemies.push(
      makeEnemy({
        pos: { x: state.player.pos.x + 40, y: state.player.pos.y },
        hp: 1,
        maxHp: 1,
      }),
    );
    // The last LIVE minion dies, but the wave budget is untouched — no
    // MOON'S BLADE until the level is truly cleared.
    run(state, idle, 200, (s) => !s.enemies.some((e) => !isBoss(e.defId)));
    expect(
      state.items.some(
        (i) => i.kind === "equipment" && i.equipment.defId === "moons_blade",
      ),
    ).toBe(false);
  });
});
