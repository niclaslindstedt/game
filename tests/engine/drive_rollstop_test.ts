// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A VEHICLE THAT HAS GONE OVER STOPS — the rule that a car on its roof is a
// wreck in the road rather than a car still being driven, only sideways.
//
// WHAT THIS PINS AND WHY IT IS AN ENGINE SUITE. Nothing here names a level, a
// mob or an item: it is the drive's own sliding-body physics, staged on the
// fleet only because the fleet is what a `DriveTraffic` has to be built from.
// The claim is the shape of the deceleration rather than any particular number
// — a slide is COULOMB FRICTION and therefore reaches a DEAD STOP in finite
// time, where the viscous drag it used to run on alone could only ever
// approach one. A test written against "it is slower than it was" would go
// green on a drag of 1.7 and leave the two-tonne estate still creeping down the
// carriageway on its roof, which is the bug.

import { describe, expect, it } from "vitest";

import {
  createDrive,
  createTraffic,
  DRIVE,
  haltTraffic,
  roadEdges,
  skipDriveOpening,
  stepDrive,
  tipVehicle,
  vehicleDef,
  FLEET,
  type DriveParams,
  type DriveState,
  type DriveTraffic,
  type Impact,
} from "../../engine/game/drive/index.ts";

const PARAMS: DriveParams = {
  seed: 909,
  direction: 1,
  difficulty: "medium",
  to: "test_level",
  gib: true,
  split: true,
};

/** A road holding nothing but what a test plants on it, opened at the town. */
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

/** The index of a named vehicle in the fleet. */
function indexOf(id: string): number {
  const at = FLEET.findIndex((def) => def.id === id);
  if (at < 0) throw new Error(`no such vehicle: ${id}`);
  return at;
}

/**
 * Put a car on the road WELL clear of the bumper and hand it a speed.
 *
 * Far enough ahead that nothing in this file is ever a collision test: every
 * assertion below is about what a body already sliding does, and a hero who
 * caught up with it would be re-answering the question mid-measurement.
 */
function plant(state: DriveState, id: string, speed: number): DriveTraffic {
  const one = createTraffic(
    state.nextId++,
    indexOf(id),
    { x: state.car.pos.x + 420, y: state.car.pos.y },
    speed,
  );
  state.traffic.push(one);
  return one;
}

/** Roll the road on with nobody touching anything. */
function coast(state: DriveState, ms: number): void {
  for (let t = 0; t < ms; t += 16) stepDrive(state, 16, { pedal: 0, wheel: 0 });
}

/** One synthetic collision — enough of an `Impact` for the two verbs that read
 * one, with the lateral Δv a test wants and nothing else pretending to matter. */
function blow(lateralPx: number): Impact {
  return {
    speedLoss: 0,
    launch: { x: 0, y: 0 },
    dv: { x: 0, y: lateralPx },
    impulse: 0,
    liftZ: 0,
    joules: 0,
    contact: { x: 0, y: 0 },
    along: 0,
    squareness: 1,
    panel: "bumper",
    approach: 0,
    closingPx: 0,
  };
}

/** How far a body slid and how long it took, run out to a dead stop or a
 * timeout — the two numbers every claim in this file is about. */
function slide(
  state: DriveState,
  other: DriveTraffic,
  capMs = 6000,
): { ms: number; px: number } {
  const from = { x: other.pos.x, y: other.pos.y };
  for (let t = 0; t < capMs; t += 16) {
    coast(state, 16);
    if (other.speed === 0 && other.slew === 0 && other.z <= 0) {
      return {
        ms: t + 16,
        px: Math.hypot(other.pos.x - from.x, other.pos.y - from.y),
      };
    }
  }
  return {
    ms: capMs,
    px: Math.hypot(other.pos.x - from.x, other.pos.y - from.y),
  };
}

describe("a vehicle that has gone over", () => {
  it("pays for the roll out of its road speed", () => {
    // THE FIRST HALF OF THE BUG. Tipping used to be an attitude change and
    // nothing else — the slew, the spin and the lift were set and `speed` was
    // never touched — so a saloon doing 300 went onto its roof still doing 300.
    const state = road();
    const car = plant(state, "traffic_sedan", 300);
    tipVehicle(car, blow(400), state.car.pos.y);
    expect(car.downed).toBe(true);
    expect(Math.abs(car.speed)).toBeLessThan(300 * 0.8);
    // …and it is a SCRUB rather than a stop: what puts a car over is its wheels
    // digging in, not a wall, so it still arrives on its roof travelling.
    expect(Math.abs(car.speed)).toBeGreaterThan(0);
  });

  it("comes to a DEAD stop rather than approaching one", () => {
    // THE CLAIM THE WHOLE FILE IS FOR. Exponential drag has no last moment: it
    // takes a share of the speed every second forever, so the tail of every
    // slide was a wreck creeping down the road at walking pace. Sliding
    // friction is a constant deceleration and arrives at exactly zero.
    const state = road();
    const car = plant(state, "traffic_sedan", 300);
    tipVehicle(car, blow(400), state.car.pos.y);
    const rest = slide(state, car);
    expect(car.speed).toBe(0);
    expect(car.slew).toBe(0);
    expect(car.spin).toBe(0);
    expect(rest.ms).toBeLessThan(1600);
  });

  it("stops inside a couple of car lengths of where it went over", () => {
    // The number that reads as "it stopped" rather than "it drove off on its
    // roof". A saloon rolled at the top of the traffic's own pace used to slide
    // the better part of a phone screen (~420 CSS px at the reference viewport)
    // before it settled.
    const state = road();
    const car = plant(state, "traffic_sedan", 300);
    tipVehicle(car, blow(400), state.car.pos.y);
    const rest = slide(state, car);
    expect(rest.px).toBeLessThan(140);
  });

  it("scrubs a dropped two-wheeler the same way", () => {
    // A bicycle lying in the road is the same problem as an estate lying in the
    // road, and the fix is in the shared `downed` branch rather than in either
    // verb — so this is one assertion that the branch is genuinely shared.
    const state = road();
    const bike = plant(state, "traffic_bicycle", 240);
    bike.downed = true;
    const rest = slide(state, bike);
    expect(bike.speed).toBe(0);
    expect(rest.px).toBeLessThan(140);
  });

  it("slides in a straight line — the friction is on the travel, not the axes", () => {
    // Taking a fixed number off `speed` and off `slew` separately scrubs a
    // diagonal by half as much again as a straight one AND bends its path
    // toward whichever axis runs out first, which is a wreck that curves as it
    // stops. One deceleration along the direction of travel keeps the ratio.
    const state = road();
    const car = plant(state, "traffic_sedan", 200);
    car.downed = true;
    car.slew = 100;
    // On the ground from the first tick — a body in the air is not being
    // scrubbed by anything and would make this measurement about ballistics.
    car.z = 0;
    car.vz = 0;
    const was = car.speed / car.slew;
    coast(state, 160);
    expect(car.slew).not.toBe(0);
    expect(car.speed / car.slew).toBeCloseTo(was, 5);
  });

  it("arrives at the kerb rather than leaning on it", () => {
    // A slide that reaches the edge of the road has ARRIVED. It used to keep
    // half its lateral speed on every tick it spent against the edge, and while
    // it leant there the along-road half carried on unchecked — which is the
    // rolled car that grinds down the gutter for a screen and a half.
    const state = road();
    const car = plant(state, "traffic_sedan", 60);
    car.downed = true;
    car.z = 0;
    car.vz = 0;
    car.slew = 400;
    car.pos.y = roadEdges().bottom - 4;
    coast(state, 32);
    expect(car.pos.y).toBe(roadEdges().bottom);
    expect(car.slew).toBe(0);
  });

  it("holds a rolled car to the carriageway, and a dropped machine need not be", () => {
    // Unchanged by any of the above and worth keeping honest beside it: two
    // tonnes of estate is stopped by the kerb, a bicycle slides onto the
    // footway, and both of them stop.
    const state = road();
    const saloon = plant(state, "traffic_sedan", 0);
    saloon.downed = true;
    saloon.slew = 900;
    coast(state, 1200);
    expect(saloon.pos.y).toBeLessThanOrEqual(roadEdges().bottom);
    expect(saloon.slew).toBe(0);
    expect(vehicleDef(saloon.variant).class).not.toBe("open");
  });

  it("ends a WRECK's coast too, without taking the coast away", () => {
    // A car that has been finished but never went over is a different sight and
    // keeps it: it is on its wheels, freewheeling, and the long roll to a stop
    // in a live lane is the whole payoff of writing one off. What it did not
    // have was an END to that roll — the drag thinned the speed out for ever, so
    // the last stretch was a written-off car ambling along at a crawl.
    const state = road();
    const car = plant(state, "traffic_sedan", 300);
    car.wrecked = true;
    const from = car.pos.x;
    const rest = slide(state, car);
    expect(car.speed).toBe(0);
    // It still coasts a long way — further than anything that went over does.
    expect(rest.px).toBeGreaterThan(140);
    expect(car.pos.x - from).toBeGreaterThan(140);
    // …and it arrives, which is the whole of the change.
    expect(rest.ms).toBeLessThan(2600);
  });

  it("keeps the two knobs in the relationship the physics needs", () => {
    // A guard rather than a measurement: the friction is what makes a stop
    // FINITE, so a tuning pass that zeroed it would leave every assertion above
    // resting on the drag alone — which is exactly the state this file exists
    // to stop the road going back to.
    expect(DRIVE.traffic.downFrictionPx).toBeGreaterThan(0);
    expect(DRIVE.traffic.downSpeedKeep).toBeGreaterThan(0);
    expect(DRIVE.traffic.downSpeedKeep).toBeLessThan(1);
  });
});
