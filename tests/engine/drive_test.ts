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
  breakTrafficLamps,
  createDrive,
  createDriveDriver,
  createTraffic,
  driveDriverInput,
  CROWD_THOUGHTS,
  crossingsBetween,
  crowdEdges,
  driveMph,
  driveVerdict,
  engineRpm,
  gearFor,
  haltTraffic,
  solvedTopSpeedPx,
  DRIVETRAIN,
  GEAR_COUNT,
  fellLamp,
  DRIVE,
  DRIVE_OUTCOME,
  DRIVE_UNITS,
  impactMasses,
  laneAt,
  laneCenter,
  restartDrive,
  roadBandEdges,
  roadEdges,
  solveImpact,
  stepDrive,
  trafficMass,
  vehicleDef,
  type DriveInput,
  type DriveParams,
  type DriveState,
  type DriveTraffic,
} from "../../src/game/drive/index.ts";
import { CAR } from "../../src/game/vehicles.ts";
import { DIFFICULTY_ORDER } from "../../src/game/defs/difficulties.ts";
import type { Difficulty } from "../../src/game/types/index.ts";

const PARAMS: DriveParams = {
  seed: 1234,
  direction: 1,
  to: "goodco_hq",
  gib: true,
  split: true,
  // The baseline rung — every measured number about the road is MEDIUM's.
  difficulty: "medium",
};

/** Drive flat out for `ms`, in the engine's own fixed step. */
function floorIt(drive: DriveState, ms: number, wheel = 0): void {
  for (let t = 0; t < ms; t += 16) {
    stepDrive(drive, 16, { pedal: 1, wheel });
  }
}

/**
 * Drive the WHOLE leg and hand back every walker the road put a thought over,
 * in the order they were laid down.
 *
 * THE WAGON IS HELD IMMORTAL FOR IT (`car.wear = 0` every tick), which is the
 * simulator's own trick and is the only way to see the tail of the deck: a car
 * driven flat out through this crowd breaks down a third of the way along, and a
 * test that stopped there would pass just as happily on a deck that repeats
 * itself after fifteen cards.
 */
function eachWalker(
  drive: DriveState,
  visit: (ped: DriveState["pedestrians"][number]) => void,
): void {
  const seen = new Set<number>();
  for (let t = 0; t < 240_000; t += 16) {
    drive.car.wear = 0;
    stepDrive(drive, 16, { pedal: 1, wheel: 0 });
    for (const ped of drive.pedestrians) {
      if (ped.kind !== "walker" || seen.has(ped.id)) continue;
      seen.add(ped.id);
      visit(ped);
    }
    if (drive.outcome !== DRIVE_OUTCOME.driving) break;
  }
}

/** …which thought each of the ones carrying one had. */
function harvestThoughts(drive: DriveState): number[] {
  const out: number[] = [];
  eachWalker(drive, (ped) => {
    if (ped.bark >= 0) out.push(ped.bark);
  });
  return out;
}

/** …and how many of the leg's people were thinking anything at all. */
function harvestCrowd(drive: DriveState): {
  thinking: number;
  walking: number;
} {
  let thinking = 0;
  let walking = 0;
  eachWalker(drive, (ped) => {
    walking++;
    if (ped.bark >= 0) thinking++;
  });
  return { thinking, walking };
}

/** How long, flat out from a standstill on an empty road, to reach `mph`. */
function secondsTo(mph: number): number {
  const drive = createDrive(PARAMS);
  silence(drive);
  drive.car.speed = 0;
  for (let t = 0; t < 120_000; t += 16) {
    stepDrive(drive, 16, { pedal: 1, wheel: 0 });
    if (driveMph(drive) >= mph) return t / 1000;
  }
  return Infinity;
}

/** Nothing on the road but the car — the crowd and the traffic pushed past the
 * end of the course, so an acceleration run is not measuring collisions. */
function silence(drive: DriveState): void {
  drive.nextPedestrianAt = DRIVE.coursePx * 2;
  haltTraffic(drive, DRIVE.coursePx * 2);
}

describe("the wagon's drivetrain", () => {
  // THE BROCHURE IS THE TEST. Everything below is a claim the source makes out
  // loud (`drive/drivetrain.ts`) about a heavy, tired, tall car — and every one
  // of them is a shape rather than a stopwatch reading, because the ratios and
  // the torque curve are meant to be tuned freely and a pinned figure would
  // make every tuning pass a test edit.

  it("takes about five seconds to reach sixty", () => {
    // THE ONE NUMBER WITH A FLOOR UNDER IT. The road used to accelerate at
    // 2.3 g — nought to sixty in about a second and a quarter — which is not a
    // car, and it made the whole minigame a question of whether you were
    // holding the throttle rather than of how you were driving.
    //
    // THE WINDOW MOVED WITH THE ENGINE. It was eight to fourteen seconds while
    // the wagon had a tired oil-burner in it; the re-engined car is a four
    // hundred horsepower thing that tops out at 280 km/h, and one of those
    // reaches sixty in about five. Three is the floor a wheeled vehicle cannot
    // plausibly beat without slicks; eight is the ceiling the new brochure
    // cannot be honest above.
    const sixty = secondsTo(60);
    expect(sixty).toBeGreaterThan(3);
    expect(sixty).toBeLessThan(8);
  });

  it("takes longer for every twenty after that", () => {
    // Drag goes as the square of speed and the power to beat it as the cube, so
    // each bite is dearer than the last. This is what makes the top of the dial
    // something a driver spends a whole straight earning.
    const marks = [60, 90, 120, 150].map(secondsTo);
    const steps = marks.slice(1).map((t, i) => t - (marks[i] ?? 0));
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]).toBeGreaterThan(steps[i - 1] ?? 0);
    }
  });

  it("changes up on its own, at the shift point, and never past it", () => {
    // THE BOX IS AN AUTOMATIC and nobody drives its clutch: the gear is
    // whichever one carries this road speed without over-revving, so a walk up
    // the whole range must climb through every gear exactly once and never show
    // the crank past where the box lets go of it.
    const seen: number[] = [];
    for (let px = 0; px <= DRIVE.topSpeedPx; px += 1) {
      const gear = gearFor(px);
      if (seen[seen.length - 1] !== gear) seen.push(gear);
      expect(engineRpm(px)).toBeLessThanOrEqual(DRIVETRAIN.shiftUpRpm + 1);
      expect(engineRpm(px)).toBeGreaterThanOrEqual(DRIVETRAIN.idleRpm);
    }
    expect(seen).toEqual([...Array(GEAR_COUNT).keys()]);
  });

  it("reads like a tachometer in a car somebody has driven", () => {
    // THE ONE THE WHOLE RE-GEARING EXISTS FOR, and it is four claims about the
    // NUMBER UNDER THE NEEDLE rather than about how the wagon goes.
    //
    // The box used to change up at the redline: every gear was held against the
    // stop and a wagon pottering along at forty sat in the paint. A real driver
    // with the pedal flat changes up JUST PAST THE POWER PEAK — one more rev
    // buys less at the tyre than the next ratio does — and the red at the end of
    // the face is a thing the car is told about rather than shown.

    // It idles where an engine idles, and standing still is not a gear.
    expect(engineRpm(0)).toBe(DRIVETRAIN.idleRpm);
    expect(DRIVETRAIN.idleRpm).toBeGreaterThanOrEqual(600);
    expect(DRIVETRAIN.idleRpm).toBeLessThanOrEqual(1000);

    // It is let go somewhere a driver would let go of it — high, and still not
    // at the stop. The window is the whole useful top of a petrol engine's
    // range rather than a pinned figure, so the brochure can be retuned.
    expect(DRIVETRAIN.shiftUpRpm).toBeGreaterThan(DRIVETRAIN.redlineRpm * 0.75);
    expect(DRIVETRAIN.shiftUpRpm).toBeLessThan(DRIVETRAIN.redlineRpm * 0.95);

    // Every upshift lands back down the band rather than near the top of it:
    // between a third and four fifths of the way up, which is the difference
    // between a gearbox and a rev limiter with steps in it. The window is wide
    // at the top on purpose — the ratios close as they climb, so the last shift
    // of a five-speed drops the crank least and would be the one to trip a
    // tighter bound.
    let prev = gearFor(0);
    for (let px = 1; px <= DRIVE.topSpeedPx; px += 1) {
      const gear = gearFor(px);
      if (gear === prev) continue;
      prev = gear;
      const landed =
        (engineRpm(px) - DRIVETRAIN.idleRpm) /
        (DRIVETRAIN.shiftUpRpm - DRIVETRAIN.idleRpm);
      expect(landed).toBeGreaterThan(0.33);
      expect(landed).toBeLessThan(0.8);
    }

    // And nothing the wagon can do on its own puts the needle in the paint.
    // Flat out in top, with no sixth gear to escape into, is the worst case the
    // road has — and it stays short of the red the dial prints (`zone: 0.94` on
    // `content/hud/elements/drive_speedo.yaml`).
    for (let px = 0; px <= DRIVE.topSpeedPx; px += 1) {
      expect(engineRpm(px)).toBeLessThan(DRIVETRAIN.redlineRpm * 0.94);
    }

    // …BUT IT DOES END UP HIGH, which is the other half of the same claim and
    // the one a slack top gear would quietly break. Flat out in fifth the crank
    // has to be plainly working — past four fifths of the face — or the car is
    // saying it has another ratio it is not being given.
    const top = engineRpm(DRIVE.topSpeedPx);
    expect(gearFor(DRIVE.topSpeedPx)).toBe(GEAR_COUNT - 1);
    expect(top).toBeGreaterThan(DRIVETRAIN.redlineRpm * 0.82);
  });

  it("drops the revs on every upshift, and never below the one before", () => {
    // What a gearbox IS, as a fact rather than as a noise: the crank falls back
    // when the box changes up, and it falls back a little less each time as the
    // ratios close.
    let prevGear = gearFor(0);
    let prevRpm = engineRpm(0);
    const drops: number[] = [];
    for (let px = 1; px <= DRIVE.topSpeedPx; px += 1) {
      const gear = gearFor(px);
      const rpm = engineRpm(px);
      if (gear > prevGear) {
        expect(rpm).toBeLessThan(prevRpm);
        drops.push(rpm);
      }
      prevGear = gear;
      prevRpm = rpm;
    }
    expect(drops).toHaveLength(GEAR_COUNT - 1);
    for (let i = 1; i < drops.length; i++) {
      expect(drops[i]).toBeGreaterThan(drops[i - 1] ?? 0);
    }
  });

  it("runs out of pull just about where the dial runs out of numbers", () => {
    // A TOP SPEED IS A BALANCE, not a clamp: the wagon accelerates until the air
    // is pushing back as hard as the tyres are pushing forward. It has to land
    // near the authored ceiling from BELOW — a car that could not get close to
    // its own speedometer would make the top of the dial a lie, and one that
    // sailed past it would mean the cap was doing the work instead of the
    // physics.
    const solved = solvedTopSpeedPx();
    expect(solved).toBeGreaterThan(DRIVE.topSpeedPx * 0.9);
    expect(solved).toBeLessThanOrEqual(DRIVE.topSpeedPx);
  });

  it("coasts a great deal more gently than it brakes", () => {
    // "Nothing held means carry on" is the road's whole control model, and it is
    // only honest if letting go is nearly free: a lifted throttle is the air and
    // the engine, which at any speed is a fraction of what the pedal beside it
    // can do.
    const shed = (pedal: number): number => {
      const drive = createDrive(PARAMS);
      silence(drive);
      floorIt(drive, 12_000);
      const from = drive.car.speed;
      for (let t = 0; t < 1000; t += 16)
        stepDrive(drive, 16, { pedal, wheel: 0 });
      return from - drive.car.speed;
    };
    const coasted = shed(0);
    const braked = shed(-1);
    expect(coasted).toBeGreaterThan(0);
    expect(coasted).toBeLessThan(braked * 0.5);
  });
});

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

describe("what a body is actually FELT as", () => {
  // THE COMPLAINT THIS ANSWERS: a person went under the wagon and nothing
  // happened. The momentum sum was right and unreadable — 78 kg against 1600 is
  // five percent of the car, which lands at the bottom of a scale whose top is
  // a bus — so the crowd carries its own share of the volume knob
  // (`DRIVE.impact.crowdSpeedLossScale`) and the springs are shoved by the speed
  // the wagon LOST rather than by the fraction of its life the blow cost
  // (`nudgePerLoss`). Neither touches the energy, so nothing here is a statement
  // about damage.

  /** Somebody standing still on the car's own line, `ahead` px up the road. */
  const plant = (drive: DriveState, ahead: number): void => {
    drive.pedestrians.push({
      id: drive.nextId++,
      pos: { x: drive.car.pos.x + ahead, y: drive.car.pos.y },
      vel: { x: 0, y: 0 },
      mode: "afoot",
      kind: "walker",
      variant: 0,
      phase: 0,
      z: 0,
      vz: 0,
      counted: false,
      crushed: false,
      bark: -1,
    });
  };

  /**
   * Coast one wagon into a planted body and an identical one down an empty
   * road, and hand back the difference — which is the collision's own cost with
   * the drag, the drivetrain and the tyres divided out of it.
   */
  const meet = (speed: number): { lost: number; dip: number } => {
    const struck = createDrive(PARAMS);
    const clear = createDrive(PARAMS);
    let dip = 0;
    for (const drive of [struck, clear]) {
      silence(drive);
      drive.car.speed = speed;
    }
    plant(struck, 40);
    for (let t = 0; t < 400; t += 16) {
      stepDrive(struck, 16, { pedal: 0, wheel: 0 });
      stepDrive(clear, 16, { pedal: 0, wheel: 0 });
      // The FRONT axle, because that is the end the blow arrives at.
      dip = Math.max(dip, struck.car.suspension[1] as number);
    }
    expect(struck.bodies).toBe(1);
    return { lost: clear.car.speed - struck.car.speed, dip };
  };

  it("takes more off the speedometer than the bare momentum sum does", () => {
    const speed = DRIVE.topSpeedPx;
    const raw = solveImpact(
      { x: 0, y: 0 },
      1,
      speed,
      { x: 30, y: 0 },
      { x: 0, y: 0 },
      DRIVE.pedestrianRadiusPx,
      impactMasses(PARAMS.difficulty ?? "medium").pedestrian,
    )!.speedLoss;
    const { lost } = meet(speed);
    // The whole point: plainly MORE than the sum's own answer…
    expect(lost).toBeGreaterThan(raw * 1.2);
    // …and still a hit rather than a wall — a body is not a parked bus.
    expect(lost).toBeLessThan(speed * 0.25);
  });

  it("shoves the wagon's springs, and harder the faster it was going", () => {
    const fast = meet(DRIVE.topSpeedPx);
    const slow = meet(DRIVE.topSpeedPx * 0.3);
    // A body at the top of the dial has to be VISIBLE in the body work — the
    // axle has three px of travel, and a hit that moves it by a tenth of one is
    // the thing this whole pass exists to stop shipping.
    expect(fast.dip).toBeGreaterThan(CAR.maxCompress * 0.5);
    expect(slow.dip).toBeGreaterThan(0);
    expect(slow.dip).toBeLessThan(fast.dip * 0.75);
    // …and the springs answer the SPEED THAT WAS LOST, so the two move together.
    expect(fast.lost).toBeGreaterThan(slow.lost);
  });

  it("leaves the traffic on the momentum sum's own answer", () => {
    // ONLY the crowd is scaled. A vehicle is within a factor of ten of the
    // wagon, hands back a third to the whole of its speed on the sum alone, and
    // is the end of the range the road's own `speedLossScale` was set for — so
    // a second scale on top of it would be pricing a collision twice.
    const drive = createDrive(PARAMS);
    silence(drive);
    drive.car.speed = DRIVE.topSpeedPx;
    const mass = impactMasses("medium");
    const other = createTraffic(
      drive.nextId++,
      0,
      { x: drive.car.pos.x + 40, y: drive.car.pos.y },
      0,
    );
    drive.traffic.push(other);
    const before = drive.car.speed;
    const def = vehicleDef(other.variant);
    const hit = solveImpact(
      drive.car.pos,
      1,
      before,
      other.pos,
      { x: 0, y: 0 },
      def.radiusPx,
      trafficMass(other, mass.rider) * mass.vehicleMult,
      def.halfLengthPx,
      1,
    )!;
    stepDrive(drive, 16, { pedal: 0, wheel: 0 });
    expect(drive.shunts).toBe(1);
    // The sum's own answer, give or take the tick of coasting that came with
    // it — and comfortably short of what the crowd's multiplier would make it.
    const lost = before - drive.car.speed;
    expect(lost).toBeGreaterThan(hit.speedLoss * 0.95);
    expect(lost).toBeLessThan(hit.speedLoss * 1.1);
    expect(DRIVE.impact.crowdSpeedLossScale).toBeGreaterThan(1.1);
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
    expect(medium.vehicleMult).toBeCloseTo(1, 6);
    for (let i = 1; i < DIFFICULTY_ORDER.length; i++) {
      const prev = impactMasses(DIFFICULTY_ORDER[i - 1] as Difficulty);
      const next = impactMasses(DIFFICULTY_ORDER[i] as Difficulty);
      expect(next.pedestrian).toBeGreaterThan(prev.pedestrian);
      expect(next.vehicleMult).toBeGreaterThan(prev.vehicleMult);
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
    //
    // EIGHT SECONDS, AND THE LENGTH IS LOAD-BEARING. It was twenty, which is
    // long enough that a wagon driven straight into everything is somewhere
    // between half dead and finished ON EVERY RUNG — and a saturated dial
    // cannot say which road was worse, so the assertion was really reading
    // which car happened to break first. Measured across six seeds it agreed
    // with the ladder on four of them and did not on two, which is a coin flip
    // wearing a green tick. At eight seconds nothing has saturated (EASY sits
    // around 0.1 and the top rung around 0.3) and the ladder is unanimous on
    // every seed tried, which is what this test was always claiming.
    for (let t = 0; t < 8000; t += 16) {
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

  it("stands its lighting masts in ALIGNED pairs, unlike the yard lights", () => {
    // The two kerbs are interleaved half a pitch apart so a lit street does not
    // march past in couples — except on a mast slot, where street lighting
    // faces itself across the carriageway and the offset is dropped. The
    // renderer recovers a mast from that alignment alone (`mastAt`), so if the
    // two ever drift apart the masts stop being drawn at all.
    const { pitchPx, mastEvery } = DRIVE.street;
    const drive = createDrive(PARAMS);
    floorIt(drive, 20000);
    const posts = drive.props.filter(
      (prop) => prop.kind === "lamp_post" && !prop.felled,
    );
    expect(posts.length).toBeGreaterThan(4);
    for (const post of posts) {
      // Read the slot off the x directly: a post sits either ON its slot or
      // half a pitch past it, and rounding cannot tell those apart (a
      // half-offset post rounds UP into its neighbour, which is precisely why
      // `mastAt` rejects on the DISTANCE to a boundary rather than trusting the
      // rounded slot).
      const step = post.pos.x / pitchPx;
      const aligned = Math.abs(step - Math.round(step)) < 1e-6;
      const slot = aligned ? Math.round(step) : Math.floor(step);
      const mast = ((slot % mastEvery) + mastEvery) % mastEvery === 0;
      const where = `${post.pos.x} @ y=${post.pos.y}`;
      // The NEAR kerb is never offset, so every one of its posts sits on a slot
      // boundary. The FAR kerb is offset by half a pitch EXCEPT on a mast slot,
      // which is exactly the alignment the renderer reads a mast off — so on
      // that side, sitting on a boundary and being a mast are the same fact.
      if (post.pos.y > 0) expect(aligned, where).toBe(true);
      else expect(aligned, where).toBe(mast);
    }
    // …and a mast slot really does carry one on each side. The ENDS of the
    // spawned window are dropped: the street is laid down slot by slot as the
    // road unrolls and forgotten behind it, so the outermost x can legitimately
    // have had only one of its two minted yet.
    const byX = new Map<number, number[]>();
    for (const post of posts) {
      const slot = post.pos.x / pitchPx;
      // Every NEAR post sits on a boundary, so alignment alone is not the
      // question — a mast slot is.
      if (Math.abs(slot - Math.round(slot)) > 1e-6) continue;
      if (((Math.round(slot) % mastEvery) + mastEvery) % mastEvery !== 0) {
        continue;
      }
      byX.set(post.pos.x, [...(byX.get(post.pos.x) ?? []), post.pos.y]);
    }
    // Only a handful of mast slots are ever in the window at once, and both
    // outermost ones are dropped, so one survivor is the honest bar here.
    const xs = [...byX.keys()].sort((a, b) => a - b).slice(1, -1);
    expect(xs.length).toBeGreaterThanOrEqual(1);
    for (const x of xs) {
      const ys = byX.get(x) ?? [];
      expect(ys.length, `pair at ${x}`).toBe(2);
      expect(Math.sign(ys[0]!)).toBe(-Math.sign(ys[1]!));
    }
  });

  it("leaves a stump where a post sheared, and keeps it there", () => {
    const drive = createDrive(PARAMS);
    floorIt(drive, 20000);
    const post = drive.props.find((prop) => prop.kind === "lamp_post");
    expect(post).toBeDefined();
    expect(post!.stub).toBeUndefined();
    const stood = { x: post!.pos.x, y: post!.pos.y };
    fellLamp(post!, { x: 40, y: 12 }, 60);
    expect(post!.stub).toEqual(stood);
    // The flying half moves; the foot it left does not.
    floorIt(drive, 600);
    expect(post!.stub).toEqual(stood);
  });

  it("puts out the lamps at the END that was struck, whichever way it faces", () => {
    // A car's nose is not always on its right — the road runs both ways and an
    // oncoming body is drawn flipped — so the end is the side of the hit AND
    // the facing, never the side alone.
    const car = (faceLeft: boolean): DriveTraffic => {
      const one = createTraffic(1, 0, { x: 100, y: 0 }, 0);
      one.faceLeft = faceLeft;
      return one;
    };
    // Nose right: hit from behind (the left) kills the tail, from ahead the nose.
    const rearEnded = car(false);
    breakTrafficLamps(rearEnded, 60);
    expect([rearEnded.noseOut, rearEnded.tailOut]).toEqual([false, true]);
    const headOn = car(false);
    breakTrafficLamps(headOn, 140);
    expect([headOn.noseOut, headOn.tailOut]).toEqual([true, false]);
    // Nose LEFT — the same two blows land on the other ends.
    const oncoming = car(true);
    breakTrafficLamps(oncoming, 60);
    expect([oncoming.noseOut, oncoming.tailOut]).toEqual([true, false]);
    const chased = car(true);
    breakTrafficLamps(chased, 140);
    expect([chased.noseOut, chased.tailOut]).toEqual([false, true]);
    // Both ends can go, and one never puts the other back.
    breakTrafficLamps(rearEnded, 140);
    expect([rearEnded.noseOut, rearEnded.tailOut]).toEqual([true, true]);
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

  /**
   * HOW BUSY EACH LANE LOOKS, averaged over a leg — the number the traffic is
   * actually authored against (`DRIVE.laneTraffic.gapPx`), and the only one
   * worth asserting.
   *
   * It has to be measured ON SCREEN rather than counted per 1000 px of course,
   * because those two are not the same fact and the difference is the whole
   * reason the spawner works the way it does: the hero's own side is caught at
   * the DIFFERENCE of the two speeds and lingers, the oncoming side closes at
   * their SUM and is gone, so the same course pitch shows up eight times
   * denser in one than the other. A per-course count would pass on a road with
   * two empty lanes in it.
   *
   * The pavement's own riders are left out — they are not in a lane, and
   * `laneAt` clamps, so they would be booked against whichever outside lane
   * they are nearest.
   *
   * OVER SEVERAL SEEDS, because one leg is not a reading. The occupancy is a
   * statistical claim about the SPAWNER, and a single leg measures the spawner
   * through one trajectory: the auto-driver settles into a lane and bulldozes
   * it, so whichever lane it happened to pick that time reads far lighter than
   * the road actually is. On one seed that showed up as a lane at 0.16 against
   * the same road's 0.78 averaged — a false failure that any tuning touching the
   * wagon's pace could trip, since a slightly different speed puts the driver in
   * a different lane. Four legs average the trajectory out and leave the
   * spawner, which is what is under test.
   */
  const LANE_SEEDS = [1234, 5, 77, 909];
  const laneOccupancy = (difficulty: Difficulty): number[] => {
    const seen = new Array<number>(DRIVE.laneCount).fill(0);
    let ticks = 0;
    for (const seed of LANE_SEEDS) {
      const drive = createDrive({ ...PARAMS, seed, difficulty });
      // DRIVEN BY THE AUTO-DRIVER, because the reading is about what a PLAYER
      // sees and a car held dead straight does not see the road — it bulldozes
      // one lane of it. A shunt shoves a car AWAY from the wagon, so a straight
      // line empties the lane it opens in and stacks the neighbour with what it
      // shoved out, and the two read three times apart on a spawner that treated
      // them identically.
      const driver = createDriveDriver();
      for (let t = 0; t < 50000; t += 16) {
        stepDrive(drive, 16, driveDriverInput(driver, drive));
        // Only once the road is peopled — the opening stretch is deliberately
        // clear and averaging it in reports a quieter road than the one played.
        if (drive.distance <= DRIVE.crowdStartPx) continue;
        ticks++;
        for (const car of drive.traffic) {
          if (vehicleDef(car.variant).pavement) continue;
          const ahead = (car.pos.x - drive.car.pos.x) * PARAMS.direction;
          // What the camera shows: the car rides in the trailing quarter of a
          // ~420 px frame (`CAMERA_LEAD_FRAC`, pwa/src/game/drive-screen).
          if (ahead > 308 || ahead < -112) continue;
          seen[laneAt(car.pos.y)]! += 1;
        }
      }
    }
    return seen.map((n) => n / Math.max(1, ticks));
  };

  it("keeps a vehicle in every lane on every screen", () => {
    // THE PROMISE THE TRAFFIC IS TUNED TO MAKE. Not "some traffic exists" —
    // every lane, all the time, because a lane the player never has to read is
    // a lane the wheel is not being used for, and four of them made the road a
    // corridor with the occasional car in it.
    for (const lane of laneOccupancy("medium")) {
      // Loose at the bottom on purpose: the lane the wagon is actually IN
      // reads lighter than the rest however carefully it is driven, because
      // what it meets there it shoves out of the way.
      expect(lane).toBeGreaterThan(0.5);
      // …and the other wall: past about one and a half a lane there is no gap
      // left to move into, and a road with nowhere to put the wagon has taken
      // the steering decision away rather than sharpened it.
      expect(lane).toBeLessThan(1.7);
    }
  });

  it("thins the traffic on the gentle rungs and thickens it up the ladder", () => {
    const total = (difficulty: Difficulty) =>
      laneOccupancy(difficulty).reduce((a, b) => a + b, 0);
    expect(total("easy")).toBeLessThan(
      total(DIFFICULTY_ORDER.at(-1) as Difficulty),
    );
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

  it("gives the crowd things to think, and never the same thing twice", () => {
    // THE RULE THE WHOLE FEATURE HANGS ON. A road of two hundred people rolling
    // a thought each would repeat inside ten seconds, and a repeat turns a crowd
    // into one person copy-pasted — so the lines are DEALT from a deck
    // (`DriveState.thoughtDeck`) and a dealt one never comes back.
    const drive = createDrive(PARAMS);
    const thoughts = harvestThoughts(drive);
    expect(thoughts.length).toBeGreaterThan(20);
    expect(new Set(thoughts).size).toBe(thoughts.length);
    for (const thought of thoughts) {
      expect(thought).toBeGreaterThanOrEqual(0);
      expect(thought).toBeLessThan(CROWD_THOUGHTS);
    }
  });

  it("thinks them at their own pace, not the crowd's", () => {
    // The crowd stands a body every hundred pixels; a line over every head would
    // be a scrolling wall of grey. What is wanted is one, then a stretch of road
    // with nobody thinking anything at all, so the player is left with the sense
    // that he MISSED something rather than that he has been shown a list.
    const drive = createDrive(PARAMS);
    const { thinking, walking } = harvestCrowd(drive);
    // A DOZEN WALKERS FOR EVERY THOUGHT, or thereabouts — the pitch against the
    // crowd's own spacing. The number that matters is that it is a small
    // minority; the ratio itself is `DRIVE.thoughtPitchPx` and free to tune.
    expect(thinking).toBeLessThan(walking / 4);
    // …AND THE WHOLE DECK GETS ITS TURN over a leg driven end to end, which is
    // what the pitch is set against: forty lines, twenty thousand peopled
    // pixels, one trip.
    expect(thinking).toBeGreaterThan(CROWD_THOUGHTS * 0.7);
    expect(thinking).toBeLessThanOrEqual(CROWD_THOUGHTS);
  });

  it("deals the same thoughts in the same order for the same seed", () => {
    // A restart after a breakdown is the same road, and that has to include what
    // the people on it were thinking — otherwise the one stretch a player drives
    // four times is a lottery.
    const a = harvestThoughts(createDrive(PARAMS));
    const b = harvestThoughts(restartDrive(createDrive(PARAMS)));
    expect(b).toEqual(a);
    // …and a DIFFERENT seed genuinely reorders them.
    const other = harvestThoughts(createDrive({ ...PARAMS, seed: 987 }));
    expect(other).not.toEqual(a);
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
    //
    // THE SLOW DRIVER HOLDS HIS SPEED WITH THE PEDALS, not with a part-open
    // throttle, because a part-open throttle is not a speed: the pedal names a
    // RATE (`applyCarPedal`), so a third of it is a car that gets to the top end
    // gently rather than one that cruises at a third of it. Bang-bang against a
    // target is how the auto-driver holds a cruise and how a person drives.
    const fast = createDrive(PARAMS);
    const slow = createDrive(PARAMS);
    const target = 12000;
    while (fast.distance < target && fast.outcome === DRIVE_OUTCOME.driving) {
      stepDrive(fast, 16, { pedal: 1, wheel: 0 });
    }
    const cruise = DRIVE.topSpeedPx * 0.35;
    while (slow.distance < target && slow.outcome === DRIVE_OUTCOME.driving) {
      const pedal = Math.abs(slow.car.speed) < cruise ? 1 : -1;
      stepDrive(slow, 16, { pedal, wheel: 0 });
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

  it("only knocks people aside with BOTH switches off, and never bursts one", () => {
    // BOTH, because there are two of them now and either one is enough for a
    // body to come apart: `gib` tears lumps off, `split` takes them in two.
    const drive = createDrive({ ...PARAMS, gib: false, split: false });
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
    expect(drive.remains).toHaveLength(0);
    // …but somebody was plainly knocked over.
    expect(tumbled).toBeGreaterThan(0);
  });

  it("splits bodies with CLEAVES on and merely drags them with it off", () => {
    // THE WHOLE LEG, ON THE RUNG WHERE A BODY WEIGHS THE MOST — and both halves
    // of that are what keep this from being a coin toss rather than a test.
    //
    // A split is a hit over `gore.splitJoules`, which is a fast SQUARE one: the
    // auto-driver arrives having managed a couple on MEDIUM across a whole
    // minute and a half, and none at all on EASY, where a person weighs a
    // quarter of what they do here (`DifficultyDef.drive.pedestrianMassMult`).
    // Sampling the first forty seconds of a MEDIUM leg was sampling the half of
    // the trip the wagon spends getting up to speed, and it passed on how
    // little traffic there used to be to slow it down. The switch is what is
    // under test, not the odds — so this drives the whole road on the rung
    // where the line is comfortably cleared.
    const rung = { difficulty: DIFFICULTY_ORDER.at(-1) as Difficulty };
    const cut = createDrive({ ...PARAMS, ...rung, gib: false, split: true });
    const dragged = createDrive({
      ...PARAMS,
      ...rung,
      gib: false,
      split: false,
    });
    let splits = 0;
    let unsplit = 0;
    while (
      cut.outcome === DRIVE_OUTCOME.driving ||
      dragged.outcome === DRIVE_OUTCOME.driving
    ) {
      stepDrive(cut, 16, { pedal: 1, wheel: 0 });
      stepDrive(dragged, 16, { pedal: 1, wheel: 0 });
      splits += cut.strikes.filter((strike) => strike.split).length;
      unsplit += dragged.strikes.length;
    }
    // A road driven flat out is nothing but hits over the split line.
    expect(splits).toBeGreaterThan(0);
    // …and with the switch off not one of them comes apart at all.
    expect(unsplit).toBe(0);
  });

  it("still breaks the car either way", () => {
    const bloody = createDrive({ ...PARAMS, gib: true });
    const clean = createDrive({ ...PARAMS, gib: false, split: false });
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

describe("the handbrake", () => {
  /** How far the car travels bringing itself to a stop from the top end under
   * `hold` — the number that matters to a driver, which is not how long it took
   * but how much road it ate doing it. */
  function stoppingDistance(hold: DriveInput): number {
    const drive = createDrive(PARAMS);
    floorIt(drive, 4000);
    const from = drive.car.pos.x;
    for (let t = 0; t < 20000 && drive.car.speed > 0; t += 16) {
      stepDrive(drive, 16, hold);
    }
    return Math.abs(drive.car.pos.x - from);
  }

  it("is the fastest way this wagon stops", () => {
    // The pedal against the accelerator, and the lever WITH it — a handbrake
    // overrules the throttle rather than adding to the brake, so the second one
    // is a driver stopping with his foot still down.
    const pedal = stoppingDistance({ pedal: -1, wheel: 0 });
    const lever = stoppingDistance({ pedal: 1, wheel: 0, handbrake: true });
    expect(lever).toBeGreaterThan(0);
    expect(lever).toBeLessThan(pedal);
  });

  it("takes the lever out of the wreck's hands when the leg is over", () => {
    // A road that has ended is not being driven any more, whatever a thumb that
    // was down when the engine gave up is still doing — and a wreck coasting to
    // a halt must not go on laying rubber.
    const drive = createDrive(PARAMS);
    floorIt(drive, 2000);
    stepDrive(drive, 16, { pedal: 1, wheel: 0, handbrake: true });
    expect(drive.car.handbrake).toBe(true);
    drive.outcome = DRIVE_OUTCOME.broken;
    stepDrive(drive, 16, { pedal: 1, wheel: 0, handbrake: true });
    expect(drive.car.handbrake).toBe(false);
  });
});

describe("the kerb", () => {
  /** Drive down the gutter, where the furniture is. */
  function hugTheKerb(wheel: 1 | -1): DriveState {
    const drive = createDrive(PARAMS);
    for (
      let t = 0;
      t < 20000 && drive.outcome === DRIVE_OUTCOME.driving;
      t += 16
    ) {
      stepDrive(drive, 16, { pedal: 0.75, wheel });
    }
    return drive;
  }

  it("stands its furniture on both pavements as the road unrolls", () => {
    const drive = createDrive(PARAMS);
    floorIt(drive, 4000);
    expect(drive.props.length).toBeGreaterThan(0);
    const band = roadBandEdges();
    // Everything stands clear of the tarmac — a lamp post in a lane would be a
    // wall across the road rather than a thing at the side of it.
    for (const prop of drive.props) {
      if (prop.felled) continue;
      expect(
        prop.pos.y <= band.top || prop.pos.y >= band.bottom,
        `prop at y=${prop.pos.y}`,
      ).toBe(true);
    }
    expect(drive.props.some((p) => p.kind === "lamp_post")).toBe(true);
  });

  it("lays the same street down for the same seed, and both ways along it", () => {
    // Hashed off the slot rather than rolled, so the street never moves — a
    // restart puts every post back, and the way home passes the same ones.
    const a = createDrive(PARAMS);
    const b = createDrive(PARAMS);
    floorIt(a, 6000);
    floorIt(b, 6000);
    expect(a.props.map((p) => `${p.kind}@${p.pos.x}`)).toEqual(
      b.props.map((p) => `${p.kind}@${p.pos.x}`),
    );
  });

  it("breaks a lamp post off its base and throws it down the road", () => {
    const drive = hugTheKerb(-1);
    expect(drive.posts).toBeGreaterThan(0);
    const felled = drive.props.filter((p) => p.felled);
    expect(felled.length).toBeGreaterThan(0);
    // It LEFT: turned over, and no longer standing where it was bolted.
    expect(felled.some((p) => Math.abs(p.angle) > 0.2)).toBe(true);
    // …and a post that has gone is never hit again.
    for (const post of felled) expect(post.kind).toBe("lamp_post");
  });

  it("makes a parked car cost far more than the same car driving along", () => {
    // THE WHOLE POINT OF PARKED CARS BEING SOLID, and it is not a rule anybody
    // wrote: the collision is solved on the SWEEP, so a car standing still is
    // met at the hero's whole speed and one dawdling in the same direction at
    // the difference — and the damage goes as the SQUARE of that.
    const speed = DRIVE.topSpeedPx;
    const mass = impactMasses("medium");
    const square = (bodyVel: { x: number; y: number }, m: number) =>
      solveImpact({ x: 0, y: 0 }, 1, speed, { x: 30, y: 0 }, bodyVel, 9, m);
    const sedan = vehicleDef(0).massKg * mass.vehicleMult;
    const parked = square({ x: 0, y: 0 }, sedan + mass.parkedExtra);
    const rolling = square({ x: DRIVE.trafficSpeedPx.min, y: 0 }, sedan);
    expect(parked!.joules).toBeGreaterThan(rolling!.joules * 1.5);
    expect(parked!.speedLoss).toBeGreaterThan(rolling!.speedLoss);
  });

  it("charges a post far less than a car, and more than a person", () => {
    const mass = impactMasses("medium");
    const at = (m: number) =>
      solveImpact(
        { x: 0, y: 0 },
        1,
        DRIVE.topSpeedPx,
        { x: 30, y: 0 },
        { x: 0, y: 0 },
        4,
        m,
      )!.joules;
    expect(at(mass.lamp)).toBeGreaterThan(at(mass.pedestrian));
    expect(at(mass.lamp)).toBeLessThan(
      at(vehicleDef(0).massKg * mass.vehicleMult + mass.parkedExtra),
    );
  });

  it("keeps the difficulty ladder off the council's lighting", () => {
    // The rung says what the ROAD weighs — the crowd and the traffic. A street
    // light is the same steel on every one of them.
    for (const difficulty of DIFFICULTY_ORDER) {
      expect(impactMasses(difficulty).lamp).toBe(impactMasses("medium").lamp);
    }
  });
});

describe("how the hero read the trip", () => {
  /** A drive that has arrived, with nothing on its record but what is set. */
  function arrived(over: Partial<DriveState> = {}): DriveState {
    const drive = createDrive(PARAMS);
    Object.assign(drive, over);
    // Between the two clock verdicts unless a case says otherwise, so a test
    // about the CAR is never quietly answered by the stopwatch.
    if (over.ms === undefined) {
      drive.ms = (DRIVE.verdict.quickMs + DRIVE.verdict.slowMs) / 2;
    }
    return drive;
  }

  it("only calls a run clean when NOTHING was touched", () => {
    expect(driveVerdict(arrived())).toBe("drive_arrive_clean");
    expect(driveVerdict(arrived({ bodies: 1 }))).not.toBe("drive_arrive_clean");
    expect(driveVerdict(arrived({ shunts: 1 }))).not.toBe("drive_arrive_clean");
    expect(driveVerdict(arrived({ posts: 1 }))).not.toBe("drive_arrive_clean");
  });

  it("reads the road surface when the crowd is all there is to report", () => {
    expect(driveVerdict(arrived({ bodies: 1 }))).toBe("drive_arrive_some");
    expect(driveVerdict(arrived({ bodies: DRIVE.verdict.bumpyBodies }))).toBe(
      "drive_arrive_bumpy",
    );
  });

  it("lets the CAR, the KERB and the CLOCK all outrank the body count", () => {
    // The joke's whole machinery: everything a man notices on a commute comes
    // before the people, and the people only ever reach him as road surface.
    const many = { bodies: 200 };
    const wrecked = arrived(many);
    wrecked.car.wear = DRIVE.verdict.wreckWear;
    expect(driveVerdict(wrecked)).toBe("drive_arrive_wreck");
    expect(driveVerdict(arrived({ ...many, posts: DRIVE.verdict.posts }))).toBe(
      "drive_arrive_posts",
    );
    expect(driveVerdict(arrived({ ...many, shunts: DRIVE.verdict.cars }))).toBe(
      "drive_arrive_cars",
    );
    expect(driveVerdict(arrived({ ...many, ms: 1000 }))).toBe(
      "drive_arrive_quick",
    );
    expect(driveVerdict(arrived({ ...many, ms: 600000 }))).toBe(
      "drive_arrive_slow",
    );
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
