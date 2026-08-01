// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE VEHICLES (config CAR / SHIP below) — the hero's car and his garage
// ship, simulated as small machines rather than drawn as props. See
// `Vehicle` (types/world.ts) for what they are; this module owns the numbers
// and the physics:
//
//   - the car's WHEELS roll from `speed` (angle = distance / wheel radius),
//     so the renderer picks a spin frame instead of animating on a timer —
//     a car pushed twice as fast spins twice as fast, for free;
//   - the car's SUSPENSION is two damped springs, one per axle, integrated
//     every tick. Parked they settle to rest; `nudgeCar` gives an axle a
//     shove (the minigame's potholes) and the body bobs the way a
//     thirty-year-old wagon should;
//   - the ship's ENGINE answers `thrust` — engine state, not an animation
//     flag, so the flying minigame throttles the same field the launch
//     will read.
//
// The MINIGAMES plug in here rather than beside it: throttle writes
// `speed`/`thrust`, crashes write `wear` and `nudgeCar`, climbing in writes
// `driver`. Nothing in this module reads the rng — a vehicle is
// deterministic clockwork, so it can never shift a loot roll however hard
// it is driven.
//
// A vehicle exists where the CARVE says one stands: `createVehicles` reads
// the level's landmarks (`car` → the car, `rocket` → the ship), keeps the
// landmark as the travel door's tap anchor, and the renderer draws the
// assembly in the landmark's place (pwa/src/game/render/vehicles.ts).

import type { Vec2 } from "@game/lib/vec.ts";

import type { LevelDef } from "./defs/levels/types.ts";
import type {
  CarVehicle,
  GameState,
  ShipVehicle,
  Vehicle,
} from "./types/index.ts";

export const CAR = {
  /** The panels the body is assembled from, rear to front — every panel
   * sprite shares one 48x26 canvas, so the renderer stacks them at a single
   * base anchor and any one can be swapped for a bashed variant alone. */
  panels: [
    "backside",
    "doors",
    "hood",
    "front_side",
    "bumper",
    "roof",
    "glass",
  ] as const,
  /** Wheel centers, world px from the body center: [rear, front] (the art
   * pins them at columns 10 and 36 of the 48-wide canvas). */
  wheelOffsets: [-14, 12],
  /** Wheel radius (world px) — converts speed into roll. */
  wheelRadius: 5,
  /** Spring rate (1/s²) and damping (1/s): under-damped on purpose, so a
   * nudge reads as a bob-and-settle rather than a dead thunk. */
  springK: 90,
  springDamping: 7,
  /** The axle's travel limit (px) — a spring never buries the body. */
  maxCompress: 3,
  /** The blockers under the body (create.ts): x offsets + radius. */
  footprint: { offsets: [-14, 0, 12], radius: 9 },
} as const;

export const SHIP = {
  /** One blocker under the hull — a rocket stands on its own pad. */
  footprint: { offsets: [0], radius: 10 },
} as const;

/** The landmark kinds that stand for a vehicle, and what each mints. */
const VEHICLE_LANDMARKS: Record<string, Vehicle["kind"]> = {
  car: "car",
  rocket: "ship",
};

function createCar(pos: Vec2): CarVehicle {
  return {
    kind: "car",
    pos: { x: pos.x, y: pos.y },
    faceLeft: false,
    speed: 0,
    wheelAngle: 0,
    suspension: [0, 0],
    suspensionVel: [0, 0],
    wear: 0,
    driver: null,
    // Factory straight, all round: the minigame's crashes move these.
    panels: {
      backside: 0,
      doors: 0,
      roof: 0,
      hood: 0,
      front_side: 0,
      bumper: 0,
      glass: 0,
    },
    wheelStates: [0, 0],
    doorState: 0,
  };
}

function createShip(pos: Vec2): ShipVehicle {
  return {
    kind: "ship",
    pos: { x: pos.x, y: pos.y },
    faceLeft: false,
    speed: 0,
    thrust: 0,
    wear: 0,
    driver: null,
  };
}

/** Mint the level's vehicles from its carved landmarks — parked, cold,
 * nobody driving. Empty on every map that pins none (all but the garage). */
export function createVehicles(
  def: Pick<LevelDef, "landmarks">,
): Vehicle[] {
  const vehicles: Vehicle[] = [];
  for (const mark of def.landmarks) {
    const kind = VEHICLE_LANDMARKS[mark.kind];
    if (kind === "car") vehicles.push(createCar(mark.pos));
    else if (kind === "ship") vehicles.push(createShip(mark.pos));
  }
  return vehicles;
}

/** The blockers a vehicle parks on `state.obstacles` (kind "vehicle" — the
 * obstacle pass skips them; the assembly is drawn by the vehicle renderer). */
export function vehicleFootprint(
  vehicle: Vehicle,
): { pos: Vec2; radius: number }[] {
  const print = vehicle.kind === "car" ? CAR.footprint : SHIP.footprint;
  return print.offsets.map((dx) => ({
    pos: { x: vehicle.pos.x + dx, y: vehicle.pos.y },
    radius: print.radius,
  }));
}

/** Shove a car's axle (rear, front — px/s downward). The springs answer. */
export function nudgeCar(car: CarVehicle, rear: number, front: number): void {
  car.suspensionVel[0] += rear;
  car.suspensionVel[1] += front;
}

/**
 * One tick of vehicle clockwork: roll the car's wheels from its speed and
 * settle its springs (semi-implicit Euler — stable at the fixed step, and
 * the clamp at the travel limits kills the velocity so the body never rings
 * against them). The ship needs no integration parked: `thrust` is state
 * the renderer reads, and the flying minigame will drive it directly.
 */
export function stepVehicles(state: GameState, dtMs: number): void {
  const dt = dtMs / 1000;
  for (const vehicle of state.vehicles) {
    if (vehicle.kind !== "car") continue;
    if (vehicle.speed !== 0) {
      const tau = Math.PI * 2;
      vehicle.wheelAngle =
        (((vehicle.wheelAngle + (vehicle.speed / CAR.wheelRadius) * dt) %
          tau) +
          tau) %
        tau;
    }
    for (let axle = 0; axle < 2; axle++) {
      const s = vehicle.suspension[axle] as number;
      const v = vehicle.suspensionVel[axle] as number;
      const accel = -CAR.springK * s - CAR.springDamping * v;
      let vel = v + accel * dt;
      let pos = s + vel * dt;
      if (pos < 0) {
        pos = 0;
        vel = Math.max(0, vel);
      } else if (pos > CAR.maxCompress) {
        pos = CAR.maxCompress;
        vel = Math.min(0, vel);
      }
      // Snap the tail of the wobble to dead rest, so a parked car's
      // snapshot deltas go quiet instead of carrying micro-motion forever.
      if (Math.abs(pos) < 0.01 && Math.abs(vel) < 0.01) {
        pos = 0;
        vel = 0;
      }
      vehicle.suspension[axle] = pos;
      vehicle.suspensionVel[axle] = vel;
    }
  }
}
