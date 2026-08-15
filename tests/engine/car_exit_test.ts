// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE VENUE WHOSE WAY OUT IS THE CAR (`LevelDef.exitByCar` — GOODCO's staff
// lot, and here its synthetic twin `test_car_exit_level`).
//
// The venue ends like every other one — objective, loot window, `victory`, the
// LEVEL CLEAR splash — and what it authors is what MOVING ON then does: the
// picture cuts to the lot, the hero walks the last paces to his own wagon, gets
// in, and the road picks him up (`engine/game/boarding.ts`). So the rules under
// test are the ones a player would notice going wrong: the splash must actually
// appear, the win must bank on the same tick it always did, the wagon must not
// be tappable at any other moment, the walk must ALWAYS end with him in the
// car, and where the night goes must be the level the player chose rather than
// the far end of the road.
//
// Plus the condition the wagon carries between all of that: `readCarDamage` /
// `applyCarDamage`, which is how one car survives four objects that each hold
// it for a minute.

import { beforeAll, describe, expect, it } from "vitest";

import {
  applyCarDamage,
  applyRunCommand,
  BOARDING,
  CAR,
  CAR_FIX,
  carIsWayOut,
  DEPARTURE,
  readCarDamage,
  registerDefs,
  reopenVictoryChoice,
  RUN,
  step,
  type CarVehicle,
  type GameState,
} from "@game/core";

import { idle, run, startGame } from "./helpers.ts";

// The one line these fixtures speak. Registered HERE rather than in
// `installFixtures`, because `registerDefs` replaces the whole thought catalog
// (the cap-farm rotation with it) — see the note on `FIX_CAR_EXIT_LEVEL`.
beforeAll(() => {
  registerDefs({
    thoughts: {
      test_back_to_car: {
        id: "test_back_to_car",
        speaker: "{HERO}",
        portrait: "hero",
        pages: [["TEST — I NEED TO GET BACK TO MY CAR."]],
      },
    },
  });
});

const startLot = () => startGame(42, "test_car_exit_level");

const carOf = (state: GameState): CarVehicle => {
  const car = state.vehicles.find((v) => v.kind === "car");
  if (!car || car.kind !== "car") throw new Error("no car minted");
  return car;
};

/** Clear the objective: take the parked boss off the board and let step notice. */
function winObjective(state: GameState): void {
  state.enemies = [];
  step(state, idle, 16);
}

/** …and burn the loot-grab window down, which is when the splash lands. */
function winAndSettle(state: GameState): void {
  winObjective(state);
  run(state, idle, Math.ceil(RUN.victoryDelayMs / 16) + 2);
}

/** Every tick the beat can possibly take, plus a margin. */
const BEAT_TICKS = Math.ceil(BOARDING.giveUpMs / 16) + 4;

/**
 * Press NEXT LEVEL, bound for `to`, and read his line — which is raised on the
 * spot and holds the run until it is tapped through, so nothing below moves
 * until this has.
 */
function moveOn(state: GameState, to = "test_level_2"): boolean {
  const took = applyRunCommand(state, "departByCar", [to], state.players[0]);
  state.dialogue = null;
  state.phase = "playing";
  return took === true;
}

/** …and let the beat play out, stopping the moment he is in the car. */
function walkToTheCar(state: GameState): void {
  for (let i = 0; i < BEAT_TICKS && state.boarding; i++) step(state, idle, 16);
}

describe("clearing an exitByCar venue", () => {
  it("raises the LEVEL CLEAR splash like anywhere else", () => {
    const state = startLot();
    winAndSettle(state);
    expect(state.phase).toBe("victory");
  });

  it("still fires the victory event, which is what banks the clear", () => {
    const state = startLot();
    winObjective(state);
    let won = false;
    for (let i = 0; i < Math.ceil(RUN.victoryDelayMs / 16) + 2; i++) {
      step(state, idle, 16);
      if (state.events.some((e) => e.type === "victory")) won = true;
    }
    expect(won).toBe(true);
  });

  it("says where he is going the moment the player commits", () => {
    const state = startLot();
    winAndSettle(state);
    applyRunCommand(state, "departByCar", ["test_level_2"], state.players[0]);
    expect(state.dialogue?.source).toEqual({
      kind: "playerThought",
      defId: "test_back_to_car",
    });
    // …and it HOLDS the beat: the words are read over the room he is still
    // standing in, and the cut waits for the tap.
    run(state, idle, 30);
    expect(state.boarding?.ms).toBe(0);
  });
});

describe("the car as a door", () => {
  it("is nobody's to tap — not during the mission, not after it", () => {
    const state = startLot();
    expect(carIsWayOut(state)).toBe(false);
    winAndSettle(state);
    expect(carIsWayOut(state)).toBe(false);
  });

  it("cannot be boarded by hand at any point", () => {
    const state = startLot();
    const car = carOf(state);
    state.players[0].pos = { x: car.pos.x, y: car.pos.y };
    expect(applyRunCommand(state, "enterCar", [], state.players[0])).toBe(
      false,
    );
    winAndSettle(state);
    state.phase = "playing";
    expect(applyRunCommand(state, "enterCar", [], state.players[0])).toBe(
      false,
    );
    expect(car.driver).toBeNull();
  });

  it("opens for exactly the length of the walk, so the mark shows the way", () => {
    const state = startLot();
    winAndSettle(state);
    moveOn(state);
    expect(carIsWayOut(state)).toBe(true);
  });

  it("a hub's car is always the way out", () => {
    const state = startGame(42, "test_hub_level");
    expect(carIsWayOut(state)).toBe(true);
  });
});

describe("moving on walks him to the wagon", () => {
  it("cuts to the lot and puts him within a short walk of it", () => {
    const state = startLot();
    winAndSettle(state);
    const car = carOf(state);
    const before = { ...state.players[0].pos };
    expect(moveOn(state)).toBe(true);
    // The cut has not happened yet: the picture is still going dark on the
    // room he is standing in.
    expect(state.players[0].pos).toEqual(before);
    run(state, idle, Math.ceil(BOARDING.cutMs / 16) + 2);
    const d = Math.hypot(
      state.players[0].pos.x - car.pos.x,
      state.players[0].pos.y - car.pos.y,
    );
    expect(d).toBeLessThanOrEqual(BOARDING.standOffPx + 1);
    expect(d).toBeGreaterThan(CAR.boardRadius);
  });

  it("ends with him in the car, every time", () => {
    const state = startLot();
    winAndSettle(state);
    moveOn(state);
    walkToTheCar(state);
    expect(state.boarding).toBeNull();
    expect(carOf(state).driver).toBe(0);
  });

  it("gets him in even with the walk blocked, rather than stranding the run", () => {
    const state = startLot();
    winAndSettle(state);
    moveOn(state);
    run(
      state,
      idle,
      Math.ceil((BOARDING.cutMs + BOARDING.holdMs + BOARDING.liftMs) / 16) + 2,
    );
    // Something holds him where he stands for the rest of the beat — the case
    // `giveUpMs` exists for. He still leaves.
    const stuck = { ...state.players[0].pos };
    for (let i = 0; i < BEAT_TICKS; i++) {
      state.players[0].pos.x = stuck.x;
      state.players[0].pos.y = stuck.y;
      step(state, idle, 16);
      if (state.boarding === null) break;
    }
    expect(carOf(state).driver).toBe(0);
  });

  it("refuses on a venue that leaves any other way", () => {
    const state = startGame(42, "test_hub_level");
    expect(moveOn(state)).toBe(false);
    expect(state.boarding).toBeNull();
  });

  it("refuses while the boss is still standing", () => {
    // The verb books a trip to a named level, so it is only ever the splash's
    // button — a run that has not won one cannot press it off the wire either.
    const state = startLot();
    expect(moveOn(state)).toBe(false);
    expect(state.boarding).toBeNull();
    expect(state.staying).toBe(false);
  });

  it("does not raise the splash back over its own beat", () => {
    const state = startLot();
    winAndSettle(state);
    state.bossCorpse = { pos: { x: 100, y: 100 }, sprite: "test_boss" };
    moveOn(state);
    expect(reopenVictoryChoice(state)).toBe(false);
    expect(state.phase).toBe("playing");
  });
});

describe("boarding IS the departure", () => {
  it("books the dim on the seat rather than on a lap of the car park", () => {
    const state = startLot();
    winAndSettle(state);
    const car = carOf(state);
    moveOn(state);
    walkToTheCar(state);
    expect(car.departed).toBe(true);
    expect(state.departure).not.toBeNull();
    // …and it pulls away under the dim rather than standing still through it,
    // gently enough that it can never run anybody over on the way past.
    // Close to, not equal: the tick that boarded it has already shed a frame
    // of handbrake-off drag by the time the beat clears.
    expect(car.speed).toBeCloseTo(CAR.pullAwayPx, 0);
    expect(CAR.pullAwayPx).toBeLessThan(CAR.roadkillSpeed);
  });

  it("books WHERE THE PLAYER CHOSE, not the far end of the road", () => {
    // The `car` travel door names the wagon's own road (`test_level_2`); the
    // campaign's next venue is a different question, and it is the one the
    // trip is booked to.
    const state = startLot();
    winAndSettle(state);
    moveOn(state, "test_level_3");
    walkToTheCar(state);
    expect(state.departure?.to).toBe("test_level_3");
  });

  it("hands the trip over when the dim runs out", () => {
    const state = startLot();
    winAndSettle(state);
    moveOn(state);
    let to: string | null = null;
    const ticks = BEAT_TICKS + Math.ceil(DEPARTURE.durationMs / 16) + 2;
    for (let i = 0; i < ticks; i++) {
      step(state, idle, 16);
      for (const event of state.events) {
        if (event.type === "carDeparted") to = event.to;
      }
    }
    expect(to).toBe("test_level_2");
  });

  it("leaves a hub's car alone — that one is DRIVEN out", () => {
    const state = startGame(42, "test_hub_level");
    const car = carOf(state);
    state.players[0].pos = { x: car.pos.x, y: car.pos.y };
    expect(applyRunCommand(state, "enterCar", [], state.players[0])).toBe(true);
    expect(car.departed).toBe(false);
    expect(state.departure).toBeNull();
  });
});

describe("the wagon's condition (CarDamage)", () => {
  it("round-trips through read and apply", () => {
    const state = startGame(42, "test_hub_level");
    const car = carOf(state);
    car.panels.bumper = 3;
    car.panels.hood = 2;
    car.wheelStates = [1, 3];
    car.fixes.doors = CAR_FIX.dangling;
    car.wear = 7;
    const damage = readCarDamage(car);

    const fresh = startGame(42, "test_hub_level");
    const twin = carOf(fresh);
    applyCarDamage(twin, damage);
    expect(twin.panels).toEqual(car.panels);
    expect(twin.wheelStates).toEqual(car.wheelStates);
    expect(twin.fixes).toEqual(car.fixes);
    expect(twin.wear).toBe(7);
    // The corner with no wheel under it sits on the bump stop, exactly where
    // `detachWheel` leaves it — a body drawn level on a missing axle is the
    // damage silently not being there.
    expect(twin.suspension[1]).toBe(CAR.maxCompress);
  });

  it("is a snapshot, not a view — the source car may move on", () => {
    const state = startGame(42, "test_hub_level");
    const car = carOf(state);
    const damage = readCarDamage(car);
    car.panels.bumper = 3;
    expect(damage.panels.bumper).toBe(0);
  });

  it("clamps a rung nothing has a sprite for, and ignores what it is not given", () => {
    const state = startGame(42, "test_hub_level");
    const car = carOf(state);
    car.wear = 4;
    applyCarDamage(car, {
      panels: { bumper: 99 },
      wheelStates: [-3, 1.6],
      fixes: {},
      wear: -1,
    } as unknown as ReturnType<typeof readCarDamage>);
    expect(car.panels.bumper).toBe(3);
    expect(car.panels.hood).toBe(0);
    expect(car.wheelStates).toEqual([0, 2]);
    expect(car.wear).toBe(0);
  });
});
