// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE RUN-IN ENDS ON A FADE, NOT ON A PARKED CAR.
//
// Past the finish line the wheel comes off the player and the wagon rolls down
// GOODCO's approach on its own — and that is the whole of what the road does
// with the arrival. It never brings the car to a stop, never puts the man out on
// the tarmac and never asks how to get in, because the LEVEL on the far side of
// the black opens with the car already in a bay and him standing beside it. A
// minigame that also played the parking would be showing the same arrival twice,
// the first time with nothing to do in it.
//
// The claim is a SHAPE, and every assertion below is one half of it: the picture
// goes out while the car is still moving, and it goes out before the road hands
// back. An ENGINE suite — it drives synthetic road and names no shipped catalog.

import { describe, expect, it } from "vitest";

import {
  courseLength,
  createDrive,
  DRIVE,
  DRIVE_OUTCOME,
  skipDriveOpening,
  stepDrive,
  type DriveParams,
  type DriveState,
} from "../../engine/game/drive/index.ts";

const PARAMS: DriveParams = {
  seed: 77,
  direction: 1,
  to: "goodco_hq",
  gib: true,
  split: true,
  difficulty: "medium",
};

/** A leg standing one tick short of its own finish line, at the speed a driver
 * actually crosses it — the run-in reads off the car's momentum, so arriving
 * with a made-up speed would measure nothing. */
function atTheFinish(): DriveState {
  const drive = createDrive(PARAMS);
  skipDriveOpening(drive);
  drive.pedestrians.length = 0;
  drive.traffic.length = 0;
  drive.props.length = 0;
  drive.car.pos.x = drive.car.home.x + courseLength(PARAMS) - 4;
  drive.distance = courseLength(PARAMS) - 4;
  drive.car.speed = DRIVE.opening.cruisePx;
  return drive;
}

/** Roll the arrival forward `ms` from wherever it stands. */
function hold(drive: DriveState, ms: number): void {
  for (let t = 0; t < ms; t += 16) stepDrive(drive, 16, { pedal: 0, wheel: 0 });
}

describe("the drive's run-in", () => {
  it("fades out with the car still rolling", () => {
    const drive = atTheFinish();
    hold(drive, 32);
    expect(drive.outcome).toBe(DRIVE_OUTCOME.arrived);

    // Everything up to and including the blackout is driven with the wagon
    // under way. `blackoutDone` is the last beat the road owns, so the speed on
    // the tick it lands is the speed the player's last frame shows.
    hold(drive, DRIVE.arrival.blackoutMs);
    expect(drive.blackoutDone).toBe(true);
    expect(drive.car.speed).toBeGreaterThan(0);
  });

  it("says its one line early enough to be read before the black", () => {
    const drive = atTheFinish();
    hold(drive, DRIVE.arrival.blackoutMs + 32);
    expect(drive.sightDone).toBe(true);
    expect(DRIVE.arrival.sightMs).toBeLessThan(DRIVE.arrival.blackoutMs);
    // …and the road holds long enough after the black for the app's own fade to
    // finish painting over it.
    expect(DRIVE.arrival.blackoutMs).toBeLessThan(DRIVE.arrivalHoldMs);
  });

  it("never coasts to a standstill inside the hold", () => {
    // The coast is a LIFT-OFF rather than a stop: a rate that brought the wagon
    // up before the road handed back would put a parked car on the screen, which
    // is the level's picture and not the road's. Measured from the slowest
    // arrival a player can actually make — the opening's own held cruise.
    const drive = atTheFinish();
    hold(drive, DRIVE.arrivalHoldMs);
    expect(drive.car.speed).toBeGreaterThan(0);
  });
});
