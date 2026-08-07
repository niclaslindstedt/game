// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CAR'S KEYS (pwa/src/game/car-keys.ts): WASD at the wheel is a set of
// PEDALS rather than a direction on screen — D accelerates, A slows and backs
// up, W and S are the wheel — and it means that whichever way the wagon is
// facing. The round trip through the engine's own reader (`carControl`) is the
// half that matters: the app hands the engine a target, and what comes back out
// of it has to be the control that went in, on the leg out AND on the leg home.

import { describe, expect, it } from "vitest";

import {
  CAR_KEYS_IDLE,
  carKeyControl,
  carKeyTarget,
} from "../pwa/src/game/car-keys.ts";
import {
  DEFAULT_KEYBINDINGS,
  withBinding,
} from "../pwa/src/game/keybindings.ts";
import { carControl } from "../src/game/vehicles.ts";
import type { CarVehicle, GameInput } from "../src/index.ts";

const binds = DEFAULT_KEYBINDINGS;

/** A control with the lever DOWN — every expectation below names one, because
 * the handbrake is a field on the shape rather than an optional extra. */
const pedals = (pedal: number, wheel: number) => ({
  pedal,
  wheel,
  handbrake: false,
});

/** A car standing at the origin, facing the way `faceLeft` says. Only the two
 * fields the composer reads are needed. */
const carAt = (faceLeft: boolean) =>
  ({ pos: { x: 100, y: 100 }, faceLeft }) as CarVehicle;

/** What the ENGINE makes of the keys — the whole path, app composer included. */
function throughEngine(held: string[], faceLeft: boolean) {
  const car = carAt(faceLeft);
  const target = carKeyTarget(car, carKeyControl(held, binds), 200);
  const input = { steering: true, target, jump: false } as GameInput;
  return carControl(car, input);
}

describe("the keys at the wheel", () => {
  it("reads D as the accelerator and A as the brake", () => {
    expect(carKeyControl(["KeyD"], binds)).toEqual(pedals(1, 0));
    expect(carKeyControl(["KeyA"], binds)).toEqual(pedals(-1, 0));
  });

  it("reads W and S as the wheel — up the screen, then down", () => {
    expect(carKeyControl(["KeyW"], binds)).toEqual(pedals(0, -1));
    expect(carKeyControl(["KeyS"], binds)).toEqual(pedals(0, 1));
  });

  it("accelerates through a turn, and cancels opposite pedals to a coast", () => {
    expect(carKeyControl(["KeyD", "KeyW"], binds)).toEqual(pedals(1, -1));
    expect(carKeyControl(["KeyD", "KeyA"], binds)).toEqual(CAR_KEYS_IDLE);
    expect(carKeyControl([], binds)).toEqual(CAR_KEYS_IDLE);
  });

  it("follows a rebound steering key", () => {
    const rebound = withBinding(binds, "moveRight", "KeyL");
    expect(carKeyControl(["KeyL"], rebound)).toEqual(pedals(1, 0));
    // …and the key it left behind drives nothing any more.
    expect(carKeyControl(["KeyD"], rebound)).toEqual(CAR_KEYS_IDLE);
  });

  it("drives on the arrows while they are spare, and never once they are not", () => {
    expect(carKeyControl(["ArrowRight"], binds)).toEqual(pedals(1, 0));
    expect(carKeyControl(["ArrowUp"], binds)).toEqual(pedals(0, -1));
    // A player who put the MAP on an arrow meant the map.
    const mapped = withBinding(binds, "map", "ArrowUp");
    expect(carKeyControl(["ArrowUp"], mapped)).toEqual(CAR_KEYS_IDLE);
    // Same for the walk modifier, which is a bind without being an action.
    const walked = withBinding(binds, "walk", "ArrowDown");
    expect(carKeyControl(["ArrowDown"], walked)).toEqual(CAR_KEYS_IDLE);
  });

  // The lever is the JUMP bind — space as it ships — because a man in a car
  // cannot jump and every driving game in existence puts the handbrake there.
  it("reads the JUMP bind as the handbrake, wherever it is bound", () => {
    expect(carKeyControl(["Space"], binds).handbrake).toBe(true);
    expect(carKeyControl(["KeyD"], binds).handbrake).toBe(false);
    // …and it follows the bind rather than the key.
    const rebound = withBinding(binds, "jump", "KeyB");
    expect(carKeyControl(["KeyB"], rebound).handbrake).toBe(true);
    expect(carKeyControl(["Space"], rebound).handbrake).toBe(false);
  });

  it("keeps steering while the lever is up — both hands stay busy", () => {
    const stopping = carKeyControl(["KeyD", "KeyW", "Space"], binds);
    expect(stopping.handbrake).toBe(true);
    expect(stopping.pedal).toBe(1);
    expect(stopping.wheel).toBe(-1);
  });
});

describe("what the engine makes of them", () => {
  // The bug this pins: the accelerator used to be "push the way the car is
  // pointing", so the same D that drove out of the garage was the BRAKE on the
  // way home, where the wagon is drawn nose-left.
  it("keeps D on the accelerator on both legs of the road", () => {
    expect(throughEngine(["KeyD"], false).pedal).toBeCloseTo(1, 6);
    expect(throughEngine(["KeyD"], true).pedal).toBeCloseTo(1, 6);
    expect(throughEngine(["KeyA"], false).pedal).toBeCloseTo(-1, 6);
    expect(throughEngine(["KeyA"], true).pedal).toBeCloseTo(-1, 6);
  });

  it("keeps W turning up the screen whichever way the nose points", () => {
    expect(throughEngine(["KeyW"], false).wheel).toBeCloseTo(-1, 6);
    expect(throughEngine(["KeyW"], true).wheel).toBeCloseTo(-1, 6);
    expect(throughEngine(["KeyS"], false).wheel).toBeCloseTo(1, 6);
    expect(throughEngine(["KeyS"], true).wheel).toBeCloseTo(1, 6);
  });

  it("splits a held pair between the pedal and the wheel", () => {
    const both = throughEngine(["KeyD", "KeyW"], true);
    expect(both.pedal).toBeGreaterThan(0.7);
    expect(both.wheel).toBeLessThan(-0.7);
  });
});
