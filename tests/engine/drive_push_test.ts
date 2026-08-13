// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SHOVE, AND THE ONE RULE THAT KEEPS IT HONEST — a push is what FOLLOWS a
// contact, so it may never reach further than the bumper does.
//
// The failure these are written against is the one a player actually sees: the
// wagon flat out, a car ahead, the two of them plainly touching on the screen —
// and then the speedometer collapses to a walking pace with nothing else
// happening at all. No crash, no noise, no dent, and the car in front driving on
// unmarked. It came from `push.ts` testing a WIDER window than `solveImpact`
// does, so between the two sat a crescent in which the wagon shoved cars it had
// never hit; an ONCOMING one caught in it was turned round and carried off in
// the direction it had just come from, which is the one event on this road that
// has to be a crash.
//
// So the claim under test is not "the geometry is these numbers" — it is that
// SPEED THE WAGON LOSES TO A VEHICLE IS ALWAYS PAID FOR BY A COLLISION. Stated
// that way it survives every retune of the two windows, which is the point.

import { describe, expect, it } from "vitest";

import {
  createDrive,
  createTraffic,
  haltTraffic,
  laneCenter,
  skipDriveOpening,
  stepDrive,
  DRIVE,
  type DriveParams,
  type DriveState,
} from "../../engine/game/drive/index.ts";

const PARAMS: DriveParams = {
  seed: 1234,
  direction: 1,
  to: "goodco_hq",
  gib: true,
  split: true,
  difficulty: "medium",
};

/** Nothing on the road but the wagon and whatever the case stages on it. */
function emptyRoad(): DriveState {
  const drive = createDrive(PARAMS);
  skipDriveOpening(drive);
  drive.nextPedestrianAt = DRIVE.coursePx * 2;
  haltTraffic(drive, DRIVE.coursePx * 2);
  drive.props = [];
  drive.pedestrians = [];
  return drive;
}

/** What one staged meeting came to. */
type Meeting = {
  /** Every event kind the road raised, in first-seen order. */
  events: string[];
  /** The wagon's speed when the road had finished with it (world px/s). */
  endSpeed: number;
  /** …and how much of its own body it spent getting there (0→1). */
  wear: number;
  /** Ticks the other vehicle spent under the bumper being shoved. */
  pushTicks: number;
  /** Its along-road pace at the end, on the hero's heading (world px/s), or
   * null if the road culled it. */
  otherPace: number | null;
};

/**
 * Drive the wagon at `dy` px off another vehicle's line and see what the two of
 * them make of each other.
 *
 * BOTH BODIES ARE HELD ON THEIR LINE for the run. The geometry across the road
 * IS the variable here, and a case that lets the other driver steer out of it is
 * measuring the AI instead — which is exactly how the crescent stayed hidden:
 * on an ordinary road the pair drift a pixel or two apart and the hole is only
 * open for the runs that do not.
 */
function meet(dy: number, otherSpeed: number, heroSpeed = 900): Meeting {
  const drive = emptyRoad();
  const { car } = drive;
  car.speed = heroSpeed;
  car.wear = 0;
  const line = laneCenter(1);
  car.pos.y = line;
  drive.traffic = [
    createTraffic(9001, 0, { x: car.pos.x + 140, y: line + dy }, otherSpeed),
  ];
  const events: string[] = [];
  let pushTicks = 0;
  for (let t = 0; t < 200; t++) {
    car.pos.y = line;
    const held = drive.traffic[0];
    if (held) {
      held.pos.y = line + dy;
      held.slew = 0;
    }
    stepDrive(drive, 16, { pedal: 1, wheel: 0 });
    for (const ev of drive.events) {
      if (!events.includes(ev.type)) events.push(ev.type);
    }
    if ((drive.traffic[0]?.pushMs ?? 0) > 0) pushTicks++;
  }
  const other = drive.traffic[0];
  return {
    events,
    endSpeed: car.speed,
    wear: car.wear,
    pushTicks,
    otherPace: other ? other.speed * drive.params.direction : null,
  };
}

/** Every offset across the road worth staging — a full lane either side of the
 * line, in the half-pixel steps the crescent was only ever a pixel or two wide
 * at. */
const OFFSETS: readonly number[] = Array.from(
  { length: 4 * DRIVE.laneWidth + 1 },
  (_, i) => (i - 2 * DRIVE.laneWidth) / 2,
);

describe("the shove", () => {
  it("never takes the wagon's speed without a collision to show for it", () => {
    // THE WHOLE RULE, AND IT IS THE PLAYER'S OWN WORDING: a car that goes from
    // flat out to a walking pace has been in a crash, so there had better be
    // one. Anything that arrests the wagon and books no `trafficHit` is the road
    // taking the run away from the player without telling them why.
    for (const speed of [200, -300]) {
      for (const dy of OFFSETS) {
        const met = meet(dy, speed);
        if (met.endSpeed > 400) continue; // it got through — nothing to answer for
        expect(
          met.events,
          `stopped at dy=${dy} against a vehicle doing ${speed} with no collision booked`,
        ).toContain("trafficHit");
        // …and a stop is not a graze. The blow that took the speed wore the car.
        expect(met.wear, `no wear for a stop at dy=${dy}`).toBeGreaterThan(0);
      }
    }
  });

  it("never picks up a vehicle the bumper never reached", () => {
    // The push is the CONTINUATION of a contact. Its own window is allowed to
    // be narrower than `contactReach` — slack that keeps a crabbing wreck under
    // the bumper a moment longer — and never wider, because the wider half is
    // a shove nobody was charged for.
    for (const speed of [200, -300]) {
      for (const dy of OFFSETS) {
        const met = meet(dy, speed);
        if (met.pushTicks === 0) continue;
        expect(
          met.events,
          `pushed a vehicle at dy=${dy} the bumper never hit`,
        ).toContain("trafficHit");
      }
    }
  });

  it("never turns an oncoming car round without hitting it", () => {
    // A head-on belongs to the collision pass, which charges BOTH parties for
    // it. Read on magnitude, a car closing at 300 looked merely "slower than
    // me" to the shove — and the shove ASSIGNS the victim's speed, so it
    // reversed one outright and drove it back up its own lane for free.
    for (const dy of OFFSETS) {
      const met = meet(dy, -300);
      if (met.otherPace === null || met.otherPace <= 0) continue;
      expect(
        met.events,
        `an oncoming car was travelling the hero's way at dy=${dy} with no collision booked`,
      ).toContain("trafficHit");
    }
  });

  it("still shoves what it has genuinely rear-ended", () => {
    // The belt on the braces above: narrowing the window must not cost the road
    // the feature. Squarely up the back of a slower car is still a car under
    // the bumper being carried, crabbing, and taxing the throttle.
    const met = meet(0, 200);
    expect(met.events).toContain("trafficHit");
    expect(met.pushTicks).toBeGreaterThan(30);
    expect(met.endSpeed).toBeLessThan(900);
  });
});
