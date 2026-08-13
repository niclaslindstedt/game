// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A CAR ALIGHT, AND WHERE THE FIRE ACTUALLY IS
// (pwa/src/game/drive-screen/burning.ts).
//
// IT IS AT THE ROOT beside `drive_wreck_smoke_test.ts` and for the same reason:
// this is the APP's answer to a road, not an engine rule and not a claim about
// the shipped catalogs. What it pins is the one fact about a burn that breaks
// silently — a fire is real, it is lit, it is the right size, and it is on the
// wrong piece of tarmac. Nothing in a screenshot of a moving car says so, and
// the burn is the one effect out here that goes on happening for the rest of
// the leg, so a fire an inch behind its car is an inch behind it for a minute.
//
// THE MODE IS NOT WHAT IS BEING TESTED. A burn is issued identically in both
// (`driveVehicleFire`, one call, one cadence); which KIND comes out is
// `sfw_mode_test.ts`'s question, and everything below holds for the flame and
// for the star fountain alike.

import { describe, expect, it } from "vitest";

import {
  createDrive,
  createTraffic,
  FLEET,
  haltTraffic,
  skipDriveOpening,
  stepDrive,
  type DriveParams,
  type DriveState,
  type DriveTraffic,
} from "@game/core";

import {
  createDriveFx,
  type DriveFxState,
} from "../pwa/src/game/drive-screen/drive-fx.ts";
import { stepBurning } from "../pwa/src/game/drive-screen/burning.ts";

const PARAMS: DriveParams = {
  seed: 606,
  direction: 1,
  difficulty: "medium",
  to: "test_level",
  gib: true,
  split: true,
};

function road(): DriveState {
  const built = createDrive(PARAMS);
  skipDriveOpening(built);
  haltTraffic(built);
  built.traffic.length = 0;
  built.pedestrians.length = 0;
  built.props.length = 0;
  built.remains.length = 0;
  built.car.speed = 0;
  return built;
}

/** One vehicle well clear of the bumper, already alight. Nothing here is a
 * collision test — how a car catches is the sim's business. */
function alight(state: DriveState, speed = 0): DriveTraffic {
  const one = createTraffic(
    state.nextId++,
    FLEET.findIndex((def) => def.id === "traffic_sedan"),
    { x: state.car.pos.x + 200, y: state.car.pos.y },
    speed,
  );
  one.fire = 0.6;
  // …and the ceiling the sim would have set when it caught. A fresh vehicle's
  // is zero, and the burn is clamped to it every tick — so a staged fire with
  // no cap is out again before the next step.
  one.fireCap = 1;
  state.traffic.push(one);
  return one;
}

/** Tick the road AND the emitter together, the way `drainDrive` does. */
function run(state: DriveState, fx: DriveFxState, ms: number): void {
  for (let t = 0; t < ms; t += 16) {
    stepDrive(state, 16, { pedal: 0, wheel: 0 });
    stepBurning(fx, state);
  }
}

/** Every burn currently in the air, whichever material it is made of. */
function burns(fx: DriveFxState): DriveFxState["fx"] {
  return fx.fx.filter((one) => one.kind === "fire" || one.kind === "starfire");
}

describe("a burning car", () => {
  it("lights one at the vehicle, on the bonnet rather than the tarmac", () => {
    const state = road();
    const fx = createDriveFx();
    const car = alight(state);
    stepBurning(fx, state);
    expect(burns(fx)).toHaveLength(1);
    expect(burns(fx)[0]?.x).toBe(car.pos.x);
    expect(burns(fx)[0]?.y).toBe(car.pos.y);
    expect(burns(fx)[0]?.lift ?? 0).toBeGreaterThan(0);
  });

  it("carries every issue with the car between issues, not just at one", () => {
    // THE BUG THIS FILE EXISTS FOR. The cadence puts a fire where the car WAS,
    // and one issue deliberately outlives the cadence so consecutive ones
    // overlap into a continuous burn — so a fire that is only ever placed at
    // the issue trails its own car by everything it travels in a fifth of a
    // second, which at road speed is more than a car's length.
    const state = road();
    const fx = createDriveFx();
    const car = alight(state, 420);
    run(state, fx, 600);
    expect(car.pos.x).toBeGreaterThan(state.car.pos.x + 200);
    // EVERY burn in the air is on the car, not merely the newest one.
    expect(burns(fx).length).toBeGreaterThan(1);
    for (const burn of burns(fx)) expect(burn.x).toBeCloseTo(car.pos.x, 0);
  });

  it("goes up with a wreck that has been thrown into the air", () => {
    // A launched car is drawn `z` px above the point the physics holds it at
    // (`wreck-draw.ts`), so a fire seated at that point is a fire on the road
    // with a burning car flying over it.
    const state = road();
    const fx = createDriveFx();
    const car = alight(state);
    stepBurning(fx, state);
    const grounded = burns(fx)[0]?.lift ?? 0;
    car.z = 40;
    stepBurning(fx, state);
    for (const burn of burns(fx)) {
      expect(burn.lift ?? 0).toBeCloseTo(grounded + 40, 5);
    }
  });

  it("turns the fire with a body that has been turned over", () => {
    // The burn is spread ALONG the car — three tongues, or a fountain's worth
    // of grains — and that line is the car's, so a wreck standing on its nose
    // burns nose to tail rather than kerb to kerb.
    const state = road();
    const fx = createDriveFx();
    const car = alight(state);
    car.angle = Math.PI / 2;
    stepBurning(fx, state);
    expect(burns(fx)[0]?.angle).toBeCloseTo(Math.PI / 2, 5);
    car.angle = -0.8;
    stepBurning(fx, state);
    for (const burn of burns(fx)) expect(burn.angle).toBeCloseTo(-0.8, 5);
  });

  it("leaves a burn where it was once its car is off the road entirely", () => {
    // A vehicle the road has forgotten keeps its last seat and expires there,
    // which is the honest answer: it is off the back of the world.
    const state = road();
    const fx = createDriveFx();
    const car = alight(state);
    stepBurning(fx, state);
    const at = burns(fx)[0]?.x;
    state.traffic.length = 0;
    stepBurning(fx, state);
    expect(burns(fx)[0]?.x).toBe(at);
    expect(car.pos.x).toBe(at);
  });
});
