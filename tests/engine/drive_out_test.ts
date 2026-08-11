// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE DIM (engine/game/vehicles.ts `driveCar`/`stepDeparture`, config DEPARTURE):
// what happens between a driven car TOUCHING the level's ROAD OUT
// (`LevelDef.driveOut`) and the trip being booked.
//
// The rules under test, in the order they bite:
//   1. the ROAD OUTRANKS THE DOOR — crossing the open garage-door threshold
//      books nothing on a map that has tarmac beyond it, because a car in its
//      own driveway has not gone anywhere;
//   2. COMING UP ON the tarmac opens the HANDOVER rather than firing the
//      departure: the wheel leaves the player's hands and `carDeparted` is still
//      unfired. It opens a car's length or two SHORT of the road
//      (`DEPARTURE.dimFromPx`) because what it starts is a FADE — measured at
//      the kerb it left the wagon driving out onto the tarmac in full light for
//      the whole half-second the picture takes to go dark;
//   3. nothing DRIVES it — the beat is the screen going dark, so the car simply
//      coasts on with its controls released, and every run command is refused;
//   4. the trip books ONCE, at `DEPARTURE.durationMs`, carrying the car door's
//      own destination.
//
// The dim itself is the app's (an opacity written off `departure.ms`), so
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

/**
 * Drive east until the dim opens, and stop on that tick.
 *
 * A fixed tick count no longer reaches the road WITHOUT overrunning the beat on
 * the far side of it: the handover is a dim rather than a scene now
 * (`DEPARTURE.durationMs`), so the window between the latch and the trip
 * booking is well under a second. Every test below wants the state at the
 * moment it opens, so they all ask for that rather than for a number of ticks
 * that happened to land there.
 */
const driveToRoad = (state: GameState): string[] => {
  const departs: string[] = [];
  for (let i = 0; i < 400 && state.departure === null; i++) {
    departs.push(...driveEast(state, 1));
  }
  if (state.departure === null) throw new Error("never reached the road");
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

  it("opens the DIM coming up on the tarmac, and books nothing yet", () => {
    const state = startRoad();
    board(state);
    const departs = driveToRoad(state);
    // SHORT OF THE ROAD, BY THE DISTANCE THE FADE COSTS. The dim used to open
    // at the kerb, which is half a beat too late: the fade takes
    // `durationMs * fadeAt` and the wagon is doing `CAR.driveSpeed` under it, so
    // the last thing the player watched was his car driving a clear sixty px
    // OUT ONTO the road in full light. Begun that same distance earlier, the
    // screen is black on the frame the wheels reach the tarmac.
    expect(carOf(state).pos.x).toBeLessThan(1000);
    expect(carOf(state).pos.x).toBeGreaterThanOrEqual(
      1000 - DEPARTURE.dimFromPx,
    );
    expect(state.departure).not.toBeNull();
    expect(state.departure?.to).toBe("test_level_2");
    expect(state.departure?.booked).toBe(false);
    // The scene is younger than its own length, so nothing has been booked.
    expect(state.departure?.ms).toBeLessThan(DEPARTURE.durationMs);
    expect(departs).toEqual([]);
  });

  it("takes the wheel and asks the car for nothing: it coasts on, straight", () => {
    const state = startRoad();
    const car = board(state);
    driveToRoad(state);
    const was = { ...car.pos };
    const cruising = car.speed;
    // THE PLAYER'S THUMB IS OFF THE CAR — the beat refuses input — and so is
    // everything else's: the departing car is handed `COASTING`, which is the
    // same "nothing held" every other car in the game answers to. So it keeps
    // its speed (bar the idle drag), keeps its line, and just carries on down
    // the road while the picture goes dark over it.
    run(state, idle, 20);
    expect(car.speed).toBeGreaterThan(0);
    expect(car.speed).toBeLessThanOrEqual(cruising);
    expect(car.pos.x - was.x).toBeGreaterThan(20);
    expect(Math.abs(car.pos.y - was.y)).toBeLessThan(0.5);
  });

  it("refuses every run command while the beat plays", () => {
    const state = startRoad();
    board(state);
    driveToRoad(state);
    expect(applyRunCommand(state, "openInventory")).toBeUndefined();
    expect(state.players[0]?.screen).toBeUndefined();
  });

  it("books the trip ONCE, when the beat's clock runs out", () => {
    const state = startRoad();
    board(state);
    const departs = driveToRoad(state);
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
