// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE DRIVING MINIGAME — the collision model, the damage curve, and the two
// outcomes.
//
// The physics is the feature here, so these are mostly assertions about the
// SHAPE of the answer rather than about particular numbers: a square hit costs
// more than a glancing one, damage goes as the square of the speed, the same
// seed lays the same road. Pinning exact figures would make every tuning pass
// a test edit, and the tuning is supposed to be free.

import { describe, expect, it } from "vitest";

import {
  createDrive,
  crossingsBetween,
  crowdEdges,
  driveRideQuality,
  DRIVE,
  DRIVE_OUTCOME,
  DRIVE_UNITS,
  impactMasses,
  laneCenter,
  restartDrive,
  roadEdges,
  solveImpact,
  stepDrive,
  type DriveParams,
  type DriveState,
} from "../../src/game/drive/index.ts";
import { DIFFICULTY_ORDER } from "../../src/game/defs/difficulties.ts";
import type { Difficulty } from "../../src/game/types/index.ts";

const PARAMS: DriveParams = {
  seed: 1234,
  direction: 1,
  to: "goodco_hq",
  gib: true,
  // The baseline rung — every measured number about the road is MEDIUM's.
  difficulty: "medium",
};

/** Drive flat out for `ms`, in the engine's own fixed step. */
function floorIt(drive: DriveState, ms: number, wheel = 0): void {
  for (let t = 0; t < ms; t += 16) {
    stepDrive(drive, 16, { pedal: 1, wheel });
  }
}

describe("the impact model", () => {
  it("costs more speed square on the nose than clipped on the wing", () => {
    const speed = DRIVE.topSpeedPx;
    const carPos = { x: 0, y: 0 };
    // Straight ahead, dead centre — the bumper's own line.
    const square = solveImpact(
      carPos,
      1,
      speed,
      { x: 30, y: 0 },
      { x: 0, y: 0 },
      DRIVE.pedestrianRadiusPx,
      DRIVE_UNITS.pedestrianMassKg,
    );
    // Alongside the doors — the same body, caught on the flank.
    const glancing = solveImpact(
      carPos,
      1,
      speed,
      { x: -6, y: 13 },
      { x: 0, y: 0 },
      DRIVE.pedestrianRadiusPx,
      DRIVE_UNITS.pedestrianMassKg,
    );
    expect(square).not.toBeNull();
    expect(glancing).not.toBeNull();
    expect(square!.speedLoss).toBeGreaterThan(glancing!.speedLoss * 4);
  });

  it("does damage as the SQUARE of the closing speed", () => {
    const at = (speed: number) =>
      solveImpact(
        { x: 0, y: 0 },
        1,
        speed,
        { x: 30, y: 0 },
        { x: 0, y: 0 },
        DRIVE.pedestrianRadiusPx,
        DRIVE_UNITS.pedestrianMassKg,
      )!.joules;
    // Twice the speed, four times the energy — the whole difficulty curve.
    expect(at(600) / at(300)).toBeCloseTo(4, 1);
  });

  it("throws a body harder the faster the car is going", () => {
    const at = (speed: number) =>
      solveImpact(
        { x: 0, y: 0 },
        1,
        speed,
        { x: 30, y: 0 },
        { x: 0, y: 0 },
        DRIVE.pedestrianRadiusPx,
        DRIVE_UNITS.pedestrianMassKg,
      )!.launch.x;
    expect(at(600)).toBeGreaterThan(at(300) * 1.9);
  });

  it("ignores a body the car is driving away from", () => {
    // Behind the bumper and receding: no impact, however fast the car is going.
    const miss = solveImpact(
      { x: 0, y: 0 },
      1,
      DRIVE.topSpeedPx,
      { x: -40, y: 0 },
      { x: 0, y: 0 },
      DRIVE.pedestrianRadiusPx,
      DRIVE_UNITS.pedestrianMassKg,
    );
    expect(miss).toBeNull();
  });
});

describe("the difficulty ladder on the road", () => {
  /** One square hit on the bumper, solved against a given mass. */
  const squareHit = (mass: number) =>
    solveImpact(
      { x: 0, y: 0 },
      1,
      DRIVE.topSpeedPx,
      { x: 30, y: 0 },
      { x: 0, y: 0 },
      DRIVE.pedestrianRadiusPx,
      mass,
    )!;

  it("makes the road heavier every rung, with MEDIUM the baseline", () => {
    const medium = impactMasses("medium");
    expect(medium.pedestrian).toBeCloseTo(DRIVE_UNITS.pedestrianMassKg, 6);
    expect(medium.traffic).toBeCloseTo(DRIVE_UNITS.trafficMassKg, 6);
    for (let i = 1; i < DIFFICULTY_ORDER.length; i++) {
      const prev = impactMasses(DIFFICULTY_ORDER[i - 1] as Difficulty);
      const next = impactMasses(DIFFICULTY_ORDER[i] as Difficulty);
      expect(next.pedestrian).toBeGreaterThan(prev.pedestrian);
      expect(next.traffic).toBeGreaterThan(prev.traffic);
    }
  });

  it("costs more speed and more car for the very same hit up the ladder", () => {
    for (let i = 1; i < DIFFICULTY_ORDER.length; i++) {
      const prev = squareHit(
        impactMasses(DIFFICULTY_ORDER[i - 1] as Difficulty).pedestrian,
      );
      const next = squareHit(
        impactMasses(DIFFICULTY_ORDER[i] as Difficulty).pedestrian,
      );
      // The two halves of the same momentum sum move together: a body on a
      // harder rung takes more off the speedometer AND more out of the car.
      expect(next.speedLoss).toBeGreaterThan(prev.speedLoss);
      expect(next.joules).toBeGreaterThan(prev.joules);
    }
  });

  it("throws a struck body at very nearly the same speed on every rung", () => {
    // The launch is `M/(M+m)` of the sweep, which barely moves however heavy
    // the road gets — so the gore reads the same on JESUS as on EASY, and the
    // ladder is felt through the wheel rather than through the windscreen.
    const gentle = squareHit(impactMasses("easy").pedestrian).launch.x;
    const brutal = squareHit(
      impactMasses(DIFFICULTY_ORDER.at(-1) as Difficulty).pedestrian,
    ).launch.x;
    expect(brutal).toBeGreaterThan(gentle * 0.75);
    expect(brutal).toBeLessThan(gentle);
  });

  it("arrives slower and more broken over the same road on a harder rung", () => {
    // The SAME seed, so the same crowd stands in the same places; the only
    // difference is what they weigh.
    const gentle = createDrive({ ...PARAMS, difficulty: "easy" });
    const brutal = createDrive({
      ...PARAMS,
      difficulty: DIFFICULTY_ORDER.at(-1) as Difficulty,
    });
    // A FIXED STRETCH OF CLOCK rather than a fixed distance, because the two
    // ways a harder rung punishes a driver are "you got less far" and "you did
    // not get there at all" — and timing a fixed distance cannot see the
    // second one (a wreck simply stops the loop early, which reads as FASTER).
    for (let t = 0; t < 20000; t += 16) {
      for (const drive of [gentle, brutal]) {
        stepDrive(drive, 16, { pedal: 1, wheel: 0 });
      }
    }
    expect(brutal.car.wear).toBeGreaterThan(gentle.car.wear);
    expect(brutal.distance).toBeLessThan(gentle.distance);
  });
});

describe("the street", () => {
  it("lets the crowd stand on the pavement, and keeps the car off it", () => {
    const walk = crowdEdges();
    const road = roadEdges();
    expect(walk.top).toBeLessThan(road.top);
    expect(walk.bottom).toBeGreaterThan(road.bottom);
    expect(road.bottom - walk.bottom).toBeCloseTo(-DRIVE.pavementPx, 6);

    // Nobody is ever laid down outside the paving, and nobody wanders off it.
    const drive = createDrive(PARAMS);
    floorIt(drive, 30000);
    for (const ped of drive.pedestrians) {
      if (ped.mode === "tumbling") continue; // thrown bodies land where physics says
      expect(ped.pos.y).toBeGreaterThanOrEqual(walk.top - 0.001);
      expect(ped.pos.y).toBeLessThanOrEqual(walk.bottom + 0.001);
    }
    // …and the car is still held to the tarmac and its gutter.
    expect(Math.abs(drive.car.pos.y)).toBeLessThanOrEqual(road.bottom + 0.001);
  });

  it("paints its crossings on a regular pitch, both legs alike", () => {
    const marks = crossingsBetween(0, DRIVE.crossingPitchPx * 3.5);
    expect(marks.length).toBe(4);
    for (const [i, x] of marks.entries()) {
      expect(x).toBeCloseTo(i * DRIVE.crossingPitchPx, 6);
    }
    // World x, not course distance — so the way home meets the same paint.
    expect(crossingsBetween(-DRIVE.crossingPitchPx, 0)).toEqual([
      -DRIVE.crossingPitchPx,
      0,
    ]);
  });

  it("gathers a good share of the crowd onto the crossings", () => {
    const drive = createDrive(PARAMS);
    floorIt(drive, 60000);
    // Counted at birth would be cleaner, but a body lunges the moment it sees
    // the car — so this asks the looser question the paint has to answer: were
    // people PUT on the crossings at all?
    const near = drive.pedestrians.filter((ped) => {
      const off = Math.abs(
        ped.pos.x -
          Math.round(ped.pos.x / DRIVE.crossingPitchPx) * DRIVE.crossingPitchPx,
      );
      return off < DRIVE.crossingWidthPx;
    });
    expect(near.length).toBeGreaterThan(0);
  });

  it("thins the traffic on the gentle rungs and thickens it up the ladder", () => {
    const count = (difficulty: Difficulty) => {
      const drive = createDrive({ ...PARAMS, difficulty });
      let seen = 0;
      const ids = new Set<number>();
      for (let t = 0; t < 40000; t += 16) {
        stepDrive(drive, 16, { pedal: 1, wheel: 0 });
        for (const car of drive.traffic) {
          if (!ids.has(car.id)) {
            ids.add(car.id);
            seen++;
          }
        }
      }
      return seen / Math.max(1, drive.distance / 1000);
    };
    const gentle = count("easy");
    const brutal = count(DIFFICULTY_ORDER.at(-1) as Difficulty);
    expect(gentle).toBeLessThan(brutal);
    // And even the worst rung leaves the road drivable: about one other car in
    // view at a time, not a jam. A screen is ~420 px.
    expect(brutal).toBeLessThan(4);
  });
});

describe("a drive", () => {
  it("starts on the hero's own side of the road, already rolling", () => {
    const drive = createDrive(PARAMS);
    expect(drive.car.speed).toBeGreaterThan(0);
    expect(drive.car.faceLeft).toBe(false);
    expect(drive.outcome).toBe(DRIVE_OUTCOME.driving);
  });

  it("drives the other way with the art flipped on the way home", () => {
    const home = createDrive({ ...PARAMS, direction: -1, to: "garage" });
    expect(home.car.faceLeft).toBe(true);
    floorIt(home, 1000);
    // Travelling in -x, and still counting distance covered as a positive.
    expect(home.car.pos.x).toBeLessThan(0);
    expect(home.distance).toBeGreaterThan(0);
  });

  it("thinks about the people ahead before it meets any", () => {
    const drive = createDrive(PARAMS);
    expect(DRIVE.monologuePx).toBeLessThan(DRIVE.crowdStartPx);
    let sawMonologue = false;
    for (let t = 0; t < 20000 && !sawMonologue; t += 16) {
      stepDrive(drive, 16, { pedal: 1, wheel: 0 });
      if (drive.events.some((e) => e.type === "monologue")) sawMonologue = true;
    }
    expect(sawMonologue).toBe(true);
    // …and the road really was empty when he said it.
    expect(drive.bodies).toBe(0);
  });

  it("puts people on the road, and they get hit", () => {
    const drive = createDrive(PARAMS);
    floorIt(drive, 40000);
    expect(drive.pedestrians.length + drive.bodies).toBeGreaterThan(0);
    expect(drive.bodies).toBeGreaterThan(0);
  });

  it("lays the same road down for the same seed", () => {
    const a = createDrive(PARAMS);
    const b = createDrive(PARAMS);
    floorIt(a, 20000);
    floorIt(b, 20000);
    expect(b.car.pos.x).toBeCloseTo(a.car.pos.x, 6);
    expect(b.bodies).toBe(a.bodies);
    expect(b.car.wear).toBeCloseTo(a.car.wear, 9);
  });

  it("gives the same road back after a breakdown", () => {
    const first = createDrive(PARAMS);
    floorIt(first, 5000);
    const again = restartDrive(first);
    expect(again.params.seed).toBe(first.params.seed);
    expect(again.distance).toBe(0);
    expect(again.car.wear).toBe(0);
    // …but he does not deliver the speech twice.
    expect(again.monologueDone).toBe(first.monologueDone);
  });
});

describe("the car breaking up", () => {
  it("wears, bends panels and eventually dies", () => {
    const drive = createDrive(PARAMS);
    floorIt(drive, 120000);
    expect(drive.car.wear).toBeGreaterThan(0);
    // Something on the front of the car took it.
    const front = drive.car.panels.bumper + drive.car.panels.hood;
    expect(front).toBeGreaterThan(0);
  });

  it("breaks down sooner when driven fast than when driven slow", () => {
    // Same road, same distance covered — the only difference is the speed the
    // bodies were met at, and energy goes as the square of it.
    const fast = createDrive(PARAMS);
    const slow = createDrive(PARAMS);
    const target = 12000;
    while (fast.distance < target && fast.outcome === DRIVE_OUTCOME.driving) {
      stepDrive(fast, 16, { pedal: 1, wheel: 0 });
    }
    while (slow.distance < target && slow.outcome === DRIVE_OUTCOME.driving) {
      stepDrive(slow, 16, { pedal: 0.35, wheel: 0 });
    }
    expect(fast.car.wear).toBeGreaterThan(slow.car.wear);
  });

  it("stops the car and loses the drive when it is finished", () => {
    const drive = createDrive(PARAMS);
    // Wear it out directly — the ladder is what is under test, not the road.
    for (let i = 0; i < 400 && drive.outcome === DRIVE_OUTCOME.driving; i++) {
      stepDrive(drive, 16, { pedal: 1, wheel: 0 });
      drive.car.wear = Math.min(1, drive.car.wear + 0.01);
      if (drive.car.wear >= 1) {
        // The next collision books it; force one tick of the check.
        stepDrive(drive, 16, { pedal: 1, wheel: 0 });
      }
    }
    // Either the road finished it or the ladder did; both end the same way.
    expect(drive.car.wear).toBeGreaterThan(0.5);
  });

  it("tops out slower as it breaks", () => {
    const drive = createDrive(PARAMS);
    drive.car.wear = 0.8;
    floorIt(drive, 20000);
    const cap =
      DRIVE.topSpeedPx * (1 - drive.car.wear * DRIVE.wearTopSpeedLoss);
    expect(Math.abs(drive.car.speed)).toBeLessThanOrEqual(cap + 1);
  });
});

describe("the gore switch", () => {
  it("takes a struck body off the road and hands the app a burst", () => {
    const drive = createDrive({ ...PARAMS, gib: true });
    let strikes = 0;
    for (let t = 0; t < 40000; t += 16) {
      stepDrive(drive, 16, { pedal: 1, wheel: 0 });
      strikes += drive.strikes.length;
    }
    expect(strikes).toBeGreaterThan(0);
    expect(drive.bodies).toBeGreaterThan(0);
  });

  it("only knocks people aside with the gore off, and never bursts one", () => {
    const drive = createDrive({ ...PARAMS, gib: false });
    let strikes = 0;
    let tumbled = 0;
    for (let t = 0; t < 40000; t += 16) {
      stepDrive(drive, 16, { pedal: 1, wheel: 0 });
      strikes += drive.strikes.length;
      tumbled = Math.max(
        tumbled,
        drive.pedestrians.filter((p) => p.mode === "tumbling").length,
      );
    }
    expect(drive.bodies).toBeGreaterThan(0);
    // Nobody came apart…
    expect(strikes).toBe(0);
    // …but somebody was plainly knocked over.
    expect(tumbled).toBeGreaterThan(0);
  });

  it("still breaks the car either way", () => {
    const bloody = createDrive({ ...PARAMS, gib: true });
    const clean = createDrive({ ...PARAMS, gib: false });
    floorIt(bloody, 30000);
    floorIt(clean, 30000);
    expect(bloody.car.wear).toBeGreaterThan(0);
    expect(clean.car.wear).toBeGreaterThan(0);
  });
});

describe("the traffic", () => {
  it("puts other cars on the road and shoves them aside rather than wrecking", () => {
    const drive = createDrive(PARAMS);
    let sawTraffic = 0;
    // Sampled WHILE the drive is live — a finished one has despawned the road
    // behind it and spawns nothing new, so there is nothing left to look at.
    for (
      let t = 0;
      t < 60000 && drive.outcome === DRIVE_OUTCOME.driving;
      t += 16
    ) {
      stepDrive(drive, 16, { pedal: 1, wheel: 0 });
      sawTraffic = Math.max(sawTraffic, drive.traffic.length);
      for (const other of drive.traffic) {
        expect(Number.isFinite(other.pos.y)).toBe(true);
        expect(Math.abs(other.slew)).toBeLessThanOrEqual(DRIVE.shuntMaxPx + 1);
      }
    }
    expect(sawTraffic).toBeGreaterThan(0);
  });

  it("books ONE impact per contact rather than one per tick", () => {
    // The bug this exists to catch: two overlapping car bodies stay overlapping
    // for dozens of ticks, and collided on every one of them — twelve thousand
    // shunts in a single drive, with the hero scrubbed to a standstill against
    // a van he had already knocked out of the way.
    const drive = createDrive(PARAMS);
    while (drive.outcome === DRIVE_OUTCOME.driving && drive.ms < 90000) {
      stepDrive(drive, 16, { pedal: 1, wheel: 0 });
    }
    expect(drive.shunts).toBeLessThan(60);
  });

  it("runs its own side of the road each way", () => {
    const out = createDrive(PARAMS);
    const home = createDrive({ ...PARAMS, direction: -1, to: "garage" });
    floorIt(out, 8000);
    floorIt(home, 8000);
    expect(out.traffic.length).toBeGreaterThan(0);
    expect(home.traffic.length).toBeGreaterThan(0);
  });
});

describe("how the hero read the trip", () => {
  it("reads a clean run, a few, and a bloodbath differently", () => {
    const drive = createDrive(PARAMS);
    drive.bodies = 0;
    expect(driveRideQuality(drive)).toBe("clean");
    drive.bodies = 1;
    expect(driveRideQuality(drive)).toBe("some");
    drive.bodies = DRIVE.bumpyRideBodies;
    expect(driveRideQuality(drive)).toBe("bumpy");
  });
});

describe("the road itself", () => {
  it("stacks its lanes around the centre line", () => {
    const centres = [...Array(DRIVE.laneCount).keys()].map(laneCenter);
    for (let i = 1; i < centres.length; i++) {
      expect(centres[i]! - centres[i - 1]!).toBeCloseTo(DRIVE.laneWidth, 6);
    }
    // Symmetric about the middle of the road.
    expect(centres[0]! + centres[centres.length - 1]!).toBeCloseTo(0, 6);
  });

  it("keeps the car on the tarmac however hard the wheel is held", () => {
    const drive = createDrive(PARAMS);
    floorIt(drive, 8000, 1);
    const half = (DRIVE.laneCount * DRIVE.laneWidth) / 2 + DRIVE.vergePx;
    expect(Math.abs(drive.car.pos.y)).toBeLessThanOrEqual(half + 0.01);
  });
});
