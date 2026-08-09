// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE OTHER DRIVERS — the traffic that steers itself, the traffic that crashes
// into itself, and the promise the gentle rungs make about there being a way
// through.
//
// WHAT IS WORTH PINNING HERE is the SHAPE of the road rather than any one
// number: that a lane is not a conveyor belt, that the drivers never touch the
// road's dice, that two vehicles meeting is a collision rather than two pictures
// sliding through each other, and that a pair that has just crashed is still
// very much there for the hero to hit. The particular knobs (how wide a wobble,
// how often a chase) belong to the tuning and would make every tuning pass a
// test edit.

import { describe, expect, it } from "vitest";

import {
  createDrive,
  createTraffic,
  DRIVE,
  DRIVE_OUTCOME,
  cityStartPx,
  haltTraffic,
  laneAt,
  laneCenter,
  skipDriveOpening,
  stepDrive,
  vehicleDef,
  type DriveParams,
  type DriveState,
} from "../../engine/game/drive/index.ts";
import { siblingLane } from "../../engine/game/drive/ai.ts";
import { variantOf } from "../../engine/game/drive/fleet.ts";

const PARAMS: DriveParams = {
  seed: 4242,
  direction: 1,
  difficulty: "medium",
  to: "test_level",
  gib: true,
  split: true,
};

function drive(patch: Partial<DriveParams> = {}): DriveState {
  const built = createDrive({ ...PARAMS, ...patch });
  // Opened at the town, for the reason every drive suite does it: the approach
  // is five seconds of held road with no lane traffic on it at all, and none of
  // these tests is about the approach.
  skipDriveOpening(built);
  return built;
}

/**
 * SHUT EVERY SPAWNER UP — the only things on this road that legitimately draw
 * from the seeded stream. What is left is the road already laid down, driving
 * itself.
 */
function silenceSpawners(state: DriveState): void {
  haltTraffic(state);
  state.nextPedestrianAt = Number.POSITIVE_INFINITY;
  state.nextThoughtAt = Number.POSITIVE_INFINITY;
  state.blockadeDone = true;
  state.pedestrians.length = 0;
}

/** Run a leg with the throttle buried, stopping when it ends. */
function roll(state: DriveState, ms: number, pedal = 1): void {
  for (let t = 0; t < ms; t += 16) {
    if (state.outcome !== DRIVE_OUTCOME.driving) return;
    stepDrive(state, 16, { pedal, wheel: 0 });
  }
}

describe("the other drivers", () => {
  it("does not hold every vehicle on a lane centre", () => {
    // THE ONE-LINE STATEMENT OF WHAT THE AI IS FOR. A road whose vehicles are
    // all exactly on a lane's middle is four conveyor belts, and a player who
    // finds a clear belt can hold it for the rest of the leg.
    const state = drive();
    roll(state, 12000);
    const road = state.traffic.filter(
      (one) => !vehicleDef(one.variant).pavement && !one.downed,
    );
    expect(road.length).toBeGreaterThan(3);
    const off = road.filter(
      (one) => Math.abs(one.pos.y - laneCenter(laneAt(one.pos.y))) > 0.3,
    );
    expect(off.length).toBeGreaterThan(0);
  });

  it("puts them at genuinely different speeds", () => {
    // A road where everybody moves at one pace has no overtaking on it, no
    // closing speeds worth reading, and nothing for a lane change to be FOR.
    // The claim is about the SPREAD, not about any rung of the temper table.
    const paces: number[] = [];
    for (const seed of [1, 2, 3]) {
      const state = drive({ seed });
      roll(state, 20000);
      for (const one of state.traffic) {
        if (vehicleDef(one.variant).pavement || one.wrecked) continue;
        if (Math.abs(one.cruise) > 1) paces.push(Math.abs(one.cruise));
      }
    }
    expect(paces.length).toBeGreaterThan(20);
    paces.sort((a, b) => a - b);
    const low = paces[Math.floor(paces.length * 0.1)]!;
    const high = paces[Math.floor(paces.length * 0.9)]!;
    // Better than two to one between the dawdlers and the ones in a hurry.
    expect(high).toBeGreaterThan(low * 2);
  });

  it("spends not one draw of the road's own dice on driving", () => {
    // THE RULE THE WHOLE FILE IS BUILT ON. The seeded stream lays every body,
    // variant, temper and phase down in a fixed order, so a single draw spent on
    // a lane change would move everything rolled after it — and the road would
    // stop being a property of the seed.
    //
    // COUNTED RATHER THAN INFERRED. Comparing two differently-driven legs cannot
    // show this: the spawners are reached at DISTANCES, a leg that hits more
    // things covers less ground, and the streams interleave differently for that
    // reason alone. So the stream is wrapped in a counter and everything that
    // draws from it is shut off — no marks left to reach, no blockade to lay —
    // leaving a road that is nothing but vehicles driving, overtaking, going
    // round each other and crashing. The honest answer is zero.
    const state = drive();
    silenceSpawners(state);
    state.traffic.length = 0;
    for (let i = 0; i < 8; i++) {
      const one = createTraffic(
        state.nextId++,
        variantOf(i % 2 === 0 ? "traffic_hatch" : "traffic_bus"),
        {
          x: state.car.pos.x + 90 + i * 55,
          y: laneCenter(i % DRIVE.laneCount),
        },
        i % 3 === 0 ? 120 : 420,
      );
      state.traffic.push(one);
    }
    let draws = 0;
    const real = state.rng;
    state.rng = () => {
      draws++;
      return real();
    };
    for (let t = 0; t < 6000; t += 16) {
      stepDrive(state, 16, { pedal: 0.7, wheel: Math.sin(t / 300) });
    }
    // They genuinely did something — overtook, went round each other, hit each
    // other — and none of it cost a draw.
    expect(
      state.traffic.some((one) => one.laneHoldMs < DRIVE.drivers.settledMs),
    ).toBe(true);
    expect(draws).toBe(0);
  });

  it("sends somebody past with the police after them", () => {
    // A CHASE IS NOT A NEW KIND OF TRAFFIC — it is a runner and one or two
    // patrol cars whose drivers are trying much harder, which is why the whole
    // thing cost one function. What is pinned is that it HAPPENS, that the ones
    // behind are police, and that their lights are on.
    const police = variantOf("traffic_police");
    let seen = 0;
    let lit = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const state = drive({ seed });
      const met = new Set<number>();
      for (let t = 0; t < 60000; t += 16) {
        if (state.outcome !== DRIVE_OUTCOME.driving) break;
        stepDrive(state, 16, { pedal: 0.4, wheel: 0 });
        for (const one of state.traffic) {
          if (one.variant !== police || met.has(one.id)) continue;
          met.add(one.id);
          seen++;
          if (one.siren) {
            lit++;
            // A chase is flat out and trying: both are the same `urgency` the
            // ordinary driver reads, wound up.
            expect(one.urgency).toBeGreaterThan(1);
            expect(Math.abs(one.cruise)).toBeGreaterThan(
              DRIVE.trafficSpeedPx.max,
            );
          }
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
    expect(lit).toBeGreaterThan(0);
  });
});

describe("the traffic against itself", () => {
  it("solves a collision between two of them, and leaves both in the road", () => {
    // WITHOUT THIS PASS two vehicles resolve by sliding through each other,
    // which reads as the road being a painting. The pile-up the player did not
    // cause is the most interesting obstacle this minigame has, so what is
    // pinned is that the blow lands AND that nothing is retired for it.
    const state = drive();
    haltTraffic(state);
    state.traffic.length = 0;
    const stopped = createTraffic(
      state.nextId++,
      variantOf("traffic_hatch"),
      { x: state.car.pos.x + 900, y: laneCenter(1) },
      0,
    );
    stopped.cruise = 0;
    const into = createTraffic(
      state.nextId++,
      variantOf("traffic_van"),
      { x: stopped.pos.x - 120, y: laneCenter(1) },
      520,
    );
    state.traffic.push(stopped, into);
    for (let t = 0; t < 900; t += 16)
      stepDrive(state, 16, { pedal: 0, wheel: 0 });
    // The van arrived at the back of the hatchback and both know about it.
    expect(stopped.wear + into.wear).toBeGreaterThan(0);
    // …and BOTH are still on the road, which is the whole point: a wreck the
    // hero now has to get through.
    expect(state.traffic).toContain(stopped);
    expect(state.traffic).toContain(into);
  });

  it("leaves a crashed pair hittable by the hero on the very next frame", () => {
    // THE ONE RULE THAT IS EASY TO GET WRONG AND EXPENSIVE TO MISS. The pair are
    // immune to EACH OTHER for a moment (`crashCooldownMs`); spent on the hero's
    // own latch it would mean driving clean through the crash you were braking
    // for.
    const state = drive();
    haltTraffic(state);
    state.traffic.length = 0;
    const one = createTraffic(
      state.nextId++,
      variantOf("traffic_sedan"),
      { x: state.car.pos.x + 40, y: state.car.pos.y },
      0,
    );
    one.crashCooldownMs = DRIVE.between.immuneMs;
    state.traffic.push(one);
    state.car.speed = DRIVE.topSpeedPx * 0.6;
    stepDrive(state, 16, { pedal: 0, wheel: 0 });
    expect(state.shunts).toBeGreaterThan(0);
  });
});

describe("the promise of a way through", () => {
  it("seldom shuts both of the hero's lanes at once on EASY, and does on the hard rungs", () => {
    // THE ONE THING THAT CAN MAKE THIS MINIGAME UNFAIR is a screen with both
    // lanes running the hero's way shut at the same point on the road: he cannot
    // brake his way out of it and he cannot go round it, so the only thing left
    // is to pick which car to hit, which is a coin landing on its edge rather
    // than a decision. EASY states that it will not happen; the hard rungs
    // deliberately make no such promise.
    const shutFrac = (difficulty: "easy" | "hard"): number => {
      let both = 0;
      let ticks = 0;
      for (const seed of [1234, 5, 77, 909]) {
        const state = drive({ seed, difficulty });
        for (let t = 0; t < 40000; t += 16) {
          if (state.outcome !== DRIVE_OUTCOME.driving) break;
          stepDrive(state, 16, { pedal: 0.5, wheel: 0 });
          if (state.distance <= cityStartPx(state.params)) continue;
          ticks++;
          // The two lanes running his way, over the screenful he is about to
          // arrive at.
          const mine = laneAt(state.car.pos.y);
          const pair = [mine, siblingLane(mine)];
          const shut = pair.map((lane) =>
            state.traffic.some((one) => {
              const ahead =
                (one.pos.x - state.car.pos.x) * state.params.direction;
              return laneAt(one.pos.y) === lane && ahead > 0 && ahead < 260;
            }),
          );
          if (shut[0] && shut[1]) both++;
        }
      }
      return both / Math.max(1, ticks);
    };
    const easy = shutFrac("easy");
    // Rarely — a percent or two of the leg, and only where a lane change has
    // just put two of them level for a moment.
    expect(easy).toBeLessThan(0.05);
    // …and the rung that promises nothing shuts both far more often, which is
    // the difference being a difficulty rather than a bug fix.
    expect(shutFrac("hard")).toBeGreaterThan(easy * 3);
  });
});
