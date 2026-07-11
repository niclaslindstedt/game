// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// CAMPING PRESSURE (config CAMPING): a player who parks in one spot stops
// being fed — the live floor and the timed stream starve after a grace
// period — and the only arrivals left are a slow beckoning trickle from the
// objective's direction. Moving re-anchors the clock and the flood resumes.
// Once a killBoss level's budget is spent, a thin endless straggler stream
// keeps the walk to the boss alive (clearAll levels stay finite). Runs on
// the synthetic engine fixtures.

import { describe, expect, it } from "vitest";

import { CAMPING, enemyDef, step } from "@game/core";
import type { GameState } from "@game/core";

import { DT, idle, makeEnemy, startGame, stopWaves } from "./helpers.ts";

const isMinion = (state: GameState, id: number) =>
  state.enemies.some((e) => e.id === id && enemyDef(e.defId).role === "minion");

const minions = (state: GameState) =>
  state.enemies.filter((e) => enemyDef(e.defId).role === "minion");

const spawnedSoFar = (state: GameState) =>
  state.waveSpawned.reduce((sum, n) => sum + n, 0);

/** Strip the field to the parked boss WITHOUT touching the wave budget. */
function clearMinions(state: GameState): void {
  state.enemies = state.enemies.filter(
    (e) => enemyDef(e.defId).role === "boss",
  );
}

/** Angle (rad) between the bearings player→a and player→b. */
function bearingGap(state: GameState, a: { x: number; y: number }): number {
  const boss = state.enemies.find((e) => enemyDef(e.defId).role === "boss")!;
  const p = state.player.pos;
  const toSpawn = Math.atan2(a.y - p.y, a.x - p.x);
  const toBoss = Math.atan2(boss.pos.y - p.y, boss.pos.x - p.x);
  let gap = Math.abs(toSpawn - toBoss);
  if (gap > Math.PI) gap = 2 * Math.PI - gap;
  return gap;
}

describe("camping starves the spawner", () => {
  it("a fresh camper is fed as usual; a starved one watches the floor stop", () => {
    // Fresh ground: the live floor refills an emptied field on the next step.
    const fed = startGame();
    clearMinions(fed);
    step(fed, idle, DT);
    expect(minions(fed).length).toBeGreaterThan(0);

    // Parked past grace + fade: the floor is fully starved — nothing refills.
    const starved = startGame();
    clearMinions(starved);
    starved.campMs = CAMPING.graceMs + CAMPING.fadeMs;
    starved.trickleMs = Number.MAX_SAFE_INTEGER; // isolate the floor
    step(starved, idle, DT);
    expect(minions(starved).length).toBe(0);
  });

  it("full starvation also holds the timed budget stream (deferred, not canceled)", () => {
    const state = startGame();
    state.stats.timeMs = 200_000; // deep into the ramp — a big backlog is due
    state.campMs = CAMPING.graceMs + CAMPING.fadeMs;
    state.trickleMs = Number.MAX_SAFE_INTEGER;
    const before = spawnedSoFar(state);
    step(state, idle, DT);
    expect(spawnedSoFar(state)).toBe(before);

    // Moving on re-anchors the camp clock and the held backlog floods back.
    state.player.pos = {
      x: state.player.pos.x + CAMPING.campRadius + 10,
      y: state.player.pos.y,
    };
    step(state, idle, DT);
    expect(state.campMs).toBe(0);
    expect(spawnedSoFar(state)).toBeGreaterThan(before);
  });

  it("a starved camper is beckoned: one budget mob at a time, from the boss's bearing", () => {
    const state = startGame();
    clearMinions(state);
    state.campMs = CAMPING.graceMs + CAMPING.fadeMs;
    state.trickleMs = 0;
    const budgetBefore = spawnedSoFar(state);

    step(state, idle, DT);

    // Exactly one arrival, drawn from the wave budget, inside the cone
    // around the objective bearing (plus a little slack for the ring math).
    const arrived = minions(state);
    expect(arrived.length).toBe(1);
    expect(spawnedSoFar(state)).toBe(budgetBefore + 1);
    const spread = (CAMPING.directionSpreadDeg * Math.PI) / 180;
    expect(bearingGap(state, arrived[0]!.pos)).toBeLessThanOrEqual(
      spread + 0.1,
    );
    // The cooldown holds the next arrival for beaconEveryMs.
    expect(state.trickleMs).toBeGreaterThan(0);
    step(state, idle, DT);
    expect(minions(state).length).toBe(1);
  });

  it("a spent budget on a killBoss level leaves an endless straggler stream", () => {
    const state = startGame();
    stopWaves(state); // budget spent (parks the trickle cooldown too)
    clearMinions(state);
    state.trickleMs = 0; // this suite probes the trickle — unpark it
    const budgetBefore = spawnedSoFar(state);

    step(state, idle, DT);

    // One straggler walked in from the boss's direction — an EXTRA mob, never
    // booked against the budget (the objective stays clearable bookkeeping).
    const arrived = minions(state);
    expect(arrived.length).toBe(1);
    expect(isMinion(state, arrived[0]!.id)).toBe(true);
    expect(spawnedSoFar(state)).toBe(budgetBefore);
    const spread = (CAMPING.directionSpreadDeg * Math.PI) / 180;
    expect(bearingGap(state, arrived[0]!.pos)).toBeLessThanOrEqual(
      spread + 0.1,
    );
    // Cadence: nothing more until stragglerEveryMs has passed.
    step(state, idle, DT);
    expect(minions(state).length).toBe(1);
  });

  it("stragglers never flow on a clearAll level — it must stay clearable", () => {
    const state = startGame(42, "test_clearall_level");
    stopWaves(state);
    clearMinions(state);
    state.trickleMs = 0;
    for (let i = 0; i < 10; i++) step(state, idle, DT);
    expect(minions(state).length).toBe(0);
  });

  it("the straggler stream is a trickle, not a second flood", () => {
    const state = startGame();
    stopWaves(state);
    clearMinions(state);
    state.trickleMs = 0;
    // Park a crowd at the player: with the near-field already thick, the
    // straggler stream holds off entirely.
    for (let i = 0; i < CAMPING.stragglerMinAlive; i++) {
      state.enemies.push(
        makeEnemy({
          id: state.nextId++,
          pos: { x: state.player.pos.x + 50 + i, y: state.player.pos.y },
        }),
      );
    }
    const before = minions(state).length;
    step(state, idle, DT);
    expect(minions(state).length).toBe(before);
  });
});
