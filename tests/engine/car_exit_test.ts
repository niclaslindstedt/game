// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE VENUE WHOSE WAY OUT IS THE CAR (`LevelDef.exitByCar` — GOODCO's staff
// lot, and here its synthetic twin `test_car_exit_level`).
//
// Four rules, and every one of them is a thing a player would notice going
// wrong: the boss falling must not raise a LEVEL CLEAR splash, it must still
// BANK the win (the `victory` event is what the app hangs the whole clear on),
// the wagon must be shut until then and open afterwards, and boarding it must
// be the departure rather than the start of a drive around a car park.
//
// Plus the condition the wagon carries between all of that: `readCarDamage` /
// `applyCarDamage`, which is how one car survives four objects that each hold
// it for a minute.

import { beforeAll, describe, expect, it } from "vitest";

import {
  applyCarDamage,
  applyRunCommand,
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

import { createBot } from "@game/core";

import { exitCar, hubTapCommand } from "../../engine/game/bot/hub.ts";
import { macroTarget } from "../../engine/game/bot/macro.ts";
import { botTuningFor } from "../../engine/game/bot/state.ts";
import { clearStage, idle, run, startGame } from "./helpers.ts";

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

/** …and burn the loot-grab window down, which is when the beat lands. */
function winAndSettle(state: GameState): void {
  winObjective(state);
  run(state, idle, Math.ceil(RUN.victoryDelayMs / 16) + 2);
}

/** Stand the hero at the wagon, which is what `enterCar` measures. */
function walkToCar(state: GameState): CarVehicle {
  const car = carOf(state);
  state.players[0].pos = { x: car.pos.x, y: car.pos.y };
  return car;
}

describe("clearing an exitByCar venue", () => {
  it("never reaches the victory phase — the field is left live", () => {
    const state = startLot();
    winAndSettle(state);
    // A dialogue box is up (his line), and behind it the run is still PLAYING.
    // What matters is what it is NOT: `victory`, and `outro` on the way to it.
    expect(state.phase).not.toBe("victory");
    expect(state.phase).not.toBe("outro");
    expect(state.staying).toBe(true);
    expect(state.victoryCountdownMs).toBeNull();
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

  it("says where to go", () => {
    const state = startLot();
    winAndSettle(state);
    expect(state.dialogue?.source).toEqual({
      kind: "playerThought",
      defId: "test_back_to_car",
    });
  });

  it("refuses to conjure the splash off the boss corpse", () => {
    const state = startLot();
    winAndSettle(state);
    // Whatever `staying` normally licenses, it does not license this: there is
    // no LEVEL CLEAR menu on this venue to re-open.
    state.bossCorpse = { pos: { x: 100, y: 100 }, sprite: "test_boss" };
    state.dialogue = null;
    state.phase = "playing";
    expect(reopenVictoryChoice(state)).toBe(false);
    expect(state.phase).toBe("playing");
  });

  it("does not re-arm the countdown once the win is banked", () => {
    const state = startLot();
    winAndSettle(state);
    run(state, idle, 60);
    expect(state.victoryCountdownMs).toBeNull();
    expect(state.phase).not.toBe("victory");
  });
});

describe("the car as a door", () => {
  it("is shut for the whole mission and opens when the venue is over", () => {
    const state = startLot();
    expect(carIsWayOut(state)).toBe(false);
    winAndSettle(state);
    expect(carIsWayOut(state)).toBe(true);
  });

  it("cannot be boarded before the objective clears", () => {
    const state = startLot();
    walkToCar(state);
    expect(applyRunCommand(state, "enterCar", [], state.players[0])).toBe(
      false,
    );
    expect(carOf(state).driver).toBeNull();
  });

  it("a hub's car is always the way out", () => {
    const state = startGame(42, "test_hub_level");
    expect(carIsWayOut(state)).toBe(true);
  });
});

describe("boarding IS the departure", () => {
  it("books the dim on the seat rather than on a lap of the car park", () => {
    const state = startLot();
    winAndSettle(state);
    state.dialogue = null;
    state.phase = "playing";
    const car = walkToCar(state);
    expect(applyRunCommand(state, "enterCar", [], state.players[0])).toBe(true);
    expect(car.departed).toBe(true);
    expect(state.departure).not.toBeNull();
    expect(state.departure?.to).toBe("test_level_2");
    // …and it pulls away under the dim rather than standing still through it,
    // gently enough that it can never run anybody over on the way past.
    expect(car.speed).toBe(CAR.pullAwayPx);
    expect(CAR.pullAwayPx).toBeLessThan(CAR.roadkillSpeed);
  });

  it("hands the trip over when the dim runs out", () => {
    const state = startLot();
    winAndSettle(state);
    state.dialogue = null;
    state.phase = "playing";
    walkToCar(state);
    applyRunCommand(state, "enterCar", [], state.players[0]);
    let to: string | null = null;
    for (let i = 0; i < Math.ceil(DEPARTURE.durationMs / 16) + 2; i++) {
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

describe("the autopilot leaves too", () => {
  // WITHOUT A RUNG HERE, NOTHING ENDS THE RUN. There is no LEVEL CLEAR button
  // on this venue, so a botted or headlessly SIMULATED campaign would clear the
  // floor and then stand on it until the clock ran out — which is what this
  // asserts against rather than any opinion about how to play.
  it("makes the wagon the travel plan once the venue is over, and not before", () => {
    const state = startLot();
    const bot = createBot("balanced");
    const tune = botTuningFor(state.level.id);
    const car = carOf(state);
    clearStage(state);
    // Before the boss falls the car is not a destination at all.
    expect(macroTarget(bot, state, state.players[0], tune)).not.toEqual(
      car.pos,
    );
    winAndSettle(state);
    state.dialogue = null;
    state.phase = "playing";
    expect(exitCar(state)?.pos).toEqual(car.pos);
    expect(macroTarget(bot, state, state.players[0], tune)).toEqual(car.pos);
  });

  it("presses the seat once it is standing at it", () => {
    const state = startLot();
    const bot = createBot("balanced");
    clearStage(state);
    winAndSettle(state);
    state.dialogue = null;
    state.phase = "playing";
    const hero = state.players[0];
    // Across the map: nothing to press yet, the walk is the macro plan's.
    expect(hubTapCommand(bot, state, hero, false)).toBeNull();
    walkToCar(state);
    expect(hubTapCommand(bot, state, hero, false)).toEqual({
      name: "enterCar",
      args: [],
    });
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
