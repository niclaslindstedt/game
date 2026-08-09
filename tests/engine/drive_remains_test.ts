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
  haltTraffic,
  skipDriveOpening,
  stepDrive,
  DRIVE,
  GLUED_VARIANTS,
  blockadeAt,
  gibsBody,
  remainForce,
  splitsBody,
  type DriveParams,
  type DriveState,
} from "../../engine/game/drive/index.ts";

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
  // …AND PAST THE OPENING. A fresh leg spends its first three and a half
  // seconds sliding the wagon into frame with the pedals disconnected and the
  // collision pass not running at all, which is not a road to stage a blow on.
  skipDriveOpening(drive);
  drive.nextPedestrianAt = Number.POSITIVE_INFINITY;
  haltTraffic(drive);
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

/** …and the same run collecting the STRIKES too, which live for one tick
 * exactly as the events do. A strike is the BUMPER's own answer for a
 * collision, which is the only way to ask "did the steel go through them" now
 * that the wheels have their own way of taking a body in two. */
function play(
  drive: DriveState,
  ms: number,
  input = FLAT_OUT,
): {
  events: DriveState["events"][number][];
  strikes: DriveState["strikes"][number][];
} {
  const events: DriveState["events"][number][] = [];
  const strikes: DriveState["strikes"][number][] = [];
  for (let t = 0; t < ms; t += 16) {
    stepDrive(drive, 16, input);
    events.push(...drive.events);
    strikes.push(...drive.strikes);
  }
  return { events, strikes };
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

    // The same body at a walking pace: the BUMPER goes through nobody. What the
    // wheels behind it then do to the body is a different question and the test
    // under "the wheels" below — so this asks the strike, which is the steel's
    // own answer, rather than the `bodySplit` event both causes share.
    const slow = createDrive(PARAMS);
    silence(slow);
    slow.car.speed = DRIVE.topSpeedPx * 0.15;
    plant(slow, 40);
    const { strikes } = play(slow, 900, COAST);
    expect(strikes).toHaveLength(1);
    expect(strikes[0]?.split).toBe(false);
  });

  it("leaves a body IN the road when the bumper only knocked it down", () => {
    // THE COMPLAINT THIS ANSWERS, and it is the whole of "running slow just
    // leaves a blood pool". Every sub-split body used to be caught under the car
    // whatever the blow was worth — and `dragAlongPx` parks a caught piece two
    // px INSIDE the footprint the wheels test, on purpose, so anything caught is
    // run over the instant it works free. A crushed body was then drawn as
    // nothing at all. Between them that deleted the person on every collision
    // under the split line: a pool of blood, and nobody in it.
    //
    // Below the speed the wheels do anything at all there is simply a body.
    const drive = createDrive(PARAMS);
    silence(drive);
    drive.car.speed = DRIVE.gore.dragMinSpeedPx * 0.8;
    plant(drive, 20);
    const events = run(drive, 1200, COAST);
    expect(events.some((e) => e.type === "bodyCaught")).toBe(false);
    expect(events.some((e) => e.type === "bodyCrushed")).toBe(false);
    const body = drive.remains.find((piece) => piece.part === "whole");
    expect(body, "a knocked-down body stays in the road").toBeDefined();
    expect(body?.crushed).toBe(false);
    expect(drive.remains).toHaveLength(1);
  });

  it("agrees with its own threshold — `splitsBody` IS the line the road uses", () => {
    const line = DRIVE.impact.wearJoules * DRIVE.gore.splitJoules;
    expect(splitsBody(line * 1.01)).toBe(true);
    expect(splitsBody(line * 0.99)).toBe(false);
    expect(remainForce(line)).toBeCloseTo(1, 6);
  });

  it("tears nothing off a body the car was barely moving when it met", () => {
    // THE COMPLAINT THIS ANSWERS. The chunk ladder reads "at the split line, and
    // per unit of force beyond it" and was measured from a STANDSTILL, so its
    // base was paid out at any force at all — a wagon rolling into somebody at a
    // walking pace put a length of gut on the tarmac, which is the one thing out
    // here that reads as a bug rather than as a collision.
    const drive = createDrive(PARAMS);
    silence(drive);
    drive.car.speed = DRIVE.topSpeedPx * 0.15;
    plant(drive, 40);
    run(drive, 900, COAST);
    // A body in the road — in two, because the wheels went over it — and above
    // all no lumps: nothing is torn off anybody at a pace like this.
    expect(drive.remains.length).toBeGreaterThan(0);
    expect(drive.remains.some((piece) => piece.part === "chunk")).toBe(false);
    for (const piece of drive.remains) {
      expect(["whole", "upper", "lower"]).toContain(piece.part);
    }
  });

  it("opens a body up only well PAST the blow that goes through it", () => {
    // THREE RUNGS RATHER THAN TWO, and the middle one is the point: a bumper
    // going THROUGH somebody and a bumper taking them APART are different
    // amounts of violence, so there is a band of the speedometer that severs a
    // body and throws none of its insides about (`DRIVE.gore.chunkForce`, above
    // the split rather than on it).
    expect(DRIVE.gore.chunkForce).toBeGreaterThan(1);
    const line = DRIVE.impact.wearJoules * DRIVE.gore.splitJoules;
    const between = line * ((1 + DRIVE.gore.chunkForce) / 2);
    expect(splitsBody(between)).toBe(true);
    expect(gibsBody(between)).toBe(false);
    expect(gibsBody(line * DRIVE.gore.chunkForce * 1.01)).toBe(true);
  });

  it("never throws a piece of anybody out of the frame", () => {
    // EVERY BURST IS OVER QUICKLY OR IT IS NOT A BURST. The ladders here are
    // read against a force that a CAR collision can push ten to fifty times past
    // where a body's own worst case sits, and unclamped that left an occupant's
    // torso leaving a windscreen at nine thousand pixels a second — six seconds
    // off the top of the frame, which is not a collision, it is an absence.
    const drive = createDrive(PARAMS);
    silence(drive);
    drive.car.speed = DRIVE.topSpeedPx;
    plant(drive, 120);
    run(drive, 400);
    expect(drive.remains.length).toBeGreaterThan(0);
    for (const piece of drive.remains) {
      expect(Math.abs(piece.vz)).toBeLessThanOrEqual(DRIVE.gore.maxLiftPx);
    }
    // …and the force every one of those ladders was read against is bounded too.
    expect(remainForce(Number.MAX_SAFE_INTEGER)).toBe(DRIVE.gore.maxForce);
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

  it("cuts a whole body in two, at any speed the wheels are turning at", () => {
    // THE OTHER WAY SOMEBODY IS TAKEN IN TWO OUT HERE. `splitJoules` is a
    // question about the BLOW — a bumper under about sixty goes through nobody —
    // and a wheel is not asking it: a tonne and a half of estate rolling over
    // somebody lying in the road leaves two pieces of them whatever the
    // speedometer said. The road used to answer that moment by ERASING the body
    // in favour of its own paste, which is what left a pool of blood with nobody
    // in it every time a slow driver ran somebody down.
    const drive = createDrive(PARAMS);
    silence(drive);
    drive.car.speed = DRIVE.topSpeedPx * 0.12;
    plant(drive, 30);
    const { events, strikes } = play(drive, 2000, COAST);
    // The bumper did not do this…
    expect(strikes).toHaveLength(1);
    expect(strikes[0]?.split).toBe(false);
    // …the wheels did, and it is heard as the same wet tear a fast hit makes.
    expect(events.some((e) => e.type === "bodyCrushed")).toBe(true);
    expect(events.some((e) => e.type === "bodySplit")).toBe(true);
    const upper = drive.remains.find((piece) => piece.part === "upper");
    const lower = drive.remains.find((piece) => piece.part === "lower");
    expect(upper).toBeDefined();
    expect(lower).toBeDefined();
    // Two pieces of ONE person: the same cut line, the same body's art…
    expect(upper?.cut).toBe(lower?.cut);
    expect(upper?.variant).toBe(lower?.variant);
    // …parted far enough to be legibly two at the scale a body is drawn at…
    expect(
      Math.hypot(
        (upper?.pos.x ?? 0) - (lower?.pos.x ?? 0),
        (upper?.pos.y ?? 0) - (lower?.pos.y ?? 0),
      ),
    ).toBeGreaterThan(0);
    // …and nothing else at all: a wheel cuts, it does not open somebody up.
    expect(drive.remains.some((piece) => piece.part === "chunk")).toBe(false);
    expect(drive.remains.some((piece) => piece.part === "whole")).toBe(false);
  });

  it("cuts a body once and once only, however long the car sits on it", () => {
    // A body under a wheel comes apart ONCE. Both halves leave flagged
    // `crushed`, which is the same "one contact is one impact" latch the traffic
    // carries — without it the wheel that cut a body finds its own halves on the
    // next tick and the road fills up with a fresh pair of them every 16 ms.
    const drive = createDrive(PARAMS);
    silence(drive);
    drive.car.speed = DRIVE.topSpeedPx * 0.12;
    plant(drive, 30);
    const events = run(drive, 3000, COAST);
    expect(events.filter((e) => e.type === "bodySplit")).toHaveLength(1);
    expect(drive.remains).toHaveLength(2);
  });

  it("leaves the body whole when the SPLIT is switched off", () => {
    // The gore page's own switch, obeyed by the wheels exactly as the bumper
    // obeys it: a refusal falls back to the ordinary crushed body and its paste,
    // never to some other kind of gore.
    const drive = createDrive({ ...PARAMS, split: false });
    silence(drive);
    drive.car.speed = DRIVE.topSpeedPx * 0.12;
    plant(drive, 30);
    const events = run(drive, 2000, COAST);
    expect(events.some((e) => e.type === "bodyCrushed")).toBe(true);
    expect(events.some((e) => e.type === "bodySplit")).toBe(false);
    expect(drive.remains.every((piece) => piece.part === "whole")).toBe(true);
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
    haltTraffic(drive);
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
    haltTraffic(drive);
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
    haltTraffic(drive);
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
    haltTraffic(drive);
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
