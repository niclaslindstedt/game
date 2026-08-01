// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE DRIVE-OUT (src/game/vehicles.ts `driveCar`/`stepDeparture`, config
// DEPARTURE): what happens between a driven car reaching the level's ROAD OUT
// (`LevelDef.driveOut`) and the trip being booked.
//
// The rules under test, in the order they bite:
//   1. the ROAD OUTRANKS THE DOOR — crossing the open garage-door threshold
//      books nothing on a map that has tarmac beyond it, because a car in its
//      own driveway has not gone anywhere;
//   2. reaching the tarmac opens a SCENE rather than firing the departure: the
//      wheel leaves the player's hands and `carDeparted` is still unfired;
//   3. the scene DRIVES — the car keeps going, down the road, whatever the
//      player's thumb says, and every run command is refused for the beat;
//   4. the trip books ONCE, at `DEPARTURE.durationMs`, carrying the car door's
//      own destination.
//
// The fade itself is the app's (an opacity written off `departure.ms`), so
// nothing here asserts a colour — only the clock the app reads.

import { describe, expect, it } from "vitest";

import {
  applyRunCommand,
  CAR,
  DEPARTURE,
  type CarVehicle,
  type GameState,
} from "@game/core";
import { idle, run, startGame, steerTo } from "./helpers.ts";

const startRoad = () => startGame(42, "test_road_level");

const carOf = (state: GameState): CarVehicle => {
  const car = state.vehicles.find((v) => v.kind === "car");
  if (!car || car.kind !== "car") throw new Error("no car minted");
  return car;
};

const board = (state: GameState): CarVehicle => {
  const car = carOf(state);
  state.players[0]!.pos = { x: car.pos.x - 30, y: car.pos.y };
  applyRunCommand(state, "enterCar");
  return car;
};

/** Drive east (through the door, on toward the road) for `ticks`, collecting
 * every departure the run books on the way. */
const driveEast = (state: GameState, ticks: number): string[] => {
  const car = carOf(state);
  const departs: string[] = [];
  const east = steerTo(car.pos.x + 2000, car.pos.y);
  for (let i = 0; i < ticks; i++) {
    run(state, east, 1);
    for (const e of state.events) {
      if (e.type === "carDeparted") departs.push(e.to);
    }
  }
  return departs;
};

describe("the road out", () => {
  it("outranks the garage door — the threshold books nothing", () => {
    const state = startRoad();
    const car = board(state);
    const door = state.doors[0];
    if (!door) throw new Error("no garage door hung");
    // Far enough to be well past the doorway, nowhere near the tarmac at 1000.
    const departs = driveEast(state, 120);
    expect(door.open).toBe(true);
    expect(car.pos.x).toBeGreaterThan(door.center.x + CAR.departRadius);
    expect(car.pos.x).toBeLessThan(1000);
    expect(departs).toEqual([]);
    expect(state.departure).toBeNull();
  });

  it("opens the DEPARTURE scene on the tarmac, and books nothing yet", () => {
    const state = startRoad();
    board(state);
    const departs = driveEast(state, 260);
    expect(carOf(state).pos.x).toBeGreaterThanOrEqual(1000);
    expect(state.departure).not.toBeNull();
    expect(state.departure?.to).toBe("test_level_2");
    expect(state.departure?.booked).toBe(false);
    // The scene is younger than its own length, so nothing has been booked.
    expect(state.departure?.ms).toBeLessThan(DEPARTURE.durationMs);
    expect(departs).toEqual([]);
  });

  it("takes the wheel: the car keeps driving with every control released", () => {
    const state = startRoad();
    const car = board(state);
    driveEast(state, 260);
    expect(state.departure).not.toBeNull();
    const was = { ...car.pos };
    // Hands off. A car under the player's control coasts to a stop from here
    // (the garage-door suite proves that); a departing one does not. Measured
    // as DISTANCE rather than as x: by now the nose is coming round onto the
    // road's own axis, so the car is leaving on a curve.
    run(state, idle, 20);
    expect(car.speed).toBeGreaterThan(0);
    expect(Math.hypot(car.pos.x - was.x, car.pos.y - was.y)).toBeGreaterThan(
      20,
    );
  });

  it("refuses every run command while the beat plays", () => {
    const state = startRoad();
    board(state);
    driveEast(state, 260);
    expect(state.departure).not.toBeNull();
    expect(applyRunCommand(state, "openInventory")).toBeUndefined();
    expect(state.players[0]?.screen).toBeUndefined();
  });

  it("books the trip ONCE, when the beat's clock runs out", () => {
    const state = startRoad();
    board(state);
    const departs = driveEast(state, 260);
    expect(departs).toEqual([]);
    // Long enough to overrun the beat several times over: the latch, not the
    // tick count, is what makes this one event.
    departs.push(...driveEast(state, 400));
    expect(departs).toEqual(["test_level_2"]);
    expect(state.departure?.booked).toBe(true);
    expect(state.departure?.ms).toBeGreaterThanOrEqual(DEPARTURE.durationMs);
  });
});

describe("a map with no road out", () => {
  it("keeps the garage door's own threshold, and cuts with no scene", () => {
    const state = startGame(42, "test_garage_level");
    board(state);
    const departs = driveEast(state, 240);
    expect(departs).toEqual(["test_level_2"]);
    expect(state.departure).toBeNull();
  });
});
