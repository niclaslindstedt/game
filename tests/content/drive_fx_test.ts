// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ROAD'S PRESENTATION — the engine note, the shake, and the sounds a
// collision reaches for.
//
// WHAT IS WORTH ASSERTING HERE is not what any of it sounds or looks like —
// that is judged by ear and by eye — but the handful of facts underneath it
// that break silently:
//
//   A SOUND ID THAT NAMES NOTHING is silence, not a crash (`playSound` returns
//   false and moves on), so a typo in a bank is a collision that stops making
//   any noise at all and nothing anywhere says so. That is the test this file
//   exists for, and it lives in `tests/content/` because it walks the SHIPPED
//   sound catalog.
//
//   THE GEARBOX'S SHAPE — a note that climbs inside a gear and DROPS across a
//   shift — is the whole reason the engine sounds like a car. A refactor that
//   flattened it into a smooth ramp would leave every test green and every
//   drive sounding like a siren.
//
//   THE PICK IS DETERMINISTIC, because the drive is: the same road replayed
//   after a breakdown must give the same audio, and the pick must never reach
//   for `drive.rng()` (which would move every body laid down after it).

import { describe, expect, it } from "vitest";

import {
  createDrive,
  vehicleDef,
  DRIVE,
  DRIVETRAIN,
  GEAR_COUNT,
  impactMasses,
  solveImpact,
  type DriveState,
} from "@game/core";

import { CAR } from "../../src/game/vehicles.ts";

import { GENERATED_SOUNDS } from "../../pwa/src/generated/sounds.ts";
import {
  bodyHitSound,
  panelSound,
  trafficHitSound,
  variantAt,
  BODY_SOUNDS,
  BREAKDOWN_SOUND,
  CRUNCH_SOUNDS,
  DRIVE_SOUND_IDS,
  HARD_BODY_SOUNDS,
  SCRAPE_SOUNDS,
  SHED_SOUND,
  SMASH_SOUNDS,
} from "../../pwa/src/game/drive-screen/drive-sounds.ts";
import {
  clearDriveFx,
  createDriveFx,
  driveBodyHit,
  driveTrafficHit,
  shakeCamera,
  stepDriveFx,
} from "../../pwa/src/game/drive-screen/drive-fx.ts";
import { engineGrainMs, engineNote } from "../../pwa/src/game/sfx/drive.ts";
import {
  createWearTrail,
  driveDials,
} from "../../pwa/src/game/drive-screen/dials.ts";

describe("the road's sound banks", () => {
  it("names only sounds the shipped catalog actually holds", () => {
    for (const id of DRIVE_SOUND_IDS) {
      expect(GENERATED_SOUNDS[id], `missing sound "${id}"`).toBeDefined();
    }
  });

  it("carries more than one take of everything that fires repeatedly", () => {
    // A body goes under the car thirty times a trip; one sample played thirty
    // times reads as broken audio long before it reads as thirty people.
    expect(BODY_SOUNDS.length).toBeGreaterThan(1);
    expect(HARD_BODY_SOUNDS.length).toBeGreaterThan(1);
    expect(SCRAPE_SOUNDS.length).toBeGreaterThan(1);
    expect(CRUNCH_SOUNDS.length).toBeGreaterThan(1);
    expect(SMASH_SOUNDS.length).toBeGreaterThan(1);
    // …and the two that fire once a leg do not need one.
    expect(GENERATED_SOUNDS[SHED_SOUND]).toBeDefined();
    expect(GENERATED_SOUNDS[BREAKDOWN_SOUND]).toBeDefined();
  });

  it("reaches for the heavy shelf only when the physics says it was heavy", () => {
    // THE ENERGIES ARE SOLVED, NOT PICKED, and that is the whole point of this
    // test. Two joule figures typed in by hand only ever prove that a number is
    // bigger than a threshold; they cannot say whether anything the road can
    // actually DO reaches it — and for a long time nothing did. Absorbed energy
    // goes as the SQUARE of closing speed, so a threshold chosen by eye is wrong
    // by the square of however far off the speed was, and the heavy body bank
    // sat five times out of reach: on the baseline rung a body met dead square
    // at the full 120 was not loud enough to play it, and two rungs of players
    // never heard it. So every sample below is a REAL collision through the
    // engine's own `solveImpact`, on MEDIUM, and the claim is the one the source
    // makes out loud — the same collision at half the speed and at the top end
    // comes off different shelves.
    const mass = impactMasses("medium");
    const bodyAt = (frac: number) =>
      solveImpact(
        { x: 0, y: 0 },
        1,
        DRIVE.topSpeedPx * frac,
        // Dead square on the nose: the contact normal runs straight down the
        // car's own axis, so the car eats the lot.
        { x: 30, y: 0 },
        { x: 0, y: 0 },
        DRIVE.pedestrianRadiusPx,
        mass.pedestrian,
      )?.joules ?? 0;
    const vanAt = (frac: number) =>
      solveImpact(
        { x: 0, y: 0 },
        1,
        DRIVE.topSpeedPx * frac,
        { x: 30, y: 0 },
        // A van dawdling along in the same lane — the rear-ender.
        { x: DRIVE.trafficSpeedPx.min, y: 0 },
        CAR.footprint.radius,
        vehicleDef(0).massKg * mass.vehicleMult,
      )?.joules ?? 0;

    // A CAREFUL DRIVER, at forty percent of the top end.
    expect(BODY_SOUNDS).toContain(bodyHitSound(10, 4, bodyAt(0.4)));
    expect(SCRAPE_SOUNDS).toContain(trafficHitSound(10, 4, vanAt(0.4)).id);
    // …and one holding the throttle down.
    expect(HARD_BODY_SOUNDS).toContain(bodyHitSound(10, 4, bodyAt(1)));
    expect(CRUNCH_SOUNDS).toContain(trafficHitSound(10, 4, vanAt(0.8)).id);

    // …AND THE TOP SHELF, which is the one that had to exist: there was NO
    // shelf above the crunch, so a clip that cost some paint and a square
    // head-on into a stopped car that folded both of them played the identical
    // 260 ms sample. That identity was the whole of "the sound is way too small
    // for big crashes". Both of these reach it — a rear-ender at the top of the
    // dial closes at eighty-odd, and a stopped car is met at the whole 120.
    const parkedAt = (frac: number) =>
      solveImpact(
        { x: 0, y: 0 },
        1,
        DRIVE.topSpeedPx * frac,
        { x: 30, y: 0 },
        { x: 0, y: 0 },
        CAR.footprint.radius,
        vehicleDef(0).massKg * mass.vehicleMult,
      )?.joules ?? 0;
    const big = trafficHitSound(10, 4, parkedAt(1));
    expect(SMASH_SOUNDS).toContain(big.id);
    expect(SMASH_SOUNDS).toContain(trafficHitSound(10, 4, vanAt(1)).id);
    // …and it asks for the sub to be laid under it, which is the half of
    // "bigger" that turning a synthesized crunch up cannot buy.
    expect(big.sub).toBe(true);
    expect(trafficHitSound(10, 4, vanAt(0.4)).sub).toBe(false);
  });

  it("picks the same take for the same spot, and different ones across the road", () => {
    expect(bodyHitSound(120, 8, 1000)).toBe(bodyHitSound(120, 8, 1000));
    expect(panelSound(4, 2)).toBe(panelSound(4, 2));
    const picks = new Set(
      Array.from({ length: 40 }, (_, i) => variantAt(i * 13, i * 5, 3)),
    );
    expect(picks.size).toBeGreaterThan(1);
  });
});

describe("the engine note", () => {
  // The note is voiced from ROAD SPEED, in the px/s the physics integrates —
  // the same number the car itself is carrying — so these walk the wagon's
  // whole range rather than a fraction of it.
  const at = (frac: number) => engineNote(DRIVE.topSpeedPx * frac);

  it("climbs inside a gear and DROPS across the shift", () => {
    // Walk the whole speed range and check the note is a sawtooth rather than
    // a ramp: it must fall at least once (a shift) and rise between shifts.
    let drops = 0;
    let rises = 0;
    let prev = at(0);
    for (let frac = 0.01; frac <= 1; frac += 0.01) {
      const note = at(frac);
      if (note.gear > prev.gear) {
        expect(note.hz).toBeLessThan(prev.hz);
        drops++;
      } else if (note.hz > prev.hz) {
        rises++;
      }
      prev = note;
    }
    expect(drops).toBeGreaterThanOrEqual(3);
    expect(rises).toBeGreaterThan(50);
  });

  it("never drops a shift below where the gear before it started", () => {
    // The floor climbs with the gear, so an upshift is a dip rather than a
    // reset — which is what keeps acceleration audible across the whole range.
    for (let gear = 1; gear < GEAR_COUNT; gear++) {
      const opening = at(0.0001).hz;
      const here = engineNote(gearOpening(gear)).hz;
      expect(here).toBeGreaterThan(opening);
    }
  });

  it("is the CRANK's own note, not road speed's", () => {
    // The one fact that makes the sound worth having: the pitch is the firing
    // frequency of the revs the physics says the engine is turning at, so it
    // moves with the tachometer and not with the speedometer. Same road speed
    // in two different gears is impossible — the box picks one — but the same
    // NOTE at two very different speeds is exactly what a gearbox does, and
    // that is what this asserts.
    for (let frac = 0.02; frac <= 1; frac += 0.02) {
      const note = at(frac);
      expect(note.hz).toBeCloseTo(note.rpm / 30, 6);
      expect(note.rpm).toBeLessThanOrEqual(DRIVETRAIN.redlineRpm + 1);
      expect(note.rpm).toBeGreaterThanOrEqual(DRIVETRAIN.idleRpm);
    }
  });

  it("puts idle in first and the top of the range in the last gear", () => {
    expect(at(0).gear).toBe(0);
    expect(at(0).rpm).toBe(DRIVETRAIN.idleRpm);
    expect(at(1).gear).toBe(GEAR_COUNT - 1);
  });

  it("quickens the putter as the revs climb", () => {
    expect(engineGrainMs(DRIVETRAIN.redlineRpm)).toBeLessThan(
      engineGrainMs(DRIVETRAIN.idleRpm),
    );
  });
});

/** The road speed (px/s) a gear opens at — walked up from the note itself so
 * the test never has to know the ratios. */
function gearOpening(gear: number): number {
  for (let px = 0; px <= DRIVE.topSpeedPx; px += 0.5) {
    if (engineNote(px).gear === gear) return px;
  }
  return DRIVE.topSpeedPx;
}

describe("the damage dial's fresh slice", () => {
  // THE ONE PIECE OF THE DASHBOARD WITH A CLOCK IN IT. Everything else on the
  // road's HUD is a read of this instant; this holds the dial where it was,
  // lights what the last second cost, and then counts up into it — so what is
  // worth asserting is the SHAPE of that beat rather than any frame of it.
  const staged = (wear: number, ms: number): DriveState => {
    const drive = createDrive({
      seed: 7,
      direction: 1,
      to: "goodco_hq",
      difficulty: "medium",
      gib: true,
      split: true,
    });
    drive.car.wear = wear;
    drive.ms = ms;
    return drive;
  };

  it("holds the figure behind the damage, then catches it up", () => {
    const trail = createWearTrail();
    const drive = staged(0, 0);
    expect(driveDials(drive, false, trail).wearSettled).toBe(0);

    // A hit lands: the live wear jumps and the dial does not.
    drive.car.wear = 0.2;
    drive.ms = 100;
    const hit = driveDials(drive, false, trail);
    expect(hit.wear).toBeCloseTo(0.2, 5);
    expect(hit.wearSettled).toBe(0);

    // …it is still lit most of a second later…
    drive.ms = 900;
    expect(driveDials(drive, false, trail).wearSettled).toBe(0);

    // …then the climb, which is under way and not yet arrived…
    drive.ms = 1300;
    const climbing = driveDials(drive, false, trail).wearSettled;
    expect(climbing).toBeGreaterThan(0);
    expect(climbing).toBeLessThan(0.2);

    // …and lands on the figure.
    drive.ms = 2000;
    expect(driveDials(drive, false, trail).wearSettled).toBeCloseTo(0.2, 3);
  });

  it("lets a second hit extend the same slice", () => {
    // Drive into a crowd and the whole crowd lights up as one slice — the XP
    // strip's chained-kill rule, and the reason the hold is re-armed by the hit
    // rather than by the first one of a burst.
    const trail = createWearTrail();
    const drive = staged(0.1, 0);
    driveDials(drive, false, trail);
    drive.ms = 600;
    drive.car.wear = 0.3;
    driveDials(drive, false, trail);
    // 1.1 s after the FIRST hit, which would have been long enough on its own.
    drive.ms = 1100;
    expect(driveDials(drive, false, trail).wearSettled).toBe(0);
  });

  it("snaps back when the road lays a fresh car", () => {
    const trail = createWearTrail();
    const drive = staged(0.4, 0);
    driveDials(drive, false, trail);
    // Past the hold and the climb, so the dial has caught up with the wreck.
    drive.ms = 3000;
    expect(driveDials(drive, false, trail).wearSettled).toBeCloseTo(0.4, 3);
    // A breakdown restarts the leg on an undamaged wagon: nothing to animate.
    drive.car.wear = 0;
    drive.ms = 3016;
    expect(driveDials(drive, false, trail).wearSettled).toBe(0);
  });
});

describe("the road's shake", () => {
  it("stands perfectly still until something is actually hit", () => {
    // The road used to tremble with SPEED, and it read as a broken frame rate
    // rather than as a fast car — worse, it left a real collision nothing to
    // do. Silence between the blows is what makes a blow land.
    const fx = createDriveFx();
    const camera = { x: 100, y: -50 };
    expect(shakeCamera(fx, camera, 1234)).toEqual(camera);
  });

  it("shoves harder for a heavier hit, and settles back to still", () => {
    const light = createDriveFx();
    const heavy = createDriveFx();
    driveBodyHit(light, 0, 0, DRIVE.impact.wearJoules * 0.005, 0);
    driveTrafficHit(heavy, 0, 0, DRIVE.impact.wearJoules * 0.3, 0);
    expect(heavy.shake).toBeGreaterThan(light.shake);
    for (let t = 0; t < 3000; t += 16) stepDriveFx(heavy, 16, t);
    expect(heavy.shake).toBe(0);
    expect(heavy.flash).toBe(0);
    // …and everything it threw has been swept up.
    expect(heavy.fx).toHaveLength(0);
  });

  it("holds the camera perfectly still for a viewer who asked for calm", () => {
    const calm = createDriveFx();
    calm.calm = true;
    driveTrafficHit(calm, 0, 0, DRIVE.impact.wearJoules * 0.3, 0);
    expect(calm.shake).toBe(0);
    expect(calm.flash).toBe(0);
    const camera = { x: 100, y: -50 };
    expect(shakeCamera(calm, camera, 1234)).toEqual(camera);
    // The hit still SHOWS — the pieces are thrown, it is only the frame that
    // stays put.
    expect(calm.fx.length).toBeGreaterThan(0);
  });

  it("throws everything away when the leg restarts", () => {
    const fx = createDriveFx();
    driveTrafficHit(fx, 0, 0, DRIVE.impact.wearJoules * 0.2, 0);
    clearDriveFx(fx);
    expect(fx.fx).toHaveLength(0);
    expect(fx.shake).toBe(0);
  });
});
