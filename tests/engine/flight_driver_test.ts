// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE FLIGHT'S AUTO-PILOT (engine/game/rocket/driver.ts) — the proof the bot
// can PLAY this minigame: whole trips flown to the regolith, across seeds and
// rungs, plus the two disciplines that make it a pilot rather than a lucky
// integrator (it keeps the corridor, and it replays).
//
// An ENGINE suite: a flight has no level and no catalog under it at all.

import { describe, expect, it } from "vitest";

import {
  FLIGHT,
  FLIGHT_OUTCOME,
  beginDescent,
  createFlight,
  createFlightDriver,
  flightDriverInput,
  flightOffCourse,
  restartFlight,
  stepFlight,
  type FlightParams,
  type FlightState,
} from "../../engine/game/rocket/index.ts";

const STEP = 16;
/** Ten minutes of sim — far beyond any honest trip, so a hang is a fail
 * rather than a wait. */
const MAX_TICKS = 37_500;

function params(seed: number, difficulty = "medium"): FlightParams {
  return {
    seed,
    difficulty: difficulty as FlightParams["difficulty"],
    to: "moon",
  };
}

/** Fly a whole trip — climb, orbit beat, drop, touchdown — restarting each
 * wrecked half the way the screen does, and report how it went. */
function flyTrip(p: FlightParams): {
  state: FlightState;
  wrecks: number;
  worstOffCourse: number;
} {
  let state = createFlight(p);
  const driver = createFlightDriver();
  let wrecks = 0;
  let worstOffCourse = 0;
  for (let i = 0; i < MAX_TICKS; i++) {
    stepFlight(state, STEP, flightDriverInput(driver, state));
    worstOffCourse = Math.max(worstOffCourse, flightOffCourse(state));
    if (state.outcome === FLIGHT_OUTCOME.landed) break;
    if (
      state.outcome === FLIGHT_OUTCOME.toOrbit &&
      state.outcomeMs >= FLIGHT.orbitHoldMs
    ) {
      beginDescent(state);
    } else if (
      state.outcome === FLIGHT_OUTCOME.wrecked &&
      state.outcomeMs >= FLIGHT.wreckHoldMs
    ) {
      wrecks++;
      state = restartFlight(state);
    }
  }
  return { state, wrecks, worstOffCourse };
}

describe("the flight auto-pilot", () => {
  it("flies whole trips to the regolith across seeds", () => {
    for (const seed of [1, 4242, 977]) {
      const trip = flyTrip(params(seed));
      expect(trip.state.outcome).toBe(FLIGHT_OUTCOME.landed);
      // A pilot, not a crash-looper: the odd wreck is honest flying on a
      // thick sky; needing several per trip is not.
      expect(trip.wrecks).toBeLessThanOrEqual(2);
      expect(trip.state.touchdownVy).toBeLessThanOrEqual(
        FLIGHT.landing.safeVyPx,
      );
    }
  });

  it("keeps the launch corridor instead of drifting into traffic", () => {
    const trip = flyTrip(params(4242));
    // Brushing the ramp's edge is flying; living fully off course is not.
    expect(trip.worstOffCourse).toBeLessThan(0.6);
  });

  it("survives the hardest rung's sky", () => {
    const trip = flyTrip(params(31, "jesus"));
    expect(trip.state.outcome).toBe(FLIGHT_OUTCOME.landed);
  });

  it("flies the attract loop's short sky without a wreck", () => {
    const trip = flyTrip({ ...params(7), coursePx: FLIGHT.attractCoursePx });
    expect(trip.state.outcome).toBe(FLIGHT_OUTCOME.landed);
    expect(trip.wrecks).toBe(0);
  });

  it("replays: the same seed flown twice is the same flight", () => {
    const a = createFlight(params(99));
    const b = createFlight(params(99));
    const da = createFlightDriver();
    const db = createFlightDriver();
    for (let i = 0; i < 2400; i++) {
      stepFlight(a, STEP, flightDriverInput(da, a));
      stepFlight(b, STEP, flightDriverInput(db, b));
    }
    expect(a.craft).toEqual(b.craft);
    expect(a.field).toEqual(b.field);
  });

  it("never touches either of the sky's streams", () => {
    const flown = createFlight(params(55));
    const idle = createFlight(params(55));
    const driver = createFlightDriver();
    for (let i = 0; i < 600; i++) {
      flightDriverInput(driver, flown);
    }
    // Only reads happened: the un-flown twin's next draws match exactly.
    expect(flown.rng()).toBe(idle.rng());
    expect(flown.trafficRng()).toBe(idle.trafficRng());
  });
});
