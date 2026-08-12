// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT A DRIVEN CAR'S BODY CAN GET INTO (engine/game/vehicles.ts
// `collideCarBody`, obstacles.ts `resolveObstacleBox`) and WHEN THE DOORWAY IS
// ACTUALLY A DOORWAY (story.ts `openDoor`/`stepDoors`, `DoorState.rollingMs`).
//
// Both are about the same three metres of the game — the bay's roll-up — and
// both used to be answered by something adjacent to the truth. The body was a
// chain of DISCS, which holds a 48-px wagon's ends and flanks to within a pixel
// and rounds its four corners off by a whole radius, so a car driven at the
// jamb at any angle but dead square parked with the painted bonnet inside the
// stone. And the door dropped its chain the instant the opener fired, half a
// second before the slats had finished getting out of the way, so the wagon
// drove out through a door that was still a third of the way down.
//
// The rule both tests hold to is the same one: NOTHING THE PLAYER IS SHOWN MAY
// BE INSIDE ANYTHING ELSE THE PLAYER IS SHOWN.

import { describe, expect, it } from "vitest";

import {
  applyRunCommand,
  CAR,
  DOORS,
  type CarVehicle,
  type GameState,
} from "@game/core";

import { run, startGame, steerTo } from "./helpers.ts";

const startJambs = () => startGame(42, "test_jamb_level");

const carOf = (state: GameState): CarVehicle => {
  const car = state.vehicles.find((v) => v.kind === "car");
  if (!car || car.kind !== "car") throw new Error("no car minted");
  return car;
};

const doorOf = (state: GameState) => {
  const door = state.doors.find((d) => d.id === "test_garage_door");
  if (!door) throw new Error("no garage door hung");
  return door;
};

/** Climb in the way the tap does — the parked blockers come off with it, or the
 * body collides with its own furniture. */
const board = (state: GameState): CarVehicle => {
  const car = carOf(state);
  state.players[0]!.pos = { x: car.pos.x - 30, y: car.pos.y };
  applyRunCommand(state, "enterCar");
  return car;
};

/** The rectangle the picture covers, in world px — the same hull the collision
 * claims (`CAR.hull`), at the shipped square-on camera. */
const drawnBox = (car: CarVehicle) => ({
  x0: car.pos.x - CAR.hull.length / 2,
  x1: car.pos.x + CAR.hull.length / 2,
  y0: car.pos.y - CAR.hull.depth / 2,
  y1: car.pos.y + CAR.hull.depth / 2,
});

/** How deep the drawn body is inside the worst wall stone it touches (world px,
 * 0 when it is clear of every one of them). */
function deepestInWall(state: GameState, car: CarVehicle): number {
  const body = drawnBox(car);
  let worst = 0;
  for (const stone of state.obstacles) {
    if (stone.kind !== "test_wall") continue;
    const ox =
      Math.min(body.x1, stone.pos.x + stone.radius) -
      Math.max(body.x0, stone.pos.x - stone.radius);
    const oy =
      Math.min(body.y1, stone.pos.y + stone.radius) -
      Math.max(body.y0, stone.pos.y - stone.radius);
    if (ox > 0 && oy > 0) worst = Math.max(worst, Math.min(ox, oy));
  }
  return worst;
}

describe("the hull a driven car is solved as", () => {
  it("is the rectangle its picture covers", () => {
    // Same body, said twice: the hull is the smallest rectangle holding the
    // discs the parked car blocks the floor with, so nothing jumps when a
    // driver gets out. (`CAR.footprint` spans ±24 at radius 9.)
    const discs = CAR.footprint;
    const span =
      Math.max(...discs.offsets) -
      Math.min(...discs.offsets) +
      discs.radius * 2;
    expect(CAR.hull.length).toBe(span);
    expect(CAR.hull.depth).toBe(discs.radius * 2);
  });

  // THE PRESS THAT USED TO BURY IT: aimed past a jamb's LAST stone at a shallow
  // angle, which is a corner meeting a corner. Straight on, a chain of discs is
  // as good as a box — the stones overlap into a flat band and the nose stops on
  // it. It is the diagonal that tells them apart, and the diagonal is what a
  // wheel held over on the way out of a bay actually does.
  const pressIntoJamb = (fromY: number, toY: number) => {
    const state = startJambs();
    const car = carOf(state);
    car.pos.y = fromY;
    const boarded = board(state);
    // Let the roll-up finish first: a door still in the air holds the bumper at
    // the threshold, which is a different rule and would hide this one.
    run(
      state,
      steerTo(car.pos.x, car.pos.y),
      Math.ceil(DOORS.rollUpMs / 16) + 4,
    );
    run(state, steerTo(doorOf(state).center.x + 600, toY), 400);
    return { state, car: boarded };
  };

  it("keeps the painted body out of the north jamb's last stone", () => {
    const { state, car } = pressIntoJamb(410, 470);
    expect(deepestInWall(state, car)).toBe(0);
  });

  it("keeps it out of the south jamb's first stone", () => {
    const { state, car } = pressIntoJamb(590, 530);
    expect(deepestInWall(state, car)).toBe(0);
  });

  it("still fits through the opening it is flanked by", () => {
    // The corner the hull now holds must not have cost the wagon its way out:
    // driven straight at the threshold it still gets through.
    const state = startJambs();
    const car = board(state);
    const door = doorOf(state);
    run(state, steerTo(door.center.x + 600, door.center.y), 300);
    expect(car.pos.x).toBeGreaterThan(door.center.x + CAR.hull.length / 2);
    expect(deepestInWall(state, car)).toBe(0);
  });
});

describe("the opener", () => {
  it("goes with the key — boarding rolls the door up", () => {
    const state = startJambs();
    const door = doorOf(state);
    expect(door.open).toBe(false);
    // The fixture parks the car at (700,500) and hangs the door at (800,500),
    // inside a real opener's range.
    expect(
      Math.hypot(carOf(state).pos.x - door.center.x, 0),
    ).toBeLessThanOrEqual(CAR.doorReach);
    board(state);
    expect(door.open).toBe(true);
    expect(door.rollingMs).toBe(DOORS.rollUpMs);
  });

  it("counts the chain's travel down and then stops mentioning it", () => {
    const state = startJambs();
    board(state);
    const door = doorOf(state);
    run(state, steerTo(0, 0), Math.ceil(DOORS.rollUpMs / 16) + 8);
    expect(door.rollingMs).toBeUndefined();
  });
});

describe("a roll-up that is still rolling", () => {
  it("holds the bumper at the threshold until the slats are up", () => {
    const state = startJambs();
    const car = board(state);
    const door = doorOf(state);
    // Half the travel spent: the hole is still half full of door.
    door.rollingMs = DOORS.rollUpMs;
    const drive = steerTo(door.center.x + 600, door.center.y);
    // Long enough to have crossed twice over at the bay's top end, and short of
    // the travel the chain still has to do.
    const ticks = Math.floor(DOORS.rollUpMs / 16) - 2;
    run(state, drive, ticks);
    expect(door.rollingMs).toBeGreaterThan(0);
    expect(car.pos.x + CAR.hull.length / 2).toBeLessThanOrEqual(
      door.center.x + 0.001,
    );
  });

  it("lets it through the moment they are", () => {
    const state = startJambs();
    const car = board(state);
    const door = doorOf(state);
    door.rollingMs = DOORS.rollUpMs;
    const drive = steerTo(door.center.x + 600, door.center.y);
    run(state, drive, 300);
    expect(door.rollingMs).toBeUndefined();
    expect(car.pos.x).toBeGreaterThan(door.center.x + CAR.hull.length / 2);
  });
});
