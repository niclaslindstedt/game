// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// TIME OF DAY — the curve the app maps its wall clock onto, and the one rule
// that decides whether a run reads it at all (`engine/game/daylight.ts`).
//
// It runs against FIXTURE levels, and the pair is the point: `test_sky_level`
// stands under a sky and `test_level` does not, so every assertion about the
// dark is made beside the assertion that the rest of the catalog is untouched
// by it. A venue that never opted in must be exactly as bright at midnight as
// it was before any of this existed.

import { describe, expect, it } from "vitest";

import {
  DAYLIGHT,
  createRunFromParams,
  daylightAtHour,
  nightAmount,
} from "@game/core";

import { startGame } from "./helpers.ts";

describe("the day's curve", () => {
  it("is flat daylight through the middle of the day", () => {
    expect(daylightAtHour(DAYLIGHT.dayFrom)).toBe(1);
    expect(daylightAtHour(12)).toBe(1);
    expect(daylightAtHour(DAYLIGHT.dayUntil)).toBe(1);
  });

  it("is fully dark from dusk's end to dawn's first light — over midnight", () => {
    expect(daylightAtHour(DAYLIGHT.nightFrom)).toBe(0);
    expect(daylightAtHour(23)).toBe(0);
    // The hour the story opens on, and the hour the wrap is most likely to be
    // got wrong: 00:30 is the deep of the night, not the middle of the day.
    expect(daylightAtHour(0.5)).toBe(0);
    expect(daylightAtHour(DAYLIGHT.nightUntil)).toBe(0);
  });

  it("ramps down through dusk and back up through dawn, without a step", () => {
    const dusk = (DAYLIGHT.dayUntil + DAYLIGHT.nightFrom) / 2;
    const dawn = (DAYLIGHT.nightUntil + DAYLIGHT.dayFrom) / 2;
    expect(daylightAtHour(dusk)).toBeCloseTo(0.5, 5);
    expect(daylightAtHour(dawn)).toBeCloseTo(0.5, 5);
    // Monotone across the evening: an hour later is never brighter.
    let last = 1;
    for (let h = DAYLIGHT.dayUntil; h <= DAYLIGHT.nightFrom; h += 0.25) {
      const light = daylightAtHour(h);
      expect(light).toBeLessThanOrEqual(last + 1e-9);
      last = light;
    }
  });

  it("wraps an hour past the end of the day rather than falling off it", () => {
    expect(daylightAtHour(25)).toBe(daylightAtHour(1));
    expect(daylightAtHour(-2)).toBe(daylightAtHour(22));
  });
});

describe("how dark a run is", () => {
  it("is broad daylight on a run nobody handed an hour to", () => {
    // Every headless simulation and every run built before this existed.
    expect(nightAmount(startGame(1, "test_sky_level"))).toBe(0);
  });

  it("follows the run's daylight on a venue that stands under a sky", () => {
    const state = startGame(1, "test_sky_level");
    state.daylight = 0;
    expect(nightAmount(state)).toBe(1);
    state.daylight = 0.25;
    expect(nightAmount(state)).toBeCloseTo(0.75, 5);
  });

  it("leaves a venue with no sky in full light, whatever the hour", () => {
    const state = startGame(1, "test_level");
    state.daylight = 0;
    expect(nightAmount(state)).toBe(0);
  });

  it("clamps a nonsense light level rather than trusting it", () => {
    const state = startGame(1, "test_sky_level");
    state.daylight = 4;
    expect(nightAmount(state)).toBe(0);
    state.daylight = -3;
    expect(nightAmount(state)).toBe(1);
  });
});

describe("the session parameter", () => {
  const params = (daylight: number | undefined) => ({
    seed: 7,
    levelId: "test_sky_level",
    difficulty: "medium",
    daylight,
  });

  it("carries the hour the app read onto the run", () => {
    const state = createRunFromParams(params(0.2));
    expect(state.daylight).toBeCloseTo(0.2, 5);
    expect(nightAmount(state)).toBeCloseTo(0.8, 5);
  });

  it("clamps a wire's claim into the day", () => {
    expect(createRunFromParams(params(9)).daylight).toBe(1);
    expect(createRunFromParams(params(-9)).daylight).toBe(0);
  });

  it("leaves an unparameterized run in daylight", () => {
    const state = createRunFromParams(params(undefined));
    expect(nightAmount(state)).toBe(0);
  });
});

describe("the lamps", () => {
  it("ride the level, so the renderer reads them off the run's own map", () => {
    const state = startGame(1, "test_sky_level");
    const lights = state.carvedLevel?.lights ?? [];
    expect(lights.length).toBe(2);
    expect(lights[0]?.radius).toBe(120);
    // The optional half is genuinely optional: a lamp may be nothing but a
    // place and a reach.
    expect(lights[0]?.color).toBeUndefined();
    expect(lights[1]?.flicker).toBe(0.3);
  });
});
