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
  type DriveTraffic,
} from "../../engine/game/drive/index.ts";
import { siblingLane } from "../../engine/game/drive/ai.ts";
import { variantOf } from "../../engine/game/drive/fleet.ts";

/** How long a test that drives REAL ROAD is allowed to take — the same decision
 * and the same reasoning as `ROAD_TIMEOUT_MS` in `drive_test.ts`: a case that
 * steps whole legs costs real seconds, and vitest's five-second default is a
 * wall clock that a busy box decides. */
const ROAD_TIMEOUT_MS = 60_000;

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
  // is ten seconds of held road with no lane traffic on it at all, and none of
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

/**
 * A ROAD WITH NOBODY ON IT AND THE HERO OUT OF THE WAY — what the following
 * tests stage two vehicles on.
 *
 * The wagon is parked in the far carriageway's outside lane because it is a
 * PARTY to every collision otherwise: coasting down a lane the test has just put
 * a dawdler in, it rear-ends the dawdler itself and the suite reads the hero's
 * own contact as the driver's.
 */
function empty(patch: Partial<DriveParams> = {}): DriveState {
  const state = drive(patch);
  silenceSpawners(state);
  state.traffic.length = 0;
  state.props.length = 0;
  state.nextPropSlot = Number.POSITIVE_INFINITY;
  state.car.pos.y = laneCenter(0);
  return state;
}

/** Put one vehicle on the road, going the hero's way in `lane`. */
function plant(
  state: DriveState,
  id: string,
  aheadPx: number,
  lane: number,
  speed: number,
): DriveTraffic {
  const one = createTraffic(
    state.nextId++,
    variantOf(id),
    { x: state.car.pos.x + aheadPx, y: laneCenter(lane) },
    speed,
  );
  state.traffic.push(one);
  return one;
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
    //
    // TWELVE SEEDS AND NOT THREE, because a TENTH and a NINETIETH percentile
    // asked of thirty samples is three vehicles at each end — a distribution
    // claim resting on which six cars happened to be in frame. It read 2.4 on
    // the three seeds it was written against and 1.95 on the three it got when
    // an unrelated change to the road's length re-seeded the town, with the
    // underlying spread unmoved (2.6 against 2.5 over twelve). Sixty-plus
    // samples is enough for the percentiles to be about the temper table rather
    // than about the draw; instant breakdowns leave fewer live cars in frame.
    const paces: number[] = [];
    for (let seed = 1; seed <= 12; seed++) {
      const state = drive({ seed });
      roll(state, 20000);
      for (const one of state.traffic) {
        // `cruise` is the pace this driver CHOSE and survives a breakdown, so
        // wrecks still belong in this distribution. Excluding them made the
        // sample size a measurement of how many pile-ups the road had instead
        // of the temper table this test is about.
        if (vehicleDef(one.variant).pavement) continue;
        if (Math.abs(one.cruise) > 1) paces.push(Math.abs(one.cruise));
      }
    }
    expect(paces.length).toBeGreaterThan(60);
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

  it(
    "sends somebody past with the police after them",
    () => {
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
    },
    ROAD_TIMEOUT_MS,
  );
});

describe("a driver that is trying not to crash", () => {
  it("gets past a dawdler rather than driving over it", () => {
    // THE CLAIM: a car that wants to do more than the car in front does not
    // arrive at the back of it. It used to — the lift-off was a fixed share of
    // its own cruise, so anything doing less than half what it wanted was a
    // collision waiting for the gap to close, and on a road built around drivers
    // running at genuinely different speeds that was most of the traffic.
    const state = empty();
    const slow = plant(state, "traffic_hatch", 900, 3, 120);
    const quick = plant(state, "traffic_bus", 700, 3, 330);
    let met = 0;
    for (let t = 0; t < 12000; t += 16) {
      stepDrive(state, 16, { pedal: 0, wheel: 0 });
      met += state.events.filter((one) => one.type === "trafficHit").length;
    }
    expect(met).toBe(0);
    // …and it did not solve it by giving up either: it is past the hatchback,
    // still doing its own pace.
    expect((quick.pos.x - slow.pos.x) * state.params.direction).toBeGreaterThan(
      0,
    );
    expect(Math.abs(quick.speed)).toBeGreaterThan(250);
  });

  it("stands on the brake for a wreck, though even its walking-pace scuff breaks the car", () => {
    // THE OTHER HALF, and the one matching alone cannot answer: a wreck is not
    // slower, it is STOPPED, and a driver that only lifted off arrived at it at
    // most of its cruise. What is pinned is the speed it is doing by the time it
    // gets there — a nudge at a walking pace is a driver that braked, and
    // anything near its cruise is a driver that did not.
    const state = empty();
    const dead = plant(state, "traffic_van", 800, 3, 0);
    dead.wrecked = true;
    dead.cruise = 0;
    const behind = plant(state, "traffic_sedan", 420, 3, 300);
    let slowest = Number.POSITIVE_INFINITY;
    for (let t = 0; t < 4000; t += 16) {
      stepDrive(state, 16, { pedal: 0, wheel: 0 });
      const gap = (dead.pos.x - behind.pos.x) * state.params.direction;
      if (gap > 0 && gap < 200)
        slowest = Math.min(slowest, Math.abs(behind.speed));
    }
    // It arrived at a crawl instead of at forty miles an hour…
    expect(slowest).toBeLessThan(60);
    // …but it DID touch it. Five or ten miles an hour is deliberately still a
    // crash now, so the car breaks down instead of being lightly shoved on.
    expect(behind.wrecked).toBe(true);
  });

  it("still runs out of road when the gap goes inside its own braking", () => {
    // AND IT IS NOT A PROMISE. A driver brakes for what it can SEE with one set
    // of brakes, so a car that stops dead a car's length in front of it is a
    // collision — which is where the pile-up the player has to get through comes
    // from now: drivers who tried and ran out of road, rather than drivers who
    // were never trying. Without this the road would quietly stop producing the
    // best obstacle it has.
    const state = empty();
    const stopped = plant(state, "traffic_hatch", 900, 1, 0);
    stopped.cruise = 0;
    const into = plant(state, "traffic_van", 820, 1, 520);
    into.cruise = 520;
    let met = 0;
    for (let t = 0; t < 1200; t += 16) {
      stepDrive(state, 16, { pedal: 0, wheel: 0 });
      met += state.events.filter((one) => one.type === "trafficHit").length;
    }
    expect(met).toBeGreaterThan(0);
  });

  it("completes a lane change once it has committed to one", () => {
    // THE COMMITMENT, and it is worth its own case because the road looked
    // entirely healthy without it. A lane change takes about a second, and for
    // every tick of it the car is still physically in the lane it is leaving —
    // so the correction that adopts the lane a SHUNTED car has ended up in used
    // to talk every driver out of every voluntary change on the tick after it
    // was decided. Nothing looked broken: they wobbled, they went round parked
    // cars, they lifted off. They simply never pulled out, which is one of the
    // five things this file exists for.
    const state = empty();
    plant(state, "traffic_hatch", 900, 3, 120);
    const quick = plant(state, "traffic_coupe", 780, 3, 300);
    const born = laneAt(quick.pos.y);
    let moved = false;
    for (let t = 0; t < 6000 && !moved; t += 16) {
      stepDrive(state, 16, { pedal: 0, wheel: 0 });
      moved = laneAt(quick.pos.y) !== born;
    }
    expect(moved).toBe(true);
    expect(laneAt(quick.pos.y)).toBe(siblingLane(born));
  });
});

describe("somebody driven into from behind", () => {
  it("grinds to a halt the moment the wagon is off it", () => {
    // THE WHOLE POINT OF SHOVING A CAR UP THE ROAD. A pushed vehicle used to
    // have the shove written into the pace its driver had CHOSEN, so lifting off
    // left it driving away at whatever speed the wagon had given it — the one
    // thing nobody who has just been rear-ended does. There is a person in it:
    // they stop, and what the player is left with is an obstacle he made.
    const state = empty();
    state.car.pos.y = laneCenter(3);
    // Stage the shove itself, not one of the deterministic combustion outcomes:
    // id 10 is the neutral fixture shared by the other collision probes.
    state.nextId = 10;
    const victim = plant(state, "traffic_hatch", 40, 3, 200);
    // Shove it for a second…
    for (let t = 0; t < 1000; t += 16) {
      stepDrive(state, 16, { pedal: 1, wheel: 0 });
    }
    expect(victim.brakeMs).toBeGreaterThan(0);
    const carried = Math.abs(victim.speed);
    expect(carried).toBeGreaterThan(100);
    // …then steer off it, and watch it stop.
    for (let t = 0; t < 1500; t += 16) {
      stepDrive(state, 16, { pedal: 1, wheel: -1 });
    }
    expect(Math.abs(victim.speed)).toBe(0);
  });

  it("leaves a sideswipe alone", () => {
    // A ROAD WHERE EVERY CLIPPED WING CAME TO A STANDSTILL would be a car park
    // by the second junction. The ladder the whole minigame teaches is that a
    // clip is cheap; only a car that has genuinely been driven into stops.
    const state = empty();
    state.car.pos.y = laneCenter(3);
    // Level with the wagon and grinding down its flank — a door, not a boot.
    const beside = plant(state, "traffic_hatch", 4, 3, 200);
    beside.pos.y = state.car.pos.y - 12;
    state.car.speed = DRIVE.topSpeedPx * 0.7;
    for (let t = 0; t < 400; t += 16) {
      stepDrive(state, 16, { pedal: 0, wheel: 0 });
    }
    // It was genuinely hit…
    expect(beside.wear).toBeGreaterThan(0);
    // …and nobody stood on anything for it.
    expect(beside.brakeMs).toBe(0);
  });
});

describe("the man riding the white line", () => {
  it(
    "sends about a third of what he is hiding between across at him",
    () => {
      // THE HOLE IT CLOSED. Two bodies meet across the road inside
      // `(BODY_RADIUS + radiusPx) × impact.bodyBandFrac`, which while that band
      // was 0.6 came out at about eleven px for a saloon against a lane
      // twenty-six wide — so a wagon parked exactly on a lane marking sat
      // thirteen px from the centre of the lane either side of it and cleared
      // BOTH. Sit on the line and the traffic passed down each flank for the
      // whole leg: no wheel, no reading, no minigame.
      //
      // THE GEOMETRY CLOSES IT NOW TOO (the band is 1, so the reach is about
      // eighteen and the man on the marking is inside both lanes), and this
      // behaviour stays because it is the better answer to the same question —
      // the drivers he is threading between get to NOTICE. What it costs the
      // measurement is that fewer of them survive to be asked: the wagon is now
      // in contact with the cars it is hiding between, which writes them off.
      // Hence twelve seeds rather than six.
      //
      // WHAT IS PINNED IS THE RATE, over a real road rather than a staged one,
      // because the answer is the vehicle's own hash and a handful of cars is a
      // handful of coin flips. A third of them, give or take the ones whose
      // other lane was occupied when they were asked.
      let asked = 0;
      let swerved = 0;
      for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
        const state = drive({ seed });
        const seen = new Set<number>();
        // The marking between the two lanes running his way.
        const line = laneCenter(2) + DRIVE.laneWidth / 2;
        for (let t = 0; t < 60000; t += 16) {
          if (state.outcome !== DRIVE_OUTCOME.driving) break;
          state.car.pos.y = line;
          stepDrive(state, 16, { pedal: 0.5, wheel: 0 });
          // Held there through the tick as well: the collisions and the shunts
          // both move the wagon, and a hero who is knocked off the line is not
          // the thing this is measuring.
          state.car.pos.y = line;
          for (const one of state.traffic) {
            if (seen.has(one.id) || !one.lured) continue;
            seen.add(one.id);
            asked++;
            // Asked and ANSWERED on the same tick — the driver's intended lane
            // is now the other half of the pair, which is the swerve.
            if (one.lane !== laneAt(one.pos.y)) swerved++;
          }
        }
      }
      expect(asked).toBeGreaterThan(15);
      const rate = swerved / asked;
      expect(rate).toBeGreaterThan(0.12);
      expect(rate).toBeLessThan(0.5);
    },
    ROAD_TIMEOUT_MS,
  );

  it("leaves everybody alone while he is in a lane like everybody else", () => {
    // The punishment is for the LINE, and only for the line. A player driving
    // where the paint says to drive must never have a car move over onto him,
    // or the road is cheating rather than answering.
    let asked = 0;
    for (const seed of [1, 2, 3, 4]) {
      const state = drive({ seed });
      const middle = laneCenter(2);
      for (let t = 0; t < 40000; t += 16) {
        if (state.outcome !== DRIVE_OUTCOME.driving) break;
        state.car.pos.y = middle;
        stepDrive(state, 16, { pedal: 0.5, wheel: 0 });
        state.car.pos.y = middle;
        for (const one of state.traffic) if (one.lured) asked++;
      }
    }
    expect(asked).toBe(0);
  });

  it("never moves over into a lane that already has somebody in it", () => {
    // NOBODY OUT HERE CHANGES LANES INTO THE SIDE OF SOMEBODY ELSE. A driver
    // that hit a stranger to reach the man on the marking would be the road
    // cheating in the one way the player would actually see.
    const state = empty();
    state.car.pos.y = laneCenter(2) + DRIVE.laneWidth / 2;
    // Both halves of the pair occupied, abreast, for every candidate.
    for (let i = 0; i < 12; i++) {
      plant(state, "traffic_sedan", 300 + i * 120, 2, 240);
      plant(state, "traffic_sedan", 300 + i * 120, 3, 240);
    }
    const born = state.traffic.map((one) => ({ one, lane: laneAt(one.pos.y) }));
    for (let t = 0; t < 6000; t += 16) {
      const line = laneCenter(2) + DRIVE.laneWidth / 2;
      state.car.pos.y = line;
      stepDrive(state, 16, { pedal: 0.3, wheel: 0 });
      state.car.pos.y = line;
    }
    // They were asked…
    expect(born.some(({ one }) => one.lured)).toBe(true);
    // …and not one of them took a lane that was taken.
    for (const { one, lane } of born) expect(one.lane).toBe(lane);
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
  it(
    "seldom shuts both of the hero's lanes at once on EASY, and does on the hard rungs",
    () => {
      // THE ONE THING THAT CAN MAKE THIS MINIGAME UNFAIR is a screen with both
      // lanes running the hero's way shut at the same point on the road: he cannot
      // brake his way out of it and he cannot go round it, so the only thing left
      // is to pick which car to hit, which is a coin landing on its edge rather
      // than a decision. EASY states that it will not happen; the hard rungs
      // deliberately make no such promise.
      //
      // MEASURED OVER SIXTY-FOUR ROADS, AND IT HAS TO BE. This fraction is
      // CHAOTIC in the input: the hero's own trajectory decides where he meets
      // the traffic, and every car's lane-change decision is taken against his
      // position — so a thousandth of a percent added to ONE body's weight
      // moves the answer by half of itself. On four roads the number is
      // therefore whatever those four roads happened to do (it read 0.02 on
      // the seeds this test opened with, and 0.08 on the next four), which is a
      // threshold that passes by luck and fails on an unrelated change.
      //
      // SIXTEEN WAS NOT ENOUGH EITHER, which is what the previous note here
      // claimed and what a wider sample disproved: on sixteen roads the HARD
      // fraction swung between 0.08 and 0.21 across re-seedings that changed
      // nothing about the road's tuning, so `hard > 2 × easy` was a coin toss
      // rather than a claim. Sixty-four settles it to about a sixth of itself
      // — EASY lands near 0.06 and the hard rungs near 0.13 — and the seeds are
      // GENERATED rather than listed, so the sample cannot quietly become a
      // lucky hand-picked one.
      //
      // WHAT IS ASSERTED IS THE RATIO, not either number: the point is that one
      // rung promises a way through and the other does not, and a bound that
      // pins the absolute fraction would be a tuning test wearing a fairness
      // test's name.
      const shutFrac = (difficulty: "easy" | "hard"): number => {
        let both = 0;
        let ticks = 0;
        for (const seed of Array.from({ length: 64 }, (_, i) => 1 + i * 37)) {
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
                // …AND THE FOOTWAY IS NOT A LANE. `laneAt` CLAMPS, so a
                // delivery rider on the near pavement — which is outside the
                // painted road altogether — reads as sitting in the hero's own
                // kerbside lane, and one on the far pavement as sitting in lane
                // 0. What this measures is the promise the LANE traffic makes
                // (`ai.ts` skips a footway rider from its own reasoning for
                // exactly the same reason), so counting the delivery trade made
                // the fairness of a rung a function of how busy the pavements
                // are.
                if (one.footway) return false;
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
      // A tenth of the leg at the outside, and only where a lane change has
      // just put two of them level for a moment — a screenful he drives out of
      // rather than a wall he arrives at.
      expect(easy).toBeLessThan(0.12);
      // …and the rung that promises nothing shuts both markedly more often,
      // which is the difference being a difficulty rather than a bug fix. HALF
      // AGAIN rather than DOUBLE: over sixty-four roads the measured multiple
      // sits between 1.8 and 2.4 depending only on which sixty-four, so double
      // is inside the noise and 1.4 is outside it.
      expect(shutFrac("hard")).toBeGreaterThan(easy * 1.4);
    },
    ROAD_TIMEOUT_MS,
  );
});
