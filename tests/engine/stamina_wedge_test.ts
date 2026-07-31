// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The sprint pool prices GROUND COVERED, not the intent to cover it. A hero
// held in place by geometry — square-on to a wall, pinned on a rock, shoved
// into the level bound — is not sprinting however hard the input pushes, so he
// neither spends the pool nor keeps his own regen lockout armed. Before this
// rule the stamina ledger was settled BEFORE the collision pass, so grinding
// along a wall billed a full sprint for a step the wall took back, and the hero
// reached the doorway winded (see step/player.ts).

import { describe, expect, it } from "vitest";

import { PLAYER, step, type GameInput } from "@game/core";

import { clearStage, DT, startGame } from "./helpers.ts";

/** Steer flat out toward `target` for `seconds`, returning the run's state. */
function shove(target: { x: number; y: number }, seconds: number) {
  const state = startGame();
  clearStage(state);
  // Park him against the level's left bound — the one blocker every level has,
  // so the rule is proven without leaning on a fixture's rolled obstacles.
  state.players[0].pos = { x: PLAYER.radius, y: state.level.height / 2 };
  const input: GameInput = {
    steering: true,
    target,
    jump: false,
    throttle: 1,
  };
  const startStamina = state.players[0].stamina;
  for (let t = 0; t < (seconds * 1000) / DT; t++) step(state, input, DT);
  return { state, startStamina, moved: state.players[0].pos.x - PLAYER.radius };
}

describe("a wedged hero does not pay for a sprint he never ran", () => {
  it("spends no stamina while held against the level bound", () => {
    // Straight into the wall: the step is granted, then taken back every tick.
    const { state, startStamina, moved } = shove({ x: -5000, y: 800 }, 30);
    expect(Math.abs(moved)).toBeLessThan(1);
    expect(state.players[0].stamina).toBe(startStamina);
  });

  it("leaves the regen lockout unarmed while wedged", () => {
    const { state } = shove({ x: -5000, y: 800 }, 30);
    expect(state.staminaRegenLockMs).toBe(0);
    expect(state.staminaEmptyMs).toBe(0);
  });

  it("still drains in the open — the tuned run is untouched", () => {
    // The control: the same flat-out push, with nothing in the way.
    const { state, startStamina } = shove({ x: 5000, y: 800 }, 30);
    expect(state.players[0].stamina).toBeLessThan(startStamina);
    expect(state.players[0].stamina).toBe(0);
  });

  it("charges a wall-slide for the ground it actually makes", () => {
    // Steering diagonally into the bound: the wall keeps the x, the hero keeps
    // the y — so he pays, but less than an unobstructed run of the same push.
    // Measured over a window SHORTER than the pool lasts: once both runs bottom
    // out at 0 the comparison saturates and proves nothing.
    const slide = shove({ x: -5000, y: 100000 }, 4);
    const open = shove({ x: 5000, y: 100000 }, 4);
    const slideSpent = slide.startStamina - slide.state.players[0].stamina;
    const openSpent = open.startStamina - open.state.players[0].stamina;
    expect(slideSpent).toBeGreaterThan(0);
    expect(slideSpent).toBeLessThan(openSpent);
  });
});
