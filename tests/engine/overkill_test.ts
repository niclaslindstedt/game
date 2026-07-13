// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The OVERKILL TOLL: a killing blow far beyond the mob's full health pays out
// proportionally less — a hit at 2× the bar earns half the xp, at 3× a third
// (`overkillEfficiency`), and the same efficiency scales the minion drop
// roll — so farming mobs a build one-shots several times over is deliberately
// unrewarding. Runs on the synthetic engine fixtures.

import { afterEach, describe, expect, it } from "vitest";

import {
  hitEnemy,
  overkillEfficiency,
  resetBalanceTuning,
  setBalanceTuning,
} from "@game/core";
import type { GameEvent, GameState } from "@game/core";

import { clearStage, makeEnemy, startGame } from "./helpers.ts";

afterEach(() => resetBalanceTuning());

/** A clean stage with the rng pinned high: the blow never crits (so the
 * damage we pass is the damage that lands) and every chance roll misses. */
function bareStage(): GameState {
  const state = startGame();
  clearStage(state);
  state.rng = () => 0.99;
  return state;
}

/** Kill one staged mob with an exact blow and return the kill event's xp. */
function xpFromKill(state: GameState, maxHp: number, damage: number): number {
  const { x, y } = state.player.pos;
  const enemy = makeEnemy(
    { id: state.nextId++, pos: { x: x + 30, y }, hp: maxHp, maxHp },
    "test_minion",
  );
  state.enemies.push(enemy);
  state.events = [];
  hitEnemy(state, enemy, damage);
  const killed = state.events.find(
    (e): e is Extract<GameEvent, { type: "enemyKilled" }> =>
      e.type === "enemyKilled",
  );
  expect(killed).toBeDefined();
  return killed!.xp;
}

describe("overkillEfficiency — the curve", () => {
  it("pays full value up to the mob's whole bar, then 1/overkill", () => {
    expect(overkillEfficiency(50, 100)).toBe(1); // finishing a wounded mob
    expect(overkillEfficiency(100, 100)).toBe(1); // exactly the bar
    expect(overkillEfficiency(200, 100)).toBe(0.5); // 2× the bar → half
    expect(overkillEfficiency(300, 100)).toBeCloseTo(1 / 3); // 3× → a third
    expect(overkillEfficiency(250, 100)).toBeCloseTo(0.4); // between: maxHp/damage
  });
});

describe("kill event — launch inputs", () => {
  it("carries the victim's full bar so the app can size the death launch", () => {
    const state = bareStage();
    const { x, y } = state.player.pos;
    const enemy = makeEnemy(
      { id: state.nextId++, pos: { x: x + 30, y }, hp: 40, maxHp: 200 },
      "test_minion",
    );
    state.enemies.push(enemy);
    state.events = [];
    // A blow far past the mob's whole bar: the overkill (damage − maxHp) is
    // what the app measures the corpse throw off.
    hitEnemy(state, enemy, 5_000);
    const killed = state.events.find(
      (e): e is Extract<GameEvent, { type: "enemyKilled" }> =>
        e.type === "enemyKilled",
    );
    expect(killed).toBeDefined();
    expect(killed!.maxHp).toBe(200);
    expect(killed!.damage - killed!.maxHp).toBe(4_800); // the overkill
  });
});

describe("overkill toll — xp", () => {
  it("a clean kill pays the mob's full hp-proportional xp", () => {
    const state = bareStage();
    expect(xpFromKill(state, 100, 100)).toBe(100);
  });

  it("a 2× blow pays half, a 3× blow a third", () => {
    const state = bareStage();
    expect(xpFromKill(state, 100, 200)).toBe(50);
    expect(xpFromKill(state, 100, 300)).toBe(33); // round(100/3)
  });

  it("never rounds a kill's reward below 1 xp", () => {
    const state = bareStage();
    expect(xpFromKill(state, 10, 1_000_000)).toBe(1);
  });
});

describe("overkill toll — drops", () => {
  /** Kill `count` staged mobs with a blow of `damage` against a `maxHp` bar
   * and return how many items fell. dropRate 20 saturates the per-kill
   * chance, so at full efficiency nearly every kill drops something. */
  function drops(
    seed: number,
    count: number,
    maxHp: number,
    damage: number,
  ): number {
    setBalanceTuning({ dropRate: 20 });
    const state = startGame(seed);
    clearStage(state);
    state.items = [];
    for (let i = 0; i < count; i++) {
      const enemy = makeEnemy(
        {
          id: state.nextId++,
          pos: { x: state.player.pos.x + 60, y: state.player.pos.y },
          hp: maxHp,
          maxHp,
        },
        "test_minion",
      );
      state.enemies.push(enemy);
      hitEnemy(state, enemy, damage, undefined, { rollAccuracy: false });
    }
    return state.items.length;
  }

  it("one-shot farming starves the drop rain the same way", () => {
    // 30 clean kills vs 30 kills at 10× the bar (efficiency 0.1): the
    // saturated chance collapses to ~18%, so the overkilled field pays out a
    // small fraction of the clean one. Summed over seeds so one lucky run
    // can't flip the comparison.
    let clean = 0;
    let overkilled = 0;
    for (const seed of [1, 2, 3]) {
      clean += drops(seed, 30, 100, 100);
      overkilled += drops(seed, 30, 100, 1_000);
    }
    expect(clean).toBeGreaterThan(overkilled * 2);
    expect(overkilled).toBeGreaterThan(0); // starved, never fully shut off
  });
});
