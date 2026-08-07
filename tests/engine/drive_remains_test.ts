// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE ROAD LEAVES OF SOMEBODY — the drive's own body physics, and the
// blockade that supplies most of its customers.
//
// It is an ENGINE suite and it stages its own collisions, because the thing
// under test is a sequence rather than a moment: a body is met, taken in two,
// one half is carried, dropped, skidded and run over, and every one of those is
// a separate tick with a separate assertion. Driving the shipped road until one
// happens by itself would test the spawner.
//
// The road is the one place in `tests/engine/` that legitimately uses shipped
// content ids — a drive has no `registerDefs` fixtures because it has no defs at
// all: it is a car, four lanes and the numbers in `DRIVE`. The only id spent
// below is the destination LEVEL's, which a `DriveParams` needs and a drive
// never reaches.

import { describe, expect, it } from "vitest";

import {
  createDrive,
  stepDrive,
  DRIVE,
  GLUED_VARIANTS,
  blockadeAt,
  remainForce,
  splitsBody,
  type DriveParams,
  type DriveState,
} from "../../src/game/drive/index.ts";

const PARAMS: DriveParams = {
  seed: 909,
  direction: 1,
  to: "goodco_hq",
  gib: true,
  split: true,
  difficulty: "medium",
};

const FLAT_OUT = { pedal: 1, wheel: 0 };
const COAST = { pedal: 0, wheel: 0 };

/** Silence the road's own spawner, so the only body in the test is the one the
 * test planted. The blockade's own latch is set for the same reason. */
function silence(drive: DriveState): void {
  drive.nextPedestrianAt = Number.POSITIVE_INFINITY;
  drive.nextTrafficAt = Number.POSITIVE_INFINITY;
  drive.blockadeDone = true;
}

/** Somebody standing still, `ahead` px up the road on the car's own line. */
function plant(drive: DriveState, ahead: number, across = 0): void {
  drive.pedestrians.push({
    id: drive.nextId++,
    pos: { x: drive.car.pos.x + ahead, y: drive.car.pos.y + across },
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
}

/** Run the road for `ms`, collecting every event it books. */
function run(
  drive: DriveState,
  ms: number,
  input = FLAT_OUT,
): DriveState["events"][number][] {
  const out: DriveState["events"][number][] = [];
  for (let t = 0; t < ms; t += 16) {
    stepDrive(drive, 16, input);
    out.push(...drive.events);
  }
  return out;
}

describe("the split", () => {
  it("takes a body in two past the split line and merely drags it under", () => {
    const fast = createDrive(PARAMS);
    silence(fast);
    fast.car.speed = DRIVE.topSpeedPx;
    plant(fast, 120);
    const hard = run(fast, 600);
    expect(hard.some((e) => e.type === "bodySplit")).toBe(true);
    expect(fast.remains.some((piece) => piece.part === "upper")).toBe(true);
    expect(fast.remains.some((piece) => piece.part === "lower")).toBe(true);

    // The same body at a walking pace: nobody goes through anybody.
    const slow = createDrive(PARAMS);
    silence(slow);
    slow.car.speed = DRIVE.topSpeedPx * 0.15;
    plant(slow, 40);
    const soft = run(slow, 900, COAST);
    expect(soft.some((e) => e.type === "bodySplit")).toBe(false);
    expect(slow.remains.some((piece) => piece.part === "whole")).toBe(true);
    expect(slow.remains.some((piece) => piece.part === "upper")).toBe(false);
  });

  it("agrees with its own threshold — `splitsBody` IS the line the road uses", () => {
    const line = DRIVE.impact.wearJoules * DRIVE.gore.splitJoules;
    expect(splitsBody(line * 1.01)).toBe(true);
    expect(splitsBody(line * 0.99)).toBe(false);
    expect(remainForce(line)).toBeCloseTo(1, 6);
  });

  it("sends the upper half OVER — up, and slower along the road than the car", () => {
    const drive = createDrive(PARAMS);
    silence(drive);
    drive.car.speed = DRIVE.topSpeedPx;
    plant(drive, 120);
    run(drive, 400);
    const upper = drive.remains.find((piece) => piece.part === "upper");
    expect(upper, "a top-end square hit takes a body in two").toBeDefined();
    if (!upper) return;
    // It is IN THE AIR, which is what puts it over the roof at all…
    expect(upper.z).toBeGreaterThan(0);
    // …and it is being OVERTAKEN, which is what makes the car pass underneath
    // it rather than following it up the road. This is the whole trick, and a
    // carry fraction nudged over 1 would silently undo it.
    expect(Math.abs(upper.vel.x)).toBeLessThan(Math.abs(drive.car.speed));
  });

  it("keeps both halves of one body on the SAME cut line", () => {
    const drive = createDrive(PARAMS);
    silence(drive);
    drive.car.speed = DRIVE.topSpeedPx;
    plant(drive, 120);
    run(drive, 400);
    const upper = drive.remains.find((piece) => piece.part === "upper");
    const lower = drive.remains.find((piece) => piece.part === "lower");
    expect(upper?.cut).toBe(lower?.cut);
    // …and inside the band the bumper can plausibly have caught them at.
    expect(upper?.cut).toBeGreaterThanOrEqual(DRIVE.gore.cutBand.from);
    expect(upper?.cut).toBeLessThanOrEqual(DRIVE.gore.cutBand.to);
  });

  it("is deterministic — the same road twice leaves the same pieces", () => {
    const one = createDrive(PARAMS);
    const two = createDrive(PARAMS);
    for (const drive of [one, two]) {
      silence(drive);
      drive.car.speed = DRIVE.topSpeedPx;
      plant(drive, 120);
      run(drive, 800);
    }
    expect(one.remains.map((p) => [p.part, p.cut, p.seed])).toEqual(
      two.remains.map((p) => [p.part, p.cut, p.seed]),
    );
  });
});

describe("the drag", () => {
  it("carries the caught piece with the car and then lets it go", () => {
    const drive = createDrive(PARAMS);
    silence(drive);
    drive.car.speed = DRIVE.topSpeedPx;
    plant(drive, 120);
    const events = run(drive, 300);
    expect(events.some((e) => e.type === "bodyCaught")).toBe(true);
    const caught = drive.remains.find((piece) => piece.dragMs > 0);
    expect(caught, "something goes under the car").toBeDefined();
    if (!caught) return;
    // While it is caught it is WHEREVER THE CAR IS, which is the whole of the
    // feature — no integration on that branch at all.
    expect(caught.pos.x - drive.car.pos.x).toBeCloseTo(caught.dragAlong, 3);
    const heldAt = caught.dragMs;
    run(drive, 200);
    expect(caught.dragMs).toBeLessThan(heldAt);
    // …and once the clock runs out it is on the road with the car's own travel
    // under it rather than dropped dead.
    run(drive, 2000);
    expect(caught.dragMs).toBe(0);
  });

  it("drops what it is carrying the moment the car stops", () => {
    const drive = createDrive(PARAMS);
    silence(drive);
    drive.car.speed = DRIVE.topSpeedPx;
    plant(drive, 120);
    run(drive, 200);
    const caught = drive.remains.find((piece) => piece.dragMs > 0);
    expect(caught).toBeDefined();
    expect(caught?.dragMs).toBeGreaterThan(0);
    // A wagon that has stopped is not dragging anything — and the piece is let
    // go on the very next tick rather than when its own clock happens to run
    // out. Staged by stopping the car outright, because BRAKING from the top
    // end takes longer than the drag itself does and would test the clock.
    drive.car.speed = 0;
    stepDrive(drive, 16, COAST);
    expect(caught?.dragMs).toBe(0);
  });

  it("settles everything it drops, so a long road cannot fill up with movers", () => {
    const drive = createDrive(PARAMS);
    silence(drive);
    drive.car.speed = DRIVE.topSpeedPx;
    plant(drive, 120);
    run(drive, 200);
    // Coast to a stop and give the pieces time to skid out.
    run(drive, 6000, COAST);
    for (const piece of drive.remains) {
      expect(piece.settled || piece.dragMs > 0).toBe(true);
    }
  });
});

describe("the wheels", () => {
  it("runs over what is lying in the road, once each", () => {
    const drive = createDrive(PARAMS);
    silence(drive);
    drive.car.speed = DRIVE.topSpeedPx;
    plant(drive, 120);
    const events = run(drive, 2500);
    const crushes = events.filter((e) => e.type === "bodyCrushed");
    expect(crushes.length).toBeGreaterThan(0);
    // ONE CONTACT IS ONE IMPACT: no piece may be booked twice, which is the
    // same latch the traffic's cooldown buys and the same bug without it.
    expect(drive.remains.filter((p) => p.crushed).length).toBeLessThanOrEqual(
      crushes.length,
    );
  });

  it("makes a noise even with the gore switched off", () => {
    // The GORE-OFF road: nobody comes apart, so a struck body stays a body
    // lying in the road — and the wheels still find it. The noise is not gore.
    const drive = createDrive({ ...PARAMS, gib: false, split: false });
    silence(drive);
    drive.car.speed = DRIVE.topSpeedPx * 0.5;
    plant(drive, 60);
    const events = run(drive, 2500);
    expect(drive.remains).toHaveLength(0);
    expect(events.some((e) => e.type === "bodyCrushed")).toBe(true);
  });

  it("never books a crush for a piece still in the air", () => {
    const drive = createDrive(PARAMS);
    silence(drive);
    drive.car.speed = DRIVE.topSpeedPx;
    plant(drive, 120);
    for (let t = 0; t < 2500; t += 16) {
      stepDrive(drive, 16, FLAT_OUT);
      for (const piece of drive.remains) {
        if (piece.crushed) expect(piece.z).toBeLessThanOrEqual(2);
      }
    }
  });
});

describe("THE GLUED", () => {
  it("lays a blockade across every lane, once, at its place in the course", () => {
    const drive = createDrive(PARAMS);
    drive.nextPedestrianAt = Number.POSITIVE_INFINITY;
    drive.nextTrafficAt = Number.POSITIVE_INFINITY;
    const at = blockadeAt(drive.params);
    // Drive until the spawner reaches it.
    for (let t = 0; t < 200000 && !drive.blockadeDone; t += 16) {
      stepDrive(drive, 16, FLAT_OUT);
    }
    expect(drive.blockadeDone).toBe(true);
    const glued = drive.pedestrians.filter((ped) => ped.kind === "glued");
    expect(glued).toHaveLength(DRIVE.blockade.count);
    // Kerb to kerb: the formation has to span the whole carriageway, or there
    // is a line through it and the set piece is a hazard rather than a fact.
    const ys = glued.map((ped) => ped.pos.y);
    const half = (DRIVE.laneCount * DRIVE.laneWidth) / 2;
    expect(Math.min(...ys)).toBeLessThan(-half * 0.5);
    expect(Math.max(...ys)).toBeGreaterThan(half * 0.5);
    // …and it sits where the course says, give or take its own depth.
    const front = Math.min(...glued.map((ped) => ped.pos.x - drive.car.home.x));
    expect(Math.abs(front - at)).toBeLessThan(
      DRIVE.blockade.count * DRIVE.blockade.rowPitchPx,
    );
  });

  it("does not move, however close the car gets", () => {
    const drive = createDrive(PARAMS);
    drive.nextPedestrianAt = Number.POSITIVE_INFINITY;
    drive.nextTrafficAt = Number.POSITIVE_INFINITY;
    for (let t = 0; t < 200000 && !drive.blockadeDone; t += 16) {
      stepDrive(drive, 16, FLAT_OUT);
    }
    const watched = drive.pedestrians.filter((ped) => ped.kind === "glued");
    const before = watched.map((ped) => ({ ...ped.pos }));
    // A few seconds of the car bearing down on them, coasting so nobody is
    // reached and the only thing that could move them is their own step.
    for (let t = 0; t < 600; t += 16) stepDrive(drive, 16, COAST);
    for (const [i, ped] of watched.entries()) {
      if (ped.mode !== "afoot") continue;
      expect(ped.pos.x).toBe(before[i]?.x);
      expect(ped.pos.y).toBe(before[i]?.y);
    }
  });

  it("wears its own art and gives a few of them something to say", () => {
    const drive = createDrive(PARAMS);
    drive.nextPedestrianAt = Number.POSITIVE_INFINITY;
    drive.nextTrafficAt = Number.POSITIVE_INFINITY;
    for (let t = 0; t < 200000 && !drive.blockadeDone; t += 16) {
      stepDrive(drive, 16, FLAT_OUT);
    }
    const glued = drive.pedestrians.filter((ped) => ped.kind === "glued");
    for (const ped of glued) {
      expect(ped.variant).toBeGreaterThanOrEqual(0);
      expect(ped.variant).toBeLessThan(GLUED_VARIANTS);
    }
    const voices = glued.filter((ped) => ped.bark >= 0);
    expect(voices.length).toBeGreaterThan(0);
    // A bubble over every head is an unreadable wall of text at sixteen pixels,
    // and it makes twenty people into one placard.
    expect(voices.length).toBeLessThan(glued.length / 2);
  });

  it("is a wall the car cannot get through clean", () => {
    const drive = createDrive(PARAMS);
    drive.nextPedestrianAt = Number.POSITIVE_INFINITY;
    drive.nextTrafficAt = Number.POSITIVE_INFINITY;
    for (let t = 0; t < 200000 && !drive.blockadeDone; t += 16) {
      stepDrive(drive, 16, FLAT_OUT);
    }
    const before = drive.bodies;
    // Straight through it, flat out. It is not tuned for fairness: there is no
    // line, and the wheel cannot find one.
    for (let t = 0; t < 6000; t += 16) stepDrive(drive, 16, FLAT_OUT);
    expect(drive.bodies).toBeGreaterThan(before);
    // …but it does not end the drive either. The blockade WORKS — it stops the
    // car — it just does not stop it in time.
    expect(drive.car.wear).toBeLessThan(1);
  });
});
