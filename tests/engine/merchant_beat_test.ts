// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TRADER WHO WORKS A PITCH (src/game/merchant.ts, `LevelDef.merchant.beat`)
// — the hub's street dealer, and the three rules that are his alone:
//
//   1. HE WALKS, and he walks his STRIP: open for business from the first tick
//      like a parked trader, then pacing the beat the map carved him end to
//      end, all run, never off it;
//   2. HE STOPS WHEN HAILED — a tap roots him where he stands so a hero can
//      walk up to a counter that has stopped moving, the open shop holds him
//      there, and closing the shop puts him straight back on his beat;
//   3. HE CAN BE RUN OVER — the one thing on the lot a car can kill, which
//      shuts the stall for the visit and for the visit only: a merchant is
//      minted per run, so the next arrival gets somebody else.
//
// Everything else about him (stock, prices, the buy-back shelf, the ward) is
// the ordinary merchant's and is proved in merchant_test.ts.

import { describe, expect, it } from "vitest";

import {
  applyRunCommand,
  CAR,
  closeShop,
  createGame,
  hailMerchant,
  killMerchant,
  MERCHANT,
  openShop,
  type CarVehicle,
  type GameState,
} from "@game/core";
import { idle, run, startGame, steerTo } from "./helpers.ts";

/** The dealer's level: the road hub whose trader paces the tarmac. */
const startBeat = (seed = 42): GameState => startGame(seed, "test_beat_level");

/** The strip he is allowed on (the fixture's own rect). */
const BEAT = { x: 1000, y: 0, width: 120, height: 1600 };

const onBeat = (pos: { x: number; y: number }): boolean =>
  pos.x >= BEAT.x - MERCHANT.radius &&
  pos.x <= BEAT.x + BEAT.width + MERCHANT.radius &&
  pos.y >= BEAT.y - MERCHANT.radius &&
  pos.y <= BEAT.y + BEAT.height + MERCHANT.radius;

const carOf = (state: GameState): CarVehicle => {
  const car = state.vehicles.find((v) => v.kind === "car");
  if (!car || car.kind !== "car") throw new Error("no car minted");
  return car;
};

describe("the beat", () => {
  it("opens for business from the first tick, like any resident trader", () => {
    const state = startBeat();
    expect(state.merchant.discovered).toBe(true);
    expect(state.merchant.dead).toBe(false);
    // …and owes no scene for it: he is a man on a pavement, not a meeting.
    expect(state.merchant.greetedReturn).toBe(true);
    expect(state.dialogue).toBeNull();
  });

  it("keeps walking after the meeting, which no other trader does", () => {
    const state = startBeat();
    const from = { ...state.merchant.pos };
    run(state, idle, 240);
    expect(state.merchant.pos).not.toEqual(from);
  });

  it("walks the LONG axis and never leaves the strip", () => {
    const state = startBeat();
    let north = state.merchant.pos.y;
    let south = state.merchant.pos.y;
    for (let i = 0; i < 4000; i++) {
      run(state, idle, 1);
      expect(onBeat(state.merchant.pos)).toBe(true);
      north = Math.min(north, state.merchant.pos.y);
      south = Math.max(south, state.merchant.pos.y);
    }
    // A beat is a crossing and a turn: over a minute of walking he covers a
    // real stretch of the street rather than milling about one spot.
    expect(south - north).toBeGreaterThan(200);
  });

  it("turns round rather than piling into the end of the strip", () => {
    const state = startBeat();
    // Park him at the top of his beat and let him walk: the only legs
    // available from there run back down it.
    state.merchant.pos = { x: 1060, y: 30 };
    state.merchant.wanderTarget = null;
    state.merchant.idleMs = 0;
    run(state, idle, 600);
    expect(state.merchant.pos.y).toBeGreaterThan(60);
    expect(onBeat(state.merchant.pos)).toBe(true);
  });
});

describe("hailing him", () => {
  it("roots him where he stands", () => {
    const state = startBeat();
    run(state, idle, 60);
    expect(hailMerchant(state)).toBe(true);
    const spot = { ...state.merchant.pos };
    run(state, idle, 300);
    expect(state.merchant.pos).toEqual(spot);
    expect(state.merchant.moving).toBe(false);
  });

  it("wears off on its own, so a tap nobody follows up on is a pause", () => {
    const state = startBeat();
    hailMerchant(state);
    const spot = { ...state.merchant.pos };
    // Past the hail's own window (ticks are 1/60 s — see helpers' DT).
    run(state, idle, Math.ceil((MERCHANT.hailMs / 1000) * 60) + 300);
    expect(state.merchant.pos).not.toEqual(spot);
  });

  it("holds while the shop is open and lets go when it closes", () => {
    const state = startBeat();
    const hero = state.players[0];
    if (!hero) throw new Error("no hero");
    hailMerchant(state);
    hero.pos = { ...state.merchant.pos };
    expect(openShop(state, hero)).toBe(true);
    const spot = { ...state.merchant.pos };
    run(state, idle, 600);
    expect(state.merchant.pos).toEqual(spot);
    closeShop(state, hero);
    expect(state.merchant.haltMs).toBe(0);
    run(state, idle, 240);
    expect(state.merchant.pos).not.toEqual(spot);
  });

  it("is a no-op for a trader who was not walking anywhere", () => {
    const state = startGame(42, "test_hub_level");
    expect(hailMerchant(state)).toBe(false);
    expect(state.merchant.haltMs).toBe(0);
  });

  it("travels as a run command, like every other verb the app runs", () => {
    const state = startBeat();
    expect(applyRunCommand(state, "hailMerchant")).toBe(true);
    expect(state.merchant.haltMs).toBeGreaterThan(0);
  });
});

describe("under the car", () => {
  it("dies when a driven car catches him at speed", () => {
    const state = startBeat();
    const hero = state.players[0];
    if (!hero) throw new Error("no hero");
    const car = carOf(state);
    hero.pos = { x: car.pos.x - 30, y: car.pos.y };
    applyRunCommand(state, "enterCar");
    // Stand him in the road ahead, and drive at him.
    state.merchant.pos = { x: car.pos.x + 260, y: car.pos.y };
    hailMerchant(state); // he waits there rather than strolling out of it
    const east = steerTo(car.pos.x + 2000, car.pos.y);
    let killed = false;
    for (let i = 0; i < 400 && !killed; i++) {
      run(state, east, 1);
      killed = state.events.some((e) => e.type === "merchantKilled");
    }
    expect(killed).toBe(true);
    expect(state.merchant.dead).toBe(true);
    expect(state.mapMarkers.some((m) => m.kind === "merchant")).toBe(false);
  });

  it("is not run down by a car being parked", () => {
    const state = startBeat();
    const car = carOf(state);
    state.merchant.pos = { x: car.pos.x + CAR.footprint.radius, y: car.pos.y };
    car.speed = CAR.roadkillSpeed - 5;
    run(state, idle, 10);
    expect(state.merchant.dead).toBe(false);
  });

  it("shuts the stall, and drops the counter of anybody standing at it", () => {
    const state = startBeat();
    const hero = state.players[0];
    if (!hero) throw new Error("no hero");
    hero.pos = { ...state.merchant.pos };
    expect(openShop(state, hero)).toBe(true);
    killMerchant(state);
    expect(hero.screen).toBeUndefined();
    expect(openShop(state, hero)).toBe(false);
  });

  it("stops being stepped at all once he is down", () => {
    const state = startBeat();
    killMerchant(state);
    const spot = { ...state.merchant.pos };
    run(state, idle, 600);
    expect(state.merchant.pos).toEqual(spot);
    expect(state.merchant.moving).toBe(false);
  });

  it("is replaced on the next visit — a merchant is minted per run", () => {
    const state = startBeat();
    killMerchant(state);
    expect(state.merchant.dead).toBe(true);
    const again = createGame(42, "test_beat_level");
    expect(again.merchant.dead).toBe(false);
    expect(again.merchant.discovered).toBe(true);
  });
});
