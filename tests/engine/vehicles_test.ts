// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE VEHICLES — the car and the garage ship as machines (src/game/vehicles.ts):
// minted from their landmark kinds with solid footprints, wheels that roll
// from speed (never from a timer), suspension springs that answer a shove
// and settle to dead rest, and the wear/driver/thrust fields the driving
// and flying minigames will write. Deterministic clockwork: nothing here
// may touch the run's rng.

import { describe, expect, it } from "vitest";

import { rngState } from "@game/lib/rng.ts";
import { CAR, nudgeCar, type CarVehicle } from "@game/core";
import { DT, idle, run, startGame } from "./helpers.ts";

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
      expect(Math.max(...car.suspension)).toBeLessThanOrEqual(
        CAR.maxCompress,
      );
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

describe("determinism", () => {
  it("spends no rng — a parked fleet leaves every roll where it was", () => {
    const state = startHub();
    const before = rngState(state.rng);
    nudgeCar(carOf(state), 25, 10);
    run(state, idle, 120);
    expect(rngState(state.rng)).toBe(before);
  });
});
