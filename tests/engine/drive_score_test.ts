// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT A LEG IS WORTH — the drive's arcade score (src/game/drive/score.ts).
//
// The SHAPE is the feature, not the figures: every assertion below is about a
// relationship the tuning must keep (faster is worth more, a bent wagon is worth
// less, a person is worth nothing), so a pass over `DRIVE.score` is free and a
// pass that breaks the design fails. The one exact number pinned is the arcade
// rounding, which is not tuning — it is what makes a score read as a score.
//
// An ENGINE suite: it drives synthetic road, never a shipped catalog.

import { describe, expect, it } from "vitest";

import {
  createDrive,
  drivePar,
  driveScore,
  driveTripMs,
  stepDrive,
  DRIVE,
  DRIVE_OUTCOME,
  type DriveParams,
  type DriveState,
} from "../../src/game/drive/index.ts";

const PARAMS: DriveParams = {
  seed: 4242,
  direction: 1,
  to: "goodco_hq",
  gib: true,
  split: true,
  difficulty: "medium",
};

/** A road with nothing on it and the trip's own numbers set by hand — the
 * scorecard is arithmetic over five fields, so staging them beats driving a
 * whole course to reach one of them. */
function staged(over: Partial<DriveState> = {}): DriveState {
  const drive = createDrive(PARAMS);
  drive.ms = 60_000;
  drive.topSpeed = DRIVE.topSpeedPx;
  drive.car.wear = 0;
  return Object.assign(drive, over);
}

describe("the drive's arcade score", () => {
  it("pays for arriving, the clock, the pedal and the paintwork", () => {
    const card = driveScore(staged());
    expect(card.arrival).toBe(DRIVE.score.arrival);
    expect(card.time).toBeGreaterThan(0);
    expect(card.speed).toBeGreaterThan(0);
    expect(card.paint).toBe(DRIVE.score.paint);
    expect(card.damage).toBe(0);
    expect(card.score).toBeGreaterThan(0);
  });

  it("rounds to the cabinet's step, so no score ends in a stray digit", () => {
    for (const ms of [51_311, 58_777, 60_004, 71_999]) {
      const card = driveScore(staged({ ms }));
      expect(card.score % DRIVE.score.round).toBe(0);
    }
  });

  it("pays more for a quicker trip, and nothing at all for a slow one", () => {
    const quick = driveScore(staged({ ms: 50_000 }));
    const slower = driveScore(staged({ ms: 65_000 }));
    expect(quick.time).toBeGreaterThan(slower.time);
    expect(quick.score).toBeGreaterThan(slower.score);

    // Past par the bonus is ZERO rather than negative — par is a prize a good
    // driver wins, never a fine a slow one pays.
    const par = drivePar(PARAMS);
    const dawdled = driveScore(staged({ ms: par + 30_000 }));
    expect(dawdled.time).toBe(0);
    expect(dawdled.score).toBeGreaterThan(0);
  });

  it("pays for the top end, and scales with it", () => {
    const flatOut = driveScore(staged({ topSpeed: DRIVE.topSpeedPx }));
    const half = driveScore(staged({ topSpeed: DRIVE.topSpeedPx / 2 }));
    expect(flatOut.speed).toBeGreaterThan(half.speed);
    expect(flatOut.topSpeedMph).toBe(DRIVE.topSpeedMph);
  });

  it("pays for the paint still on the car, and never less than nothing", () => {
    const clean = driveScore(staged());
    const bent = driveScore(staged({ car: { ...staged().car, wear: 0.5 } }));
    const written = driveScore(staged({ car: { ...staged().car, wear: 1.4 } }));
    expect(clean.paint).toBeGreaterThan(bent.paint);
    expect(bent.paint).toBeGreaterThan(0);
    // Wear runs past 1 on the way to a breakdown; the bonus clamps rather than
    // going negative.
    expect(written.paint).toBe(0);
    expect(written.wearPercent).toBe(100);
  });

  it("charges for somebody else's lamp post and somebody else's paintwork", () => {
    const clean = driveScore(staged());
    const messy = driveScore(staged({ posts: 3, shunts: 4 }));
    expect(messy.damage).toBe(
      3 * DRIVE.score.perPost + 4 * DRIVE.score.perShunt,
    );
    expect(messy.score).toBeLessThan(clean.score);
  });

  it("never goes below zero, however badly the leg went", () => {
    const ruin = driveScore(
      staged({
        ms: 200_000,
        topSpeed: 0,
        posts: 40,
        shunts: 40,
        car: { ...staged().car, wear: 1 },
      }),
    );
    expect(ruin.score).toBe(0);
  });

  // THE WHOLE JOKE, AS A TEST. The road pays for the commute and not for the
  // crowd — the body count rides on the card as a stat and moves the number by
  // exactly nothing. A tuning pass that starts paying for people is a design
  // change and has to come through here.
  it("pays NOTHING for a person, and still reports how many", () => {
    const empty = driveScore(staged({ bodies: 0 }));
    const carnage = driveScore(staged({ bodies: 240 }));
    expect(carnage.score).toBe(empty.score);
    expect(carnage.bodies).toBe(240);
  });

  it("scores a shortened leg against its own length, not the whole road", () => {
    const attract = { ...PARAMS, coursePx: DRIVE.attractCoursePx };
    expect(drivePar(attract)).toBeLessThan(drivePar(PARAMS));
  });
});

describe("the trip's clock", () => {
  it("stops at the finish line rather than running through the arrival beat", () => {
    const drive = createDrive(PARAMS);
    // Stand the road at its finish, then let the arrival beat play out.
    drive.outcome = DRIVE_OUTCOME.arrived;
    drive.ms = 60_000;
    for (let t = 0; t < DRIVE.arrivalHoldMs; t += 16) {
      stepDrive(drive, 16, { pedal: 0, wheel: 0 });
    }
    expect(drive.ms).toBeGreaterThan(60_000);
    expect(driveTripMs(drive)).toBe(60_000);
    expect(driveScore(drive).ms).toBe(60_000);
  });

  it("is the whole clock while the road is still being driven", () => {
    const drive = createDrive(PARAMS);
    for (let t = 0; t < 1000; t += 16)
      stepDrive(drive, 16, { pedal: 1, wheel: 0 });
    expect(driveTripMs(drive)).toBe(drive.ms);
  });
});
