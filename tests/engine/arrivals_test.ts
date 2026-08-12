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
  ARRIVALS,
  createGame,
  dismissIntro,
  muteDialogue,
  registerDefs,
  skipCutscene,
  step,
  type GameInput,
  type GameState,
} from "@game/core";
// Engine-internal: the parked position of a seeded stream, which is the one
// way to ask "did anything draw off this".
import { rngState } from "../../engine/lib/rng.ts";

import { installFixtures } from "./fixtures.ts";
import { DT, idle, steerTo } from "../helpers.ts";

const LOT = "test_arrivals_level";
/** …and the same tarmac with the hero landing at the far end of it. */
const FAR_LOT = "test_arrivals_far_level";
/** …and the same tarmac again as a CONTROLLED gate: a kiosk beside the doorway,
 * a door with an open frame to draw, and the read for missing your moment. */
const GATE_LOT = "test_gatehouse_level";
/** The fixture's own door, hand-drawn at x=700 between y 740 and 860. */
const DOOR = { x: 700, y: 800 };
/** Where the far fixture lands him — the far corner of the same lot. */
const FAR_SPAWN = { x: 150, y: 950 };
/** The line the far fixture's lot has to say, registered below. */
const READ = "test_night_shift";
/** …and what the gate's lot says when he watches somebody go through it. */
const MISSED = "test_missed_gate";

beforeEach(() => {
  installFixtures(true);
  // The lot's own READ. Registered here rather than in `installFixtures`,
  // because `registerDefs` replaces the whole thought catalog and a fixture
  // line parked in there takes the shipped mutter away from every other engine
  // suite (see the note on `FIX_CAR_EXIT_LEVEL`).
  registerDefs({
    thoughts: {
      [READ]: {
        id: READ,
        speaker: "{HERO}",
        portrait: "hero",
        pages: [["TEST — THAT'S THE NIGHT SHIFT CLOCKING ON."]],
      },
      [MISSED]: {
        id: MISSED,
        speaker: "{HERO}",
        portrait: "hero",
        pages: [["TEST — I'LL WAIT FOR THE NEXT AND WALK IN BEHIND THEM."]],
      },
    },
  });
});

/** A run on the staff-lot fixture, past the doorstep scenes. */
function lot(seed = 7, level = LOT): GameState {
  const state = createGame(seed, level);
  skipCutscene(state);
  dismissIntro(state);
  return state;
}

/** …and the GATE fixture, with its reads MUTED.
 *
 * The mute is load-bearing rather than tidy: this lot carries a thought, a
 * thought takes the stage, and a scene on the stage freezes the whole run
 * (`step` advances nothing but `playing`) — so an unmuted gate lot stops dead
 * the first time somebody gets out of a car, with the walker frozen mid-tarmac
 * and every assertion below it timing out on a beat that was never going to
 * happen. Muted, the reads are still SPENT (`readOnce`), so `thoughtsSeen` says
 * what it always said. */
function gateLot(seed = 7): GameState {
  const state = lot(seed, GATE_LOT);
  muteDialogue(state);
  return state;
}

/** A CAMERA on a spot — the half of `visibleTo` a headless run has to report
 * for itself, since nothing stamps a view on a hero nobody is watching through.
 * Sized at the reference viewport (~422x260 world units). */
function seeing(x: number, y: number): GameInput["view"] {
  return { x: x - 211, y: y - 130, width: 422, height: 260 };
}

/** Run `ms` of ticks with the hero holding still. */
function idleFor(state: GameState, ms: number): void {
  for (let t = 0; t < ms / DT; t++) step(state, [idle], DT);
}

/** Is the way in still shut? */
function shut(state: GameState): boolean {
  return state.doors.some((d) => d.id === "entrance" && !d.open);
}

/** How many pieces of the doorway's own chain are standing in it. Asked by
 * position rather than by sprite name: the fixture hangs an unadorned door, so
 * a check written against a sprite id would be vacuously true and would say
 * nothing about whether the opening is actually blocked. */
function slats(state: GameState): number {
  return state.obstacles.filter(
    (o) => Math.abs(o.pos.x - DOOR.x) < 20 && Math.abs(o.pos.y - DOOR.y) < 80,
  ).length;
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

  it("pulls the beat into what the hero can SEE from where he lands", () => {
    // THE RULE THIS PINS is the one the whole lot exists for: the sequence has
    // to be WATCHED. The doorway is wherever the carve punched it and the
    // landing is wherever the lot's middle fell, so a rank anchored on the
    // doorway alone plays off the side of the picture — measured over the
    // shipped map, on ten seeds in twelve. Same tarmac, same keyed door as
    // every other case here; only the spawn moves.
    const plan = lot(7, FAR_LOT).arrivalPlan;
    expect(plan).not.toBeNull();
    if (!plan) return;
    const bay = plan.bays[0] as number;
    expect(Math.abs(bay - FAR_SPAWN.x)).toBeLessThanOrEqual(
      ARRIVALS.watchReach,
    );
    expect(Math.abs(plan.laneY - FAR_SPAWN.y)).toBeLessThanOrEqual(
      ARRIVALS.watchReach,
    );
    // …AND IT STILL ARRIVES. The kerb it rolls in from has to be off his
    // screen AND out of his fog, or the car does not drive in out of the dark,
    // it appears in front of him — which is what a lot that reaches no map edge
    // does by default, since it starts its cars just inside its own boundary
    // (see `kerb`).
    expect(Math.abs(plan.entryX - FAR_SPAWN.x)).toBeGreaterThanOrEqual(
      ARRIVALS.arriveGap,
    );
    // The doors keep their own rank when the landing is already in front of
    // them: a bay beside the entrance is where somebody arriving for a shift
    // would actually park, and this fixture lands him there.
    const near = lot().arrivalPlan;
    expect(near).not.toBeNull();
    if (!near) return;
    expect(Math.abs((near.bays[0] as number) - near.apron.x)).toBe(
      ARRIVALS.bayGap,
    );
  });

  it("holds the lot's read until somebody can actually see the walker", () => {
    // "THAT'S THE NIGHT SHIFT CLOCKING ON" is a line about a PERSON. Fired the
    // instant a car door opened somewhere on the tarmac it was a hero narrating
    // somebody he had no picture of — which is exactly what the shipped venue
    // did, and what sent the player off to look for the beat that exists to
    // stop him looking.
    const state = lot(7, FAR_LOT);
    const plan = state.arrivalPlan;
    expect(plan).not.toBeNull();
    if (!plan) return;
    const bay = { x: plan.bays[0] as number, y: plan.laneY };
    // HE IS LOOKING SOMEWHERE ELSE. The camera is parked off at the far side of
    // the map while cars arrive and people get out of them behind him, which is
    // the SCREEN half of `visibleTo` — and it holds the line for as long as it
    // is true.
    let walked = false;
    for (let t = 0; t < 20_000 / DT; t++) {
      step(state, [{ ...idle, view: seeing(2000, 200) }], DT);
      walked ||= state.arrivals.some((a) => a.staff !== null);
    }
    expect(walked, "nobody ever got out of a car").toBe(true);
    expect(state.thoughtsSeen).not.toContain(READ);
    // …and now he turns round and walks over to the rank, camera on him the way
    // the app always has it. That lifts the fog as he goes, which is the OTHER
    // half — and somewhere on that walk he is looking at somebody clocking on
    // and says so. The beat never stops happening, so there is always another
    // one coming (`restartArrival`).
    for (let t = 0; t < 40_000 / DT; t++) {
      const at = state.players[0]?.pos ?? { x: 0, y: 0 };
      step(state, [{ ...steerTo(bay.x, bay.y), view: seeing(at.x, at.y) }], DT);
      if (state.thoughtsSeen.includes(READ)) break;
    }
    expect(state.thoughtsSeen).toContain(READ);
  });

  it("presents the card at the gatehouse window, not at the doorway", () => {
    // A GATE IS NOT A DOOR WITH A LOCK ON IT. It is a lit box with somebody in
    // it, and the way through is to go and be seen by them — so the walk ends
    // at the KIOSK (`ArrivalPlan.reader`) and doglegs back to the gate once the
    // card has been read. While it ended at the middle of the doorway the box
    // was scenery: the badge read as something the DOOR did, and the one thing
    // the beat exists to say was told by a sprite nobody ever walked to.
    const bare = lot(7, LOT).arrivalPlan;
    expect(bare).not.toBeNull();
    // A lot with NO kiosk keeps the threshold, which is the plain badge beat
    // every venue that ships no gatehouse gets.
    if (bare) expect(bare.reader).toEqual(bare.apron);

    const state = gateLot();
    const plan = state.arrivalPlan;
    expect(plan).not.toBeNull();
    if (!plan) return;
    const booth = state.obstacles.find((o) => o.sprite === "test_booth");
    expect(booth, "no gatehouse").toBeDefined();
    if (!booth) return;
    const toBox = Math.hypot(
      plan.reader.x - booth.pos.x,
      plan.reader.y - booth.pos.y,
    );
    // AT the window — past the glass, and OUT of the box: an arrival is a real
    // neutral and the separation pass shoves it out of furniture, so a reader
    // inside the kiosk is somebody pushed back out of it every tick who then
    // badges from wherever he landed.
    expect(toBox).toBeGreaterThan(booth.radius);
    expect(toBox).toBeLessThan(booth.radius + 28);
    // …and it is not the threshold, which is the change that would otherwise
    // compile, pass everything else, and put the beat back where it was.
    expect(plan.reader).not.toEqual(plan.apron);
    // The SWIPE is anchored there too, so what the player hears comes from the
    // man at the glass rather than from the gate.
    let swipe: { x: number; y: number } | null = null;
    for (let t = 0; t < 40_000 / DT; t++) {
      step(state, [idle], DT);
      const beep = state.events.find((e) => e.type === "badgeSwiped");
      if (beep) {
        swipe = { ...beep.pos };
        break;
      }
    }
    expect(swipe, "nobody ever badged in").not.toBeNull();
    if (swipe) {
      expect(Math.hypot(swipe.x - plan.reader.x, swipe.y - plan.reader.y)).toBe(
        0,
      );
    }
  });

  it("draws the gate open while it is open, and takes it back when it shuts", () => {
    // A GATE HAS TWO MODES AND HAS TO SHOW BOTH. Shut, it is its own obstacle
    // chain. OPEN was drawn as NOTHING — the slats came off the field and the
    // doorway reverted to a hole in the wall — so "the way in is open right
    // now", the single fact the whole beat is about, was one the player could
    // only learn by walking at it. And the leaves have to come back OUT of the
    // jambs when it shuts, or the gate stands closed with a pair of open leaves
    // beside it, and a fresh pair after every badge for the rest of the run.
    const state = gateLot();
    const leaves = (): number =>
      state.decor.filter((d) => d.kind === "test_gate_open").length;
    expect(leaves(), "leaves before it ever opened").toBe(0);
    let everOpened = false;
    let peak = 0;
    for (let t = 0; t < 40_000 / DT; t++) {
      step(state, [idle], DT);
      if (!shut(state)) {
        everOpened = true;
        peak = Math.max(peak, leaves());
      } else if (everOpened) break;
    }
    expect(everOpened, "the gate never opened").toBe(true);
    expect(peak, "the gate opened and drew nothing").toBeGreaterThan(0);
    expect(shut(state), "the gate never shut").toBe(true);
    expect(leaves(), "open leaves left standing beside a shut gate").toBe(0);
  });

  it("does not hold the gate open for somebody standing INSIDE", () => {
    // "IT WILL NOT SHUT ON ANYBODY" IS ABOUT THE HOLE, NOT THE NEIGHBOURHOOD.
    // The hold used to be a circle round the door's centre as wide as the
    // doorway plus `DOORS.openRadius`, which reaches as far INTO the building as
    // it does across the opening — and GOODCO parks its scripted rusher a step
    // past the entrance. On the seeds where that body settled nearest the gate
    // it stood in the circle for the whole run, so the gate the entire venue is
    // built around opened once and never shut again, with nobody ever in its
    // way.
    // A bystander (8 across) held a stride PAST the threshold, on the
    // building's side — which is where GOODCO's rusher stands.
    const parked = (at: number): boolean => {
      const state = gateLot();
      const body = state.enemies.find((e) => e.defId === "test_bystander");
      expect(body, "no bystander to park").toBeDefined();
      if (!body) return false;
      for (let t = 0; t < 40_000 / DT; t++) {
        body.pos.x = DOOR.x + at;
        body.pos.y = DOOR.y;
        body.home = { x: body.pos.x, y: body.pos.y };
        step(state, [idle], DT);
        if (state.events.some((e) => e.type === "doorClosed")) return true;
      }
      return false;
    };
    expect(parked(40), "a body a stride inside held the gate open").toBe(true);
    // …AND THE OTHER HALF OF THE RULE STILL HOLDS. It will not shut on somebody
    // actually in the hole: the staffer whose badge opened it is walking through
    // it, and a gate that closed on the man it just admitted would be a gate
    // that teleports him.
    expect(parked(0), "the gate shut on a body standing in it").toBe(false);
  });

  it("says he should wait for the next one when he watches one go in", () => {
    // THE GATE IS A MOMENT, AND MISSING IT IS THE ORDINARY FIRST OUTCOME
    // (`ArrivalsSpec.missedThought`). What the beat could not say for itself is
    // what a miss MEANS — the way in opened, shut and went back to being a wall,
    // with nothing on a deliberately quiet lot to tell the player "wait for the
    // next car" from "that was never the way in".
    //
    // The hero does nothing at all, which is exactly the player it is for.
    const state = gateLot();
    let read = -1;
    for (let t = 0; t < 60_000 / DT; t++) {
      const at = state.players[0]?.pos ?? { x: 0, y: 0 };
      step(state, [{ ...idle, view: seeing(at.x, at.y) }], DT);
      if (state.thoughtsSeen.includes(MISSED)) {
        read = t * DT;
        break;
      }
    }
    expect(read, "he watched somebody go in and said nothing").toBeGreaterThan(
      0,
    );
    // …behind the arrival read, which is what introduces these people. Said the
    // other way round, "and there they go" lands before anybody has arrived.
    expect(state.thoughtsSeen.indexOf(MISSED)).toBeGreaterThan(
      state.thoughtsSeen.indexOf(READ),
    );
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
    expect(slats(state)).toBe(0);
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
    let everWalked = false;
    for (let t = 0; t < 40_000 / DT; t++) {
      step(state, [idle], DT);
      everWalked ||= state.enemies.some((e) => e.arrival === true);
    }
    expect(everWalked, "nobody ever got out of a car").toBe(true);
    // AN ARRIVAL THAT IS THROUGH IS GONE. Asked of the rule rather than of the
    // timetable: "nobody is walking at t=40s" was a fact about how fast the
    // lot happened to cycle, and the gate shutting the moment the doorway is
    // CLEAR rather than the moment its neighbourhood is (`doorwayIsBlocked`)
    // cycles it faster — so there is usually somebody mid-tarmac now, which is
    // the beat working rather than the body being left behind.
    for (const arrival of state.arrivals) {
      if (arrival.phase === "entering") expect(arrival.staff).toBeNull();
    }
    // …and nothing that walked in is standing about on the far side of the wall.
    expect(
      state.enemies.filter((e) => e.arrival === true && e.pos.x > DOOR.x)
        .length,
    ).toBe(0);
  });

  it("shuts the gate again behind whoever badged in", () => {
    // A BADGE BUYS A MOMENT, NOT A DOOR (`ARRIVALS.gateHoldMs`). The gate is
    // somebody else's, it opened because somebody else's card said so, and the
    // whole of what it gives the hero is the second and a half it stands open
    // behind them — which is what makes "follow one in" a thing to be timed
    // rather than a wall that eventually moves.
    const state = lot();
    let everOpened = false;
    for (let t = 0; t < 40_000 / DT; t++) {
      step(state, [idle], DT);
      if (!shut(state)) everOpened = true;
      else if (everOpened) break;
    }
    expect(everOpened).toBe(true);
    expect(shut(state)).toBe(true);
    // …and the slats are really back, so the doorway is a doorway again rather
    // than an opening that merely draws as one.
    expect(slats(state)).toBeGreaterThan(0);
  });

  it("keeps opening it, long after the rank has filled up", () => {
    // THE BEAT MAY NEVER STOP HAPPENING. With a gate that shuts again, a player
    // can watch every car on the rank arrive, badge in and go inside and still
    // be standing on the tarmac — so a lot whose bays are all taken has to go on
    // producing chances, or the level's only way in ceases to exist.
    const state = lot();
    idleFor(state, 60_000);
    const before = state.stats.timeMs;
    let opened = 0;
    for (let t = 0; t < 60_000 / DT; t++) {
      step(state, [idle], DT);
      if (state.events.some((e) => e.type === "doorOpened")) opened++;
    }
    expect(state.stats.timeMs).toBeGreaterThan(before);
    expect(opened).toBeGreaterThan(0);
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
