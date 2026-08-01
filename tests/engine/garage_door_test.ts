// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE GARAGE DOOR and the car that drives through it (src/game/vehicles.ts,
// story.ts stepDoors/openDoor): an APPROACH door opens for anybody near — on
// foot or at the wheel — with no key; opening drops its obstacle chain, tells
// the nav grid (`obstaclesVersion`), and fires `garageDoorOpened`; and on a
// map that hangs one AND HAS NO ROAD OUT, the driven car's departure books at
// the OPEN door's threshold, never by radial distance. (A venue WITH a road —
// the shipped garage — books on the tarmac instead, and books it as a scene:
// see `drive_out_test.ts`.) Plus the car's own physics: a nose and
// a signed speed — W throttles, S backs up, A/D only turn a rolling car —
// and a body that collides instead of phasing through the shut door. The
// `revealed` flag rides the same fixture: the garage knows no fog.

import { describe, expect, it } from "vitest";

import { applyRunCommand, CAR, type CarVehicle } from "@game/core";
import { idle, run, startGame, steerTo } from "./helpers.ts";

const startGarage = () => startGame(42, "test_garage_level");

const carOf = (state: ReturnType<typeof startGarage>): CarVehicle => {
  const car = state.vehicles.find((v) => v.kind === "car");
  if (!car || car.kind !== "car") throw new Error("no car minted");
  return car;
};

const doorOf = (state: ReturnType<typeof startGarage>) => {
  const door = state.doors.find((d) => d.id === "test_garage_door");
  if (!door) throw new Error("no garage door hung");
  return door;
};

const board = (state: ReturnType<typeof startGarage>) => {
  const car = carOf(state);
  state.players[0]!.pos = { x: car.pos.x - 30, y: car.pos.y };
  applyRunCommand(state, "enterCar");
  return car;
};

describe("the approach door", () => {
  it("hangs shut as an obstacle chain wearing its own sprite", () => {
    const state = startGarage();
    const door = doorOf(state);
    expect(door.open).toBe(false);
    expect(door.approach).toBe(true);
    const chain = state.obstacles.filter((o) => o.kind === "test_garage_door");
    expect(chain.length).toBeGreaterThan(2);
  });

  it("opens for a hero on foot — chain gone, nav told, roll-up announced", () => {
    const state = startGarage();
    const door = doorOf(state);
    const version = state.obstaclesVersion;
    state.players[0]!.pos = { x: door.center.x - 30, y: door.center.y };
    state.events = [];
    run(state, idle, 1);
    expect(door.open).toBe(true);
    expect(state.obstacles.some((o) => o.kind === "test_garage_door")).toBe(
      false,
    );
    expect(state.obstaclesVersion).toBeGreaterThan(version);
    expect(state.events.some((e) => e.type === "garageDoorOpened")).toBe(true);
  });

  it("keeps the parked car's nose pointed at it", () => {
    const state = startGarage();
    const car = carOf(state);
    // Car at (700,500), door center (800,500): dead east = heading ~0.
    expect(Math.abs(car.heading)).toBeLessThan(0.01);
    expect(car.faceLeft).toBe(false);
  });
});

describe("car physics", () => {
  it("a wall is a wall — the body shoves out instead of phasing through", () => {
    const state = startGarage();
    const car = board(state);
    const wallX = car.pos.x + 70;
    // A fresh array on purpose: the obstacle grid memoizes on identity.
    state.obstacles = [
      ...state.obstacles,
      {
        id: 99999,
        kind: "wall",
        sprite: "test_wall",
        pos: { x: wallX, y: car.pos.y },
        radius: 10,
        jumpable: false,
      },
    ];
    state.obstaclesVersion++;
    run(state, steerTo(car.pos.x + 600, car.pos.y), 90);
    // Held off the wall by its radius plus the body's own — never past it.
    expect(car.pos.x).toBeLessThan(wallX);
    expect(car.pos.x).toBeGreaterThan(car.home.x);
  });

  it("backs up on a target behind the trunk — capped at reverse speed", () => {
    const state = startGarage();
    const car = board(state);
    run(state, steerTo(car.pos.x - 600, car.pos.y), 90);
    expect(car.speed).toBeLessThan(0);
    expect(car.speed).toBeGreaterThanOrEqual(-CAR.reverseSpeed);
    expect(car.pos.x).toBeLessThan(car.home.x);
    // Backing up never flips the art — the nose still points east.
    expect(car.faceLeft).toBe(false);
  });

  it("a parked car cannot pivot on the spot — abeam input does nothing", () => {
    const state = startGarage();
    const car = board(state);
    const heading = car.heading;
    // Target dead abeam (north of an east-facing nose): pure steering, and
    // the wheel has no authority at zero speed.
    run(state, steerTo(car.pos.x, car.pos.y - 300), 60);
    expect(car.speed).toBe(0);
    expect(car.pos).toEqual(car.home);
    expect(car.heading).toBeCloseTo(heading, 5);
  });

  it("a rolling car carves toward an off-bow target", () => {
    const state = startGarage();
    const car = board(state);
    // Ahead-and-up: inside the forward arc, so it throttles AND turns.
    run(state, steerTo(car.pos.x + 400, car.pos.y - 400), 45);
    expect(car.speed).toBeGreaterThan(0);
    expect(car.heading).toBeLessThan(0); // nose swung up-screen
    expect(car.pos.y).toBeLessThan(car.home.y);
  });

  it("coasts to a stop when every control is released", () => {
    const state = startGarage();
    const car = board(state);
    run(state, steerTo(car.pos.x + 200, car.pos.y), 20);
    expect(car.speed).toBeGreaterThan(0);
    run(state, idle, 90);
    expect(car.speed).toBe(0);
  });
});

describe("the drive-out through the door", () => {
  it("books the trip at the OPEN door's threshold, exactly once", () => {
    const state = startGarage();
    board(state);
    const door = doorOf(state);
    const departs: string[] = [];
    const drive = steerTo(door.center.x + 400, door.center.y);
    for (let i = 0; i < 240; i++) {
      run(state, drive, 1);
      for (const e of state.events) {
        if (e.type === "carDeparted") departs.push(e.to);
      }
    }
    expect(door.open).toBe(true);
    expect(departs).toEqual(["test_level_2"]);
  });

  it("never departs on radial distance while the garage door stands", () => {
    const state = startGarage();
    const car = board(state);
    const departs: string[] = [];
    // Drive WEST, away from the door — well past the old departDistance.
    const drive = steerTo(car.pos.x - 600, car.pos.y);
    for (let i = 0; i < 240; i++) {
      run(state, drive, 1);
      for (const e of state.events) {
        if (e.type === "carDeparted") departs.push(e.to);
      }
    }
    expect(
      Math.hypot(car.pos.x - car.home.x, car.pos.y - car.home.y),
    ).toBeGreaterThan(CAR.departDistance);
    expect(departs).toEqual([]);
  });
});

describe("the revealed floor", () => {
  it("opens with the whole map explored — no fog, ever", () => {
    const state = startGarage();
    expect(state.explored.every((cell) => cell === 1)).toBe(true);
  });

  it("the reference level still opens under fog", () => {
    const state = startGame();
    expect(state.explored.some((cell) => cell === 0)).toBe(true);
  });
});
