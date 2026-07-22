// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Airborne restrictions: while the hero is up in a jump (z above
// JUMP.dodgeHeight) he is FLOATING over the field, so he can neither reach
// the grounded horde with a melee weapon nor scoop loot off the ground — the
// same z rule that already lets enemies pass beneath him. Ranged and magic
// still fire from height. See stepWeapon / stepItems in src/game/step/.

import { describe, expect, it } from "vitest";

import { JUMP, step } from "@game/core";

import {
  clearStage,
  DT,
  equipBlaster,
  idle,
  makeEnemy,
  startGame,
} from "./helpers.ts";

/** A clean stage with one fat target sitting on top of the hero. */
function stagedTarget(state = startGame()) {
  clearStage(state);
  state.obstacles = [];
  state.player.weaponCooldownMs = 0;
  state.enemies = [
    makeEnemy({ id: 1, pos: { ...state.player.pos }, hp: 200, maxHp: 200 }),
  ];
  return state;
}

/** Lift the hero clear of the ground for a jumped step. */
function airborne(state: ReturnType<typeof stagedTarget>): void {
  state.player.z = JUMP.dodgeHeight + 40;
  state.player.vz = 200;
}

describe("airborne melee", () => {
  it("a melee swing whiffs while the hero is airborne", () => {
    const state = stagedTarget(); // default melee weapon
    airborne(state);
    const target = state.enemies[0]!;
    step(state, idle, DT);
    expect(target.hp).toBe(200);
    expect(state.events.some((e) => e.type === "swing")).toBe(false);
    expect(state.events.some((e) => e.type === "enemyHit")).toBe(false);
  });

  it("the same swing lands the instant he is grounded", () => {
    const state = stagedTarget();
    const target = state.enemies[0]!;
    step(state, idle, DT);
    expect(target.hp).toBeLessThan(200);
  });

  it("ranged still fires from the air (the guard is melee-only)", () => {
    const state = stagedTarget();
    equipBlaster(state);
    state.enemies = [
      makeEnemy({
        id: 1,
        pos: { x: state.player.pos.x + 40, y: state.player.pos.y },
        hp: 200,
        maxHp: 200,
      }),
    ];
    airborne(state);
    step(state, idle, DT);
    expect(state.events.some((e) => e.type === "shot")).toBe(true);
  });
});

describe("airborne loot pickup", () => {
  /** A clean stage with a medkit sitting on top of the hero. */
  function stagedDrop() {
    const state = startGame();
    clearStage(state);
    state.items = [
      { id: state.nextId++, kind: "medkit", pos: { ...state.player.pos } },
    ];
    return state;
  }

  it("a jump floats past loot without taking it", () => {
    const state = stagedDrop();
    state.player.z = JUMP.dodgeHeight + 40;
    state.player.vz = 200;
    step(state, idle, DT);
    expect(state.items).toHaveLength(1);
    expect(state.stats.itemsCollected).toBe(0);
  });

  it("landed, the hero scoops the same drop", () => {
    const state = stagedDrop();
    step(state, idle, DT);
    expect(state.items).toHaveLength(0);
    expect(state.stats.itemsCollected).toBe(1);
  });
});
