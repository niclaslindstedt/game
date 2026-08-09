// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CLOUD A CRASHED CAR SITS IN (pwa/src/game/drive-screen/wreck-smoke.ts).
//
// IT IS AT THE ROOT rather than under `tests/engine/` or `tests/content/`,
// beside `drive_restart_test.ts` and for the same reason: this is the APP's
// answer to a road, not an engine rule and not a claim about the shipped
// catalogs. What it pins is the handful of facts that break silently and cannot
// be seen in a screenshot —
//
//   THE CLOUD IS WHERE THE WRECK IS. The whole bug this replaces was an effect
//   anchored to a place rather than to a thing (the hero's own bonnet, in the
//   case of `driveBreakdown`), and a puff issued at the wrong x is invisible in
//   a still: it just looks like some smoke somewhere.
//   IT KEEPS ISSUING WHILE THE THING SLIDES and does not stop when the event
//   that started it is drained.
//   IT IS BOUNDED — in count, and in the bookkeeping it keeps per vehicle. Both
//   are leaks that only show up on a road full of wrecks at the end of a leg.

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
  clearDriveFx,
  type DriveFxState,
} from "../pwa/src/game/drive-screen/drive-fx.ts";
import { stepWreckSmoke } from "../pwa/src/game/drive-screen/wreck-smoke.ts";

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

/** One vehicle well clear of the bumper — nothing here is a collision test. */
function plant(state: DriveState, id: string, speed = 0): DriveTraffic {
  const one = createTraffic(
    state.nextId++,
    FLEET.findIndex((def) => def.id === id),
    { x: state.car.pos.x + 380, y: state.car.pos.y },
    speed,
  );
  state.traffic.push(one);
  return one;
}

/** Tick the road AND the emitter together, the way `drainDrive` does. */
function run(state: DriveState, fx: DriveFxState, ms: number): void {
  for (let t = 0; t < ms; t += 16) {
    stepDrive(state, 16, { pedal: 0, wheel: 0 });
    stepWreckSmoke(fx, state);
  }
}

/** Every dust cloud currently standing. */
function dust(fx: DriveFxState): { x: number; y: number }[] {
  return fx.fx
    .filter((one) => one.kind === "dust")
    .map((one) => ({ x: one.x, y: one.y }));
}

describe("a wreck's own cloud", () => {
  it("raises one the moment a vehicle goes down", () => {
    const state = road();
    const fx = createDriveFx();
    const car = plant(state, "traffic_sedan");
    expect(dust(fx)).toHaveLength(0);
    car.downed = true;
    stepWreckSmoke(fx, state);
    expect(dust(fx)).toHaveLength(1);
    // …centred on the vehicle, which is the whole of "it surrounds it".
    expect(dust(fx)[0]?.x).toBe(car.pos.x);
    expect(dust(fx)[0]?.y).toBe(car.pos.y);
  });

  it("follows it down the road while it is still sliding", () => {
    // A CLOUD IS NOT AN INSTANT. Fired once off the `trafficRolled` event it
    // stands over the spot the roll STARTED and the wreck slides out from under
    // it — which is exactly what the hero's own breakdown smoke needed
    // `DriveFx.follow` to fix, and what this walk fixes for everybody else.
    const state = road();
    const fx = createDriveFx();
    const car = plant(state, "traffic_sedan", 320);
    car.downed = true;
    const from = car.pos.x;
    run(state, fx, 400);
    expect(car.pos.x).toBeGreaterThan(from + 20);
    // The trail covers the ground it actually went over, front to back — the
    // first cloud within a tick's travel of where it started, the last one out
    // at the far end of the slide.
    const xs = dust(fx).map((one) => one.x);
    expect(Math.min(...xs)).toBeLessThan(from + 12);
    expect(Math.max(...xs)).toBeGreaterThan(from + 20);
    expect(Math.max(...xs)).toBeCloseTo(car.pos.x, 0);
  });

  it("piles up around it once it has stopped", () => {
    // THE SIGHT THE WHOLE CHANGE IS FOR: the wreck is at rest, and what is
    // standing over it is a pall rather than a trail. Every cloud raised after
    // the slide ends is raised at the SAME spot, so they stack.
    const state = road();
    const fx = createDriveFx();
    const car = plant(state, "traffic_sedan", 320);
    car.downed = true;
    run(state, fx, 2000);
    expect(car.speed).toBe(0);
    const rest = car.pos.x;
    clearDriveFx(fx);
    run(state, fx, 900);
    const xs = dust(fx).map((one) => one.x);
    expect(xs.length).toBeGreaterThan(1);
    for (const x of xs) expect(x).toBe(rest);
  });

  it("hands a bigger vehicle a bigger cloud, off the fleet's own extent", () => {
    // No new authoring: the spread is `halfLengthPx`, which is in the def
    // because the COLLISION needed it first.
    const state = road();
    const fx = createDriveFx();
    const bus = plant(state, "traffic_bus");
    bus.downed = true;
    stepWreckSmoke(fx, state);
    const wide = fx.fx.find((one) => one.kind === "dust")?.spread ?? 0;
    clearDriveFx(fx);
    const other = road();
    const bike = plant(other, "traffic_bicycle");
    bike.downed = true;
    stepWreckSmoke(fx, other);
    const thin = fx.fx.find((one) => one.kind === "dust")?.spread ?? 0;
    expect(wide).toBeGreaterThan(thin * 2);
  });

  it("smokes a wrecked car that never went over, where the car is", () => {
    // THE BUG THIS REPLACES, STATED AS AN ASSERTION. `trafficWrecked` used to
    // be answered with `driveBreakdown`, whose column is pinned to the HERO's
    // wagon — so a car the player finished lit a plume over his own bonnet and
    // left the wreck sitting in the road perfectly clean.
    const state = road();
    const fx = createDriveFx();
    const car = plant(state, "traffic_sedan");
    car.wrecked = true;
    run(state, fx, 200);
    const smoke = fx.fx.filter((one) => one.kind === "smoke");
    expect(smoke.length).toBeGreaterThan(0);
    for (const one of smoke) {
      expect(one.x).toBe(car.pos.x);
      expect(one.follow).toBeFalsy();
    }
  });

  it("forgets a vehicle the road has forgotten", () => {
    // A map keyed on traffic ids that were never removed grows for the whole
    // leg — and an id the spawner reuses would inherit a dead wreck's clock and
    // go quiet.
    const state = road();
    const fx = createDriveFx();
    const car = plant(state, "traffic_sedan");
    car.downed = true;
    stepWreckSmoke(fx, state);
    expect(fx.wrecks.size).toBe(1);
    state.traffic.length = 0;
    stepWreckSmoke(fx, state);
    expect(fx.wrecks.size).toBe(0);
  });

  it("holds the cloud count down however many wrecks the road is holding", () => {
    // The one effect on this road that is ISSUED rather than thrown, so the one
    // that needs a ceiling: a hero who has just ploughed a lane of traffic has
    // five wrecks each laying a billow every few frames.
    const state = road();
    const fx = createDriveFx();
    for (let i = 0; i < 8; i++) {
      const one = plant(state, "traffic_sedan", 300);
      one.pos.x += i * 30;
      one.downed = true;
    }
    run(state, fx, 3000);
    expect(dust(fx).length).toBeLessThanOrEqual(30);
  });

  it("is thrown away with everything else when the leg restarts", () => {
    // The bookkeeping lives on the fx state precisely so that a restart clears
    // it in the same breath as the effects — a wreck's clock surviving into a
    // fresh leg is a new leg's first crash going quiet.
    const state = road();
    const fx = createDriveFx();
    const car = plant(state, "traffic_sedan");
    car.downed = true;
    stepWreckSmoke(fx, state);
    expect(fx.wrecks.size).toBe(1);
    clearDriveFx(fx);
    expect(fx.wrecks.size).toBe(0);
    expect(dust(fx)).toHaveLength(0);
  });
});
