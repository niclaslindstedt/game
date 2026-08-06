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

import { DRIVE } from "@game/core";

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
} from "../../pwa/src/game/drive-screen/drive-sounds.ts";
import {
  clearDriveFx,
  createDriveFx,
  driveBodyHit,
  driveTrafficHit,
  roadRumble,
  shakeCamera,
  stepDriveFx,
} from "../../pwa/src/game/drive-screen/drive-fx.ts";
import { engineGrainMs, engineNote } from "../../pwa/src/game/sfx/drive.ts";

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
    // …and the two that fire once a leg do not need one.
    expect(GENERATED_SOUNDS[SHED_SOUND]).toBeDefined();
    expect(GENERATED_SOUNDS[BREAKDOWN_SOUND]).toBeDefined();
  });

  it("reaches for the heavy shelf only when the physics says it was heavy", () => {
    const light = DRIVE.impact.wearJoules * 0.01;
    const heavy = DRIVE.impact.wearJoules * 0.2;
    expect(BODY_SOUNDS).toContain(bodyHitSound(10, 4, light));
    expect(HARD_BODY_SOUNDS).toContain(bodyHitSound(10, 4, heavy));
    expect(SCRAPE_SOUNDS).toContain(trafficHitSound(10, 4, light));
    expect(CRUNCH_SOUNDS).toContain(trafficHitSound(10, 4, heavy));
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
  it("climbs inside a gear and DROPS across the shift", () => {
    // Walk the whole speed range and check the note is a sawtooth rather than
    // a ramp: it must fall at least once (a shift) and rise between shifts.
    let drops = 0;
    let rises = 0;
    let prev = engineNote(0);
    for (let frac = 0.01; frac <= 1; frac += 0.01) {
      const note = engineNote(frac);
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
    for (let gear = 1; gear < 5; gear++) {
      const opening = engineNote(0.0001).hz;
      const here = engineNote(gearOpening(gear)).hz;
      expect(here).toBeGreaterThan(opening);
    }
  });

  it("puts idle in first and the top end in the last gear", () => {
    expect(engineNote(0).gear).toBe(0);
    expect(engineNote(1).gear).toBe(4);
    expect(engineNote(1).rev).toBeCloseTo(1, 5);
  });

  it("quickens the putter as the revs climb", () => {
    expect(engineGrainMs(1)).toBeLessThan(engineGrainMs(0));
  });
});

/** The speed fraction a gear opens at — walked up from the note itself so the
 * test never has to know the gear table. */
function gearOpening(gear: number): number {
  for (let frac = 0; frac <= 1; frac += 0.001) {
    if (engineNote(frac).gear === gear) return frac;
  }
  return 1;
}

describe("the road's shake", () => {
  it("trembles harder the faster the ride, and not at all at a standstill", () => {
    expect(roadRumble(0)).toBe(0);
    expect(roadRumble(1)).toBeGreaterThan(roadRumble(0.5));
    expect(roadRumble(0.5)).toBeGreaterThan(roadRumble(0.2));
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
    expect(shakeCamera(calm, camera, 1234, 1)).toEqual(camera);
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
