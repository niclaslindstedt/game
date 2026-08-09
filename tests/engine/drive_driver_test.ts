// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE DRIVE'S AUTO-DRIVER — the one that takes the wheel for the attract loop,
// a `?bot=` playtest and `make drive-bench`.
//
// What is worth pinning here is the SHAPE of the driving and the two guarantees
// everything downstream stands on — that it steers around things rather than
// through them, and that it never touches the road's dice. The particular
// numbers (how many bodies, how many seconds) belong to the bench, not to a
// test: they move with every tune of the crowd, and a test that pinned them
// would make the tuning the test's problem.

import { describe, expect, it } from "vitest";

import {
  courseLength,
  createDrive,
  createDriveDriver,
  driveDriverInput,
  laneAt,
  laneCenter,
  roadEdges,
  stepDrive,
  DRIVE,
  DRIVE_BOT_DEFAULTS,
  DRIVE_OUTCOME,
  type DriveParams,
  type DriveState,
} from "../../engine/game/drive/index.ts";
import { laneRunsWithHero } from "../../engine/game/drive/traffic.ts";

const PARAMS: DriveParams = {
  seed: 4242,
  direction: 1,
  to: "goodco_hq",
  gib: true,
  split: true,
  difficulty: "medium",
};

/** Play a whole leg with the auto-driver and hand back what it cost. */
function autoDrive(
  params: DriveParams,
  capMs = 200000,
): { drive: DriveState; ticks: number } {
  const drive = createDrive(params);
  const driver = createDriveDriver();
  let ticks = 0;
  while (drive.outcome === DRIVE_OUTCOME.driving && drive.ms < capMs) {
    stepDrive(drive, 16, driveDriverInput(driver, drive));
    ticks++;
  }
  return { drive, ticks };
}

describe("the auto-driver", () => {
  it("gets the car to GOODCO on every rung", () => {
    // The bar the attract loop and every shot recipe actually stand on: a
    // driver that broke down on the hard rungs would leave the demo watching a
    // wreck restart the same road for the rest of its life.
    for (const difficulty of ["easy", "medium", "jesus"] as const) {
      const { drive } = autoDrive({ ...PARAMS, difficulty });
      expect(drive.outcome).toBe(DRIVE_OUTCOME.arrived);
      expect(drive.distance).toBeGreaterThanOrEqual(courseLength(drive.params));
    }
  });

  it("holds the throttle — it does not coast to a stop", () => {
    // The bug this whole driver exists to fix: a road with nobody at the wheel
    // coasts down from its opening 28% and stops.
    const drive = createDrive(PARAMS);
    const driver = createDriveDriver();
    const opening = drive.car.speed;
    for (let t = 0; t < 6000; t += 16) {
      stepDrive(drive, 16, driveDriverInput(driver, drive));
    }
    // Faster than it was handed the wheel at, and above the floor the driver
    // itself promises never to go under — which is the claim, said in the
    // driver's own terms rather than as a number that has to be re-tuned every
    // time the crowd is. (A thicker crowd genuinely slows it: `threatSlowFrac`
    // buys the time to thread, and that is the driver working, not failing.)
    expect(drive.car.speed).toBeGreaterThan(opening);
    expect(drive.car.speed).toBeGreaterThan(
      DRIVE.topSpeedPx * DRIVE_BOT_DEFAULTS.floorFrac,
    );
  });

  it("costs the car far less than driving in a straight line does", () => {
    // Steering is the whole point, and the cheapest way to prove it is worth
    // something is to compare the SAME road driven both ways.
    const straight = createDrive(PARAMS);
    while (straight.outcome === DRIVE_OUTCOME.driving && straight.ms < 200000) {
      stepDrive(straight, 16, { pedal: 1, wheel: 0 });
    }
    const { drive: steered } = autoDrive(PARAMS);
    // THE CAR is the headline: the straight line wrecks it, the driver arrives.
    expect(steered.car.wear).toBeLessThan(straight.car.wear);
    expect(steered.outcome).toBe(DRIVE_OUTCOME.arrived);
    // …and NOT the body count, which is worth being explicit about because it
    // is the design rather than a shortcoming. At the crowd this road carries
    // (`DRIVE.pedestriansPerKPx`) the tarmac is saturated: a body every hundred
    // pixels across a band eight car-widths wide, so per mile of road the
    // driver meets exactly as many people as a straight line does. What the
    // wheel is FOR here is the traffic, the kerb and the car — and the tally
    // the hero files under road surface is the one thing on this road nobody
    // can drive their way out of, which is the joke the whole minigame is
    // built to land.
    expect(steered.bodies).toBeGreaterThan(0);
  });

  it("still cannot thread the road clean — nobody can", () => {
    // The design (`DRIVE.pedestriansPerKPx`): the hero is meant to arrive
    // unable to claim it was avoidable. A driver that got the count to zero
    // would be evidence the crowd had been thinned, not that the bot was good.
    const { drive } = autoDrive(PARAMS);
    expect(drive.bodies).toBeGreaterThan(0);
  });

  it("spends the road's own rng on the road and nothing else", () => {
    // THE GUARANTEE EVERY REPLAY STANDS ON. The seeded stream lays down every
    // body, every variant and every wander phase in a fixed order — so a draw
    // spent on a steering decision would move every person met after it. Drive
    // the same seed twice, once by hand and once by the driver, and the road
    // has to lay down the SAME people at the same marks.
    const byHand = createDrive(PARAMS);
    const byBot = createDrive(PARAMS);
    const driver = createDriveDriver();
    for (let t = 0; t < 4000; t += 16) {
      // Both cars are held at the same speed so they reach the same marks; only
      // the WHEEL differs, which is the only thing the driver would be
      // spending a draw on.
      stepDrive(byHand, 16, { pedal: 1, wheel: 0 });
      const bot = driveDriverInput(driver, byBot);
      stepDrive(byBot, 16, { pedal: 1, wheel: bot.wheel });
    }
    expect(byBot.nextPedestrianAt).toBeCloseTo(byHand.nextPedestrianAt, 6);
    expect(byBot.nextTrafficAt).toEqual(byHand.nextTrafficAt);
    expect(byBot.nextPavementAt).toBeCloseTo(byHand.nextPavementAt, 6);
    expect(byBot.pedestrians.map((p) => p.variant)).toEqual(
      byHand.pedestrians.map((p) => p.variant),
    );
    expect(byBot.pedestrians.map((p) => p.phase)).toEqual(
      byHand.pedestrians.map((p) => p.phase),
    );
  });

  it("replays a leg exactly", () => {
    const a = autoDrive(PARAMS);
    const b = autoDrive(PARAMS);
    expect(b.ticks).toBe(a.ticks);
    expect(b.drive.bodies).toBe(a.drive.bodies);
    expect(b.drive.shunts).toBe(a.drive.shunts);
    expect(b.drive.car.wear).toBeCloseTo(a.drive.car.wear, 10);
  });

  it("steers around a body planted dead ahead", () => {
    const drive = createDrive(PARAMS);
    const driver = createDriveDriver();
    drive.car.speed = DRIVE.topSpeedPx * 0.7;
    drive.pedestrians.push({
      id: drive.nextId++,
      pos: { x: drive.car.pos.x + 400, y: drive.car.pos.y },
      vel: { x: 0, y: 0 },
      mode: "afoot",
      kind: "walker",
      bark: -1,
      variant: 0,
      phase: 0,
      z: 0,
      vz: 0,
      counted: false,
      crushed: false,
    });
    const wheel = driveDriverInput(driver, drive).wheel;
    expect(Math.abs(wheel)).toBeGreaterThan(0);
  });

  it("keeps to its own side of the road when it can", () => {
    // An oncoming lane closes at the sum of both speeds, so it is somewhere to
    // pass through and never somewhere to settle.
    const drive = createDrive(PARAMS);
    const driver = createDriveDriver();
    let onSide = 0;
    let samples = 0;
    while (drive.outcome === DRIVE_OUTCOME.driving && drive.ms < 200000) {
      stepDrive(drive, 16, driveDriverInput(driver, drive));
      samples++;
      if (laneRunsWithHero(laneAt(drive.car.pos.y), drive.params.direction))
        onSide++;
    }
    expect(drive.outcome).toBe(DRIVE_OUTCOME.arrived);
    expect(onSide / samples).toBeGreaterThan(0.8);
  });

  it("nurses a badly bent car rather than trying to win the leg", () => {
    // The ease is on WEAR, so the same road on the same tick asks for less
    // throttle once the wagon is falling apart.
    const fresh = createDrive(PARAMS);
    const bent = createDrive(PARAMS);
    bent.car.wear = 0.95;
    // Both flat out already, so the only question left is whether the pedal
    // comes off.
    fresh.car.speed = DRIVE.topSpeedPx * 0.5;
    bent.car.speed = DRIVE.topSpeedPx * 0.5;
    const freshPedal = driveDriverInput(createDriveDriver(), fresh).pedal;
    const bentPedal = driveDriverInput(createDriveDriver(), bent).pedal;
    expect(freshPedal).toBe(1);
    expect(bentPedal).toBeLessThan(freshPedal);
  });

  it("never asks for a line off the tarmac", () => {
    const drive = createDrive(PARAMS);
    const driver = createDriveDriver();
    const edges = roadEdges();
    while (drive.outcome === DRIVE_OUTCOME.driving && drive.ms < 200000) {
      stepDrive(drive, 16, driveDriverInput(driver, drive));
      expect(drive.car.pos.y).toBeGreaterThanOrEqual(edges.top - 1e-6);
      expect(drive.car.pos.y).toBeLessThanOrEqual(edges.bottom + 1e-6);
    }
  });

  it("takes its hands off a finished road", () => {
    const drive = createDrive(PARAMS);
    const driver = createDriveDriver();
    drive.outcome = DRIVE_OUTCOME.broken;
    expect(driveDriverInput(driver, drive)).toEqual({ pedal: 0, wheel: 0 });
  });

  it("drops its committed line when a breakdown rewinds the clock", () => {
    // `restartDrive` rebuilds the road with `ms` back at zero and hands the
    // same driver the wheel, so a commit timer left in the future would hold a
    // dead line for the whole of the first minute.
    const drive = createDrive(PARAMS);
    const driver = createDriveDriver();
    for (let t = 0; t < 20000; t += 16) {
      stepDrive(drive, 16, driveDriverInput(driver, drive));
      if (drive.outcome !== DRIVE_OUTCOME.driving) break;
    }
    expect(driver.committedMs).toBeGreaterThan(0);
    const restarted = createDrive(PARAMS);
    driveDriverInput(driver, restarted);
    expect(driver.committedMs).toBe(0);
  });
});

describe("the driver and the kerb", () => {
  it("does not settle in the gutter and grind the street furniture down", () => {
    // THE REGRESSION THIS EXISTS FOR. The moment the kerb became solid, the
    // gutter was still the emptiest-LOOKING line on a road this peopled — and
    // the driver could not see a lamp post at all, so it sat there and clouted
    // a standard every hundred pixels until the car died. The bench went from
    // 60 legs in 60 to ZERO on every rung, and nothing else in the suite had an
    // opinion about it.
    const { drive } = autoDrive(PARAMS);
    expect(drive.outcome).toBe(DRIVE_OUTCOME.arrived);
    // A leg's worth of road carries a couple of hundred posts. Clipping the odd
    // one while threading a knot is fine; living in the gutter is not.
    expect(drive.posts).toBeLessThan(12);
  });

  it("weighs a post between a person and a car", () => {
    // It does not flinch and it does not crumple, so it is worth more to miss
    // than somebody who might step back — and less than a car, which can end
    // the leg in three.
    expect(DRIVE_BOT_DEFAULTS.propCost).toBeGreaterThan(
      DRIVE_BOT_DEFAULTS.bodyCost,
    );
    expect(DRIVE_BOT_DEFAULTS.propCost).toBeLessThan(
      DRIVE_BOT_DEFAULTS.trafficCost,
    );
  });
});

describe("the driver's knobs", () => {
  it("comes from content/bot.yaml, layered over the shipped defaults", () => {
    const bent = createDriveDriver({ cruiseFrac: 0.4 });
    expect(bent.tune.cruiseFrac).toBe(0.4);
    // Everything not named keeps the shipped value.
    expect(bent.tune.lookaheadSec).toBe(DRIVE_BOT_DEFAULTS.lookaheadSec);
  });

  it("drives slower with a slower cruise", () => {
    const quick = autoDrive(PARAMS);
    const drive = createDrive(PARAMS);
    const slow = createDriveDriver({ cruiseFrac: 0.5, floorFrac: 0.2 });
    let ticks = 0;
    while (drive.outcome === DRIVE_OUTCOME.driving && drive.ms < 400000) {
      stepDrive(drive, 16, driveDriverInput(slow, drive));
      ticks++;
    }
    expect(ticks).toBeGreaterThan(quick.ticks);
  });
});

describe("a shortened leg", () => {
  it("ends where the params say and lays its crowd out to match", () => {
    const short = autoDrive({
      ...PARAMS,
      coursePx: DRIVE.attractCoursePx,
      cityPx: DRIVE.attractCityPx,
    });
    expect(short.drive.outcome).toBe(DRIVE_OUTCOME.arrived);
    expect(short.drive.distance).toBeGreaterThanOrEqual(DRIVE.attractCoursePx);
    // Comfortably shorter than the road a player drives…
    const full = autoDrive(PARAMS);
    expect(short.ticks).toBeLessThan(full.ticks / 2);
    // …but still past its own town gate with room to spare, so the demo shows
    // the ROAD rather than the run-up to it. The demo brings that gate forward
    // as well (`attractCityPx`): a title screen has fifteen seconds to show
    // somebody what this minigame is, and fourteen of them spent on an empty
    // outskirt while a man talks to himself is the whole budget spent on the
    // part that is not the game.
    expect(DRIVE.attractCoursePx).toBeGreaterThan(DRIVE.attractCityPx * 3);
    expect(short.drive.bodies).toBeGreaterThan(0);
  });

  it("leaves a full-length drive exactly as it was", () => {
    expect(courseLength({})).toBe(DRIVE.coursePx);
    expect(courseLength({ coursePx: 900 })).toBe(900);
  });
});

describe("laneAt", () => {
  it("is laneCenter's inverse, and clamps the gutters onto the outside lanes", () => {
    for (let lane = 0; lane < DRIVE.laneCount; lane++) {
      expect(laneAt(laneCenter(lane))).toBe(lane);
    }
    const edges = roadEdges();
    expect(laneAt(edges.top)).toBe(0);
    expect(laneAt(edges.bottom)).toBe(DRIVE.laneCount - 1);
  });
});
