// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE FLIGHT'S WIND VANE — the arrow's reading, the streaks' speed, and the
// instrument's tremble.
//
// All three are things the player reads WITHOUT reading, which is exactly why
// they need asserting: an arrow that snapped to its reading would still be
// pointing the right way, a tremble that started at the first breath of wind
// would still be a tremble, and an arrow that kept its head in dead calm would
// still be an arrow. None of them would say what it is there to say.

import { describe, expect, it } from "vitest";

import {
  CALM_BELOW,
  SHAKE_FROM,
  SHAKE_PX,
  SHAKE_SPIN_DEG,
  STREAK_MAX_SPEED,
  STREAK_MIN_SPEED,
  streakSpeed,
  vaneShake,
  vaneShakeDeg,
  vaneShakePx,
  vaneStep,
  windPush,
} from "../pwa/src/game/hud/widgets/wind-vane.ts";

describe("the wind arrow's reading", () => {
  it("is nothing at all in still air", () => {
    expect(windPush(0, 0)).toBe(0);
    // …and in air that is moving with nowhere to push: no shoulder, no arrow.
    expect(windPush(0, 0.9)).toBe(0);
  });

  it("points the way the wind pushes, as far as it is strong", () => {
    expect(windPush(1, 1)).toBe(1);
    expect(windPush(-1, 1)).toBe(-1);
    expect(windPush(1, 0.5)).toBeCloseTo(0.5, 5);
    expect(windPush(-1, 0.25)).toBeCloseTo(-0.25, 5);
  });

  it("never reads past its own scale, whatever it is handed", () => {
    expect(windPush(1, 4)).toBe(1);
    expect(Math.abs(windPush(-1, -3))).toBe(0);
  });

  it("leaves the arrow headless while the reading is a dead calm", () => {
    // The widget drops the head below CALM_BELOW: an arrow pointing somewhere
    // in still air is a reading the player would act on for nothing.
    expect(Math.abs(windPush(1, CALM_BELOW / 2))).toBeLessThan(CALM_BELOW);
    expect(Math.abs(windPush(1, 0.4))).toBeGreaterThan(CALM_BELOW);
  });

  it("SWELLS into a gust rather than snapping to it", () => {
    // A single frame closes only part of the gap — that is the whole reason
    // the arrow is code and not a bound value.
    const first = vaneStep(0, 1);
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(0.5);
    // …and a second of them arrives, so a gust is not still news when it is
    // over: 60 frames is a second at 60 Hz.
    let at = 0;
    for (let i = 0; i < 60; i++) at = vaneStep(at, 1);
    expect(at).toBeCloseTo(1, 2);
  });

  it("falls away to calm the same way", () => {
    let at = 1;
    for (let i = 0; i < 60; i++) at = vaneStep(at, 0);
    expect(Math.abs(at)).toBeLessThan(0.01);
  });
});

describe("the wind arrow's streaks", () => {
  it("never stop entirely while there is air at all", () => {
    // A frozen meter and a becalmed one look identical, and only one of them
    // is telling the truth.
    expect(streakSpeed(0)).toBe(STREAK_MIN_SPEED);
    expect(streakSpeed(0)).toBeGreaterThan(0);
  });

  it("blow faster the harder the wind is", () => {
    expect(streakSpeed(0.5)).toBeGreaterThan(streakSpeed(0.1));
    expect(streakSpeed(1)).toBeCloseTo(STREAK_MAX_SPEED, 5);
    expect(streakSpeed(3)).toBeCloseTo(STREAK_MAX_SPEED, 5);
  });
});

describe("the wind vane's tremble", () => {
  it("is nothing at all below the shear line", () => {
    expect(vaneShake(0)).toBe(0);
    expect(vaneShake(SHAKE_FROM / 2)).toBe(0);
    expect(vaneShake(SHAKE_FROM)).toBe(0);
    expect(vaneShakePx(SHAKE_FROM)).toBe(0);
    expect(vaneShakeDeg(SHAKE_FROM)).toBe(0);
  });

  it("climbs from there to its cap at the worst the profile deals", () => {
    const mid = vaneShake((SHAKE_FROM + 1) / 2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(vaneShake(1)).toBeCloseTo(1, 5);
    expect(vaneShakePx(1)).toBeCloseTo(SHAKE_PX, 5);
    expect(vaneShakeDeg(1)).toBeCloseTo(SHAKE_SPIN_DEG, 5);
    // Monotonic, so a worsening layer always shakes harder than the one below.
    expect(vaneShake(0.9)).toBeGreaterThan(vaneShake(0.7));
  });

  it("ARRIVES rather than fading in, and then keeps getting worse", () => {
    // Two facts, and the ladder has to carry both: crossing the shear line is
    // a moment the player should be able to name, and a jet stream is much
    // worse than merely being in shear.
    const justPastShear = SHAKE_FROM + (1 - SHAKE_FROM) * 0.02;
    expect(vaneShake(justPastShear)).toBeGreaterThan(0.25);
    expect(vaneShakePx(justPastShear)).toBeGreaterThan(2.5);
    expect(vaneShake(0.95)).toBeGreaterThan(vaneShake(justPastShear) * 2);
  });

  it("stays inside its cap on a reading past the top of the ladder", () => {
    expect(vaneShakePx(3)).toBeCloseTo(SHAKE_PX, 5);
    expect(vaneShakeDeg(3)).toBeCloseTo(SHAKE_SPIN_DEG, 5);
  });
});
