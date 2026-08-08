// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE STAFF LOT (`LevelDef.arrivals`, engine/game/arrivals.ts) — the engine rule
// behind GOODCO's front door, on a synthetic lot so it survives the shipped
// content being deleted.
//
// The rule in one sentence: a level with `arrivals` on it puts CARS on its
// arrival district, and somebody gets out of each one and walks to a KEYED
// entrance nothing in the game unlocks and OPENS IT. Everything asserted here
// is a consequence of that sentence, and each is something whose absence would
// make the campaign's first venue unenterable rather than merely worse:
//
//   • the plan is worked out from the carve (a lane, a rank, a doorway);
//   • the lot's own population is minted, and it is NEUTRAL — the hero cannot
//     be attacked out there and cannot attack anybody;
//   • a car arrives, parks, becomes furniture, and somebody gets out;
//   • that person walks to the doors and BADGES IN, and the entrance opens;
//   • the hero never opens it himself, however long he stands in front of it;
//   • and the whole beat costs the run's own rng stream nothing at all.

import { beforeEach, describe, expect, it } from "vitest";

import {
  createGame,
  dismissIntro,
  skipCutscene,
  step,
  type GameState,
} from "@game/core";
// Engine-internal: the parked position of a seeded stream, which is the one
// way to ask "did anything draw off this".
import { rngState } from "../../engine/lib/rng.ts";

import { installFixtures } from "./fixtures.ts";
import { DT, idle, steerTo } from "../helpers.ts";

const LOT = "test_arrivals_level";
/** The fixture's own door, hand-drawn at x=700 between y 740 and 860. */
const DOOR = { x: 700, y: 800 };

beforeEach(() => {
  installFixtures(true);
});

/** A run on the staff-lot fixture, past the doorstep scenes. */
function lot(seed = 7): GameState {
  const state = createGame(seed, LOT);
  skipCutscene(state);
  dismissIntro(state);
  return state;
}

/** Run `ms` of ticks with the hero holding still. */
function idleFor(state: GameState, ms: number): void {
  for (let t = 0; t < ms / DT; t++) step(state, [idle], DT);
}

/** Is the way in still shut? */
function shut(state: GameState): boolean {
  return state.doors.some((d) => d.id === "entrance" && !d.open);
}

describe("the staff lot", () => {
  it("plans the lane, the rank and the doorway off the carve", () => {
    const plan = lot().arrivalPlan;
    expect(plan).not.toBeNull();
    if (!plan) return;
    // The apron is a step off the doorway, ON THE LOT'S SIDE of it — the whole
    // walk aims at it, so an apron behind the wall is a walk into a building.
    expect(plan.door.x).toBeCloseTo(DOOR.x, 0);
    expect(plan.apron.x).toBeLessThan(DOOR.x);
    expect(plan.inside.x).toBeGreaterThan(DOOR.x);
    // The driving lane is held off the footpath, or the rank is parked on the
    // line people walk down.
    expect(plan.laneY).not.toBe(plan.walkY);
    // …and the rank runs BACK from the doors toward the kerb the cars use.
    expect(plan.bays.length).toBeGreaterThan(0);
    for (const bay of plan.bays) {
      expect(Math.sign(bay - plan.apron.x)).toBe(
        Math.sign(plan.entryX - plan.apron.x),
      );
    }
  });

  it("stands its own people on the tarmac, and none of them is in the fight", () => {
    const state = lot();
    const guards = state.enemies.filter((e) => e.defId === "test_bystander");
    expect(guards.length).toBe(2);
    // NEUTRAL, which is the whole point of the lot: the hero walks onto it
    // holstered and nothing out there is looking for him.
    for (const guard of guards) expect(guard.hostile).not.toBe(true);
  });

  it("rolls a car in, parks it, and lets somebody out of it", () => {
    const state = lot();
    idleFor(state, 12_000);
    expect(state.arrivals.length).toBeGreaterThan(0);
    const first = state.arrivals[0];
    expect(first).toBeDefined();
    if (!first) return;
    // It ARRIVED — it did not appear parked. The kerb is off the rank.
    expect(first.car.pos.x).toBeCloseTo(first.bay.x, 0);
    expect(first.bay.x).not.toBeCloseTo(state.arrivalPlan?.entryX ?? 0, 0);
    // A parked visitor's car is FURNITURE: its blockers are on the field, so
    // the hero has something to walk round rather than through.
    expect(first.parked).toBe(true);
    expect(
      state.obstacles.some(
        (o) =>
          o.kind === "vehicle" &&
          Math.abs(o.pos.y - first.car.pos.y) < 12 &&
          Math.abs(o.pos.x - first.car.pos.x) < 40,
      ),
    ).toBe(true);
  });

  it("badges the entrance open, and fires the swipe before the doors", () => {
    const state = lot();
    expect(shut(state)).toBe(true);
    let swipe = -1;
    let opened = -1;
    for (let t = 0; t < 40_000 / DT; t++) {
      step(state, [idle], DT);
      if (swipe < 0 && state.events.some((e) => e.type === "badgeSwiped")) {
        swipe = t;
      }
      if (opened < 0 && !shut(state)) opened = t;
      if (opened >= 0) break;
    }
    expect(swipe).toBeGreaterThanOrEqual(0);
    // The reader answers first, then the building. The other way round and the
    // doors read as having opened by themselves.
    expect(swipe).toBeLessThanOrEqual(opened);
    // …and the chain really is gone, so the doorway can be walked through.
    expect(state.obstacles.some((o) => o.sprite === "door_entrance")).toBe(
      false,
    );
  });

  it("never opens for the hero, however long he stands at it", () => {
    const state = lot();
    // Park the beat: with no arrival on the way, the only thing that could
    // open the door is the hero himself — and nothing may.
    state.arrivalTimerMs = Number.POSITIVE_INFINITY;
    state.arrivalPlan = null;
    for (let t = 0; t < 8000 / DT; t++) {
      step(state, [steerTo(DOOR.x - 20, DOOR.y)], DT);
    }
    expect(shut(state)).toBe(true);
  });

  it("takes the body off the field once it is through", () => {
    const state = lot();
    idleFor(state, 40_000);
    expect(shut(state)).toBe(false);
    // Everybody who arrived has gone to work; only the lot's own guards are
    // left standing on it.
    expect(state.arrivals.some((a) => a.staff !== null)).toBe(false);
    expect(state.enemies.filter((e) => e.arrival === true).length).toBe(0);
  });

  it("spends nothing off the run's own rng", () => {
    // THE RULE THIS PINS is the one that makes the beat safe to put on a
    // seeded campaign level at all: a car park is presentation, and a draw
    // spent on presentation shifts every loot roll after it. The lot's own
    // decisions ride `ArrivalPlan.rng`, so the run's stream must be exactly
    // where a run with the whole beat disabled would have left it.
    const withLot = lot();
    const without = lot();
    without.arrivalPlan = null;
    without.arrivalTimerMs = Number.POSITIVE_INFINITY;
    idleFor(withLot, 30_000);
    idleFor(without, 30_000);
    expect(rngState(withLot.rng)).toBe(rngState(without.rng));
  });
});
