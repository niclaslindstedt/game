// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE VEHICLES — the car and the garage ship as machines (src/game/vehicles.ts):
// minted from their landmark kinds with solid footprints, wheels that roll
// from speed (never from a timer), suspension springs that answer a shove
// and settle to dead rest, and the wear/driver/thrust fields the driving
// and flying minigames will write. Deterministic clockwork: nothing here
// may touch the run's rng.

import { describe, expect, it } from "vitest";

import { rngState } from "@game/lib/rng.ts";
import {
  applyRunCommand,
  CAR,
  CAR_FIX,
  detachWheel,
  nudgeCar,
  shedPart,
  type CarVehicle,
} from "@game/core";
import { DT, idle, run, startGame, steerTo } from "./helpers.ts";

const startHub = () => startGame(42, "test_hub_level");

const carOf = (state: ReturnType<typeof startHub>): CarVehicle => {
  const car = state.vehicles.find((v) => v.kind === "car");
  if (!car || car.kind !== "car") throw new Error("no car minted");
  return car;
};

describe("minting", () => {
  it("stands a car and a ship where their landmarks are pinned", () => {
    const state = startHub();
    expect(state.vehicles.map((v) => v.kind).sort()).toEqual(["car", "ship"]);
    const car = carOf(state);
    const ship = state.vehicles.find((v) => v.kind === "ship")!;
    expect(car.pos).toEqual({ x: 700, y: 500 });
    expect(ship.pos).toEqual({ x: 1100, y: 300 });
    // Parked, cold, empty: no speed, no wear, no thrust, nobody driving.
    expect(car.speed).toBe(0);
    expect(car.wear).toBe(0);
    expect(car.driver).toBeNull();
    expect(ship.kind === "ship" && ship.thrust).toBe(0);
  });

  it("parks solid footprints — collision-only blockers, the car's hoppable", () => {
    const state = startHub();
    const prints = state.obstacles.filter((o) => o.kind === "vehicle");
    // Three circles under the car (a 48px body needs its middle held), one
    // under the ship.
    expect(prints).toHaveLength(4);
    const carPrints = prints.filter((o) => o.pos.y === 500);
    expect(carPrints).toHaveLength(3);
    for (const p of carPrints) expect(p.jumpable).toBe(true);
    const shipPrint = prints.find((o) => o.pos.y === 300)!;
    expect(shipPrint.jumpable).toBe(false);
  });

  it("mints none on a level whose carve pins no vehicle landmark", () => {
    const state = startGame();
    expect(state.vehicles).toEqual([]);
  });
});

describe("the suspension", () => {
  it("answers a shove with a bob and settles back to dead rest", () => {
    const state = startHub();
    const car = carOf(state);
    nudgeCar(car, 40, 40);
    run(state, idle, 6); // 100 ms — mid-bob
    expect(Math.max(...car.suspension)).toBeGreaterThan(0);
    run(state, idle, 180); // three seconds — the springs must be done
    expect(car.suspension).toEqual([0, 0]);
    expect(car.suspensionVel).toEqual([0, 0]);
  });

  it("never buries the body past the travel limit", () => {
    const state = startHub();
    const car = carOf(state);
    nudgeCar(car, 10_000, 10_000);
    for (let i = 0; i < 120; i++) {
      run(state, idle, 1);
      expect(Math.max(...car.suspension)).toBeLessThanOrEqual(CAR.maxCompress);
    }
  });
});

describe("the wheels", () => {
  it("roll from speed — distance over wheel radius, not a timer", () => {
    const state = startHub();
    const car = carOf(state);
    run(state, idle, 60);
    expect(car.wheelAngle).toBe(0); // parked wheels never creep
    car.speed = CAR.wheelRadius * Math.PI; // half a turn per second
    const ticks = 60;
    run(state, idle, ticks);
    // Exactly what the clockwork owes: speed / radius × simulated time.
    expect(car.wheelAngle).toBeCloseTo(
      ((Math.PI * (ticks * DT)) / 1000) % (Math.PI * 2),
      5,
    );
  });
});

describe("the fix ladder", () => {
  it("mints every part bolted down, nothing dangling, no debris", () => {
    const state = startHub();
    const car = carOf(state);
    expect(car.fixes).toEqual({ doors: 0, hood: 0, bumper: 0, roof: 0 });
    expect(car.dangle).toEqual({ doors: 0, hood: 0, bumper: 0, roof: 0 });
    expect(state.wheelDebris).toEqual([]);
  });

  it("rattles a LOOSE part only a tad on a bump — the clamp holds", () => {
    const state = startHub();
    const car = carOf(state);
    car.fixes.hood = CAR_FIX.loose;
    nudgeCar(car, 200, 200);
    let peak = 0;
    for (let i = 0; i < 120; i++) {
      run(state, idle, 1);
      peak = Math.max(peak, Math.abs(car.dangle.hood));
    }
    expect(peak).toBeGreaterThan(0); // it moved…
    expect(peak).toBeLessThanOrEqual(CAR.looseSwing); // …but only a tad
    run(state, idle, 400); // and settles back to dead rest
    expect(car.dangle.hood).toBe(0);
  });

  it("swings a DANGLING part through the full arc, wider than loose", () => {
    const state = startHub();
    const car = carOf(state);
    car.fixes.doors = CAR_FIX.dangling;
    nudgeCar(car, 400, 400);
    let peak = 0;
    for (let i = 0; i < 120; i++) {
      run(state, idle, 1);
      peak = Math.max(peak, Math.abs(car.dangle.doors));
    }
    expect(peak).toBeGreaterThan(CAR.looseSwing);
    expect(peak).toBeLessThanOrEqual(CAR.dangleSwing);
  });

  it("shedPart tears the part off and lays it on the floor as decor", () => {
    const state = startHub();
    const car = carOf(state);
    const before = state.decor.length;
    shedPart(state, car, "hood");
    expect(car.fixes.hood).toBe(CAR_FIX.gone);
    expect(state.decor).toHaveLength(before + 1);
    const shed = state.decor[state.decor.length - 1]!;
    expect(shed.sprite).toBe("car_shed_hood");
    // Idempotent: a part already gone sheds nothing twice.
    shedPart(state, car, "hood");
    expect(state.decor).toHaveLength(before + 1);
  });
});

describe("a wheel coming off", () => {
  it("bounces like a wheel dropped on a highway, then settles", () => {
    const state = startHub();
    const car = carOf(state);
    detachWheel(state, car, 1, { x: 60, y: 0 });
    expect(car.wheelStates[1]).toBe(3);
    // The axle slams onto the bump stop and stays there.
    expect(car.suspension[1]).toBe(CAR.maxCompress);
    const wheel = state.wheelDebris[0]!;
    expect(wheel.z).toBeGreaterThan(0);
    const start = wheel.pos.x;
    // Ride the bounce: it must leave the ground at least once more…
    let airborne = false;
    for (let i = 0; i < 400 && !wheel.settled; i++) {
      run(state, idle, 1);
      if (wheel.z > 0.5 && i > 10) airborne = true;
    }
    // …then come to rest, ahead of where it left, and stay put.
    expect(airborne).toBe(true);
    expect(wheel.settled).toBe(true);
    expect(wheel.z).toBe(0);
    expect(wheel.vel).toEqual({ x: 0, y: 0 });
    expect(wheel.pos.x).toBeGreaterThan(start);
    // Detaching again is refused — there is no second wheel on that axle.
    detachWheel(state, car, 1, { x: 60, y: 0 });
    expect(state.wheelDebris).toHaveLength(1);
  });
});

describe("the drive-out", () => {
  it("boards on enterCar only when the hero stands AT the car", () => {
    const state = startHub();
    const car = carOf(state);
    const hero = state.players[0]!;
    hero.pos = { x: car.pos.x - 200, y: car.pos.y };
    expect(applyRunCommand(state, "enterCar")).toBe(false);
    hero.pos = { x: car.pos.x - 30, y: car.pos.y };
    state.events = [];
    expect(applyRunCommand(state, "enterCar")).toBe(true);
    expect(car.driver).toBe(0);
    // The engine turned over…
    expect(state.events.some((e) => e.type === "carStarted")).toBe(true);
    // …and the car's parked footprint came off the field (the nav grid is
    // told): only the ship's blocker remains.
    expect(state.obstacles.filter((o) => o.kind === "vehicle")).toHaveLength(1);
  });

  it("idles with an engine rumble whose cadence carries the throttle", () => {
    const state = startHub();
    const car = carOf(state);
    state.players[0]!.pos = { x: car.pos.x - 30, y: car.pos.y };
    applyRunCommand(state, "enterCar");
    const grains: number[] = [];
    for (let i = 0; i < 60; i++) {
      run(state, idle, 1);
      for (const e of state.events) {
        if (e.type === "carEngine") grains.push(e.intensity);
      }
    }
    expect(grains.length).toBeGreaterThan(2); // it putters on a cadence
    for (const g of grains) expect(g).toBe(0); // parked = idle intensity
  });

  it("steers with the held pointer and books ONE departure past the latch", () => {
    const state = startHub();
    const car = carOf(state);
    state.players[0]!.pos = { x: car.pos.x - 30, y: car.pos.y };
    applyRunCommand(state, "enterCar");
    const departs: string[] = [];
    const drive = steerTo(car.pos.x + 600, car.pos.y);
    for (let i = 0; i < 300; i++) {
      run(state, drive, 1);
      for (const e of state.events) {
        if (e.type === "carDeparted") departs.push(e.to);
      }
    }
    // The car moved, the hero rode along, the trip was booked exactly once.
    expect(car.pos.x).toBeGreaterThan(car.home.x + CAR.departDistance);
    expect(state.players[0]!.pos.x).toBe(car.pos.x);
    expect(departs).toEqual(["test_level_2"]);
    expect(car.speed).toBeGreaterThan(0);
    expect(car.wheelAngle).toBeGreaterThan(0); // the wheels rolled the trip
  });
});

describe("determinism", () => {
  it("spends no rng — bumps, sheds, lost wheels and the drive included", () => {
    const state = startHub();
    const car = carOf(state);
    const before = rngState(state.rng);
    nudgeCar(car, 25, 10);
    car.fixes.doors = CAR_FIX.dangling;
    shedPart(state, car, "bumper");
    detachWheel(state, car, 0, { x: -50, y: 20 });
    state.players[0]!.pos = { x: car.pos.x - 30, y: car.pos.y };
    applyRunCommand(state, "enterCar");
    run(state, steerTo(car.pos.x + 400, car.pos.y), 120);
    expect(rngState(state.rng)).toBe(before);
  });
});
