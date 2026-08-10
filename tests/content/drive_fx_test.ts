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

import { CAR } from "../../engine/game/vehicles.ts";

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
import type {
  NoiseOptions,
  Synth,
  ToneOptions,
} from "../../pwa/src/lib/synth.ts";
import {
  ENGINE_GRAIN_MS,
  engineNote,
  playDriveEngine,
} from "../../pwa/src/game/sfx/drive.ts";
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

    // A CAREFUL DRIVER — and what that IS in shares of the dial moved when the
    // wagon was re-engined. Forty percent used to be forty-eight miles an hour
    // and is now seventy, which is past the line where a bumper goes through
    // somebody (`DRIVE.gore.splitJoules`, the same line the heavy bank sits on
    // by design) — so the careful driver was reaching the crunch, correctly, and
    // the test was calling seventy careful. A quarter of this dial is about
    // forty-five, which is what the claim always meant.
    const CAREFUL = 0.26;
    expect(BODY_SOUNDS).toContain(bodyHitSound(10, 4, bodyAt(CAREFUL)));
    expect(SCRAPE_SOUNDS).toContain(trafficHitSound(10, 4, vanAt(CAREFUL)).id);
    // …and one PRESSING ON, which moved for the same reason: eighty percent of
    // this dial is a hundred and forty, and a van rear-ended at a hundred and
    // forty is off the crunch shelf and onto the smash. A shade over half is the
    // ninety-six the claim was measured at.
    const PRESSING_ON = 0.55;
    expect(HARD_BODY_SOUNDS).toContain(bodyHitSound(10, 4, bodyAt(1)));
    expect(CRUNCH_SOUNDS).toContain(
      trafficHitSound(10, 4, vanAt(PRESSING_ON)).id,
    );

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
    expect(trafficHitSound(10, 4, vanAt(CAREFUL)).sub).toBe(false);
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
    //
    // The DIVISOR is the engine's cylinder count and is deliberately not pinned
    // here — a four fires twice a revolution and a six three times, and which
    // one is under the bonnet is the brochure's business. What must hold is that
    // there IS one: the same constant at every speed, so the note tracks the
    // crank rather than being shaped by ear.
    const perRpm = at(0.02).hz / at(0.02).rpm;
    for (let frac = 0.02; frac <= 1; frac += 0.02) {
      const note = at(frac);
      expect(note.hz).toBeCloseTo(note.rpm * perRpm, 6);
      // Never past where the BOX lets go of it — which on this wagon is a good
      // thousand revs short of the redline, and the whole reason the dashboard
      // reads like an instrument rather than a rev limiter with steps in it.
      expect(note.rpm).toBeLessThanOrEqual(DRIVETRAIN.shiftUpRpm + 1);
      expect(note.rpm).toBeGreaterThanOrEqual(DRIVETRAIN.idleRpm);
    }
  });

  it("puts idle in first and the top of the range in the last gear", () => {
    expect(at(0).gear).toBe(0);
    expect(at(0).rpm).toBe(DRIVETRAIN.idleRpm);
    expect(at(1).gear).toBe(GEAR_COUNT - 1);
  });

  // ── THE BED ───────────────────────────────────────────────────────────────
  // A CAR MAKES ONE CONTINUOUS NOISE, and this engine is made of one-shots, so
  // the thing that has to hold is that the one-shots OVERLAP into one. They did
  // not: the grains were a hair longer than the gap between them, but a tone
  // falls to a tenth of its peak a quarter of the way through its duration, so
  // what the player got was a putter with daylight in it. Every assertion below
  // is that failure, stated as a fact about what gets scheduled.
  it("holds each grain and fires the next well inside it", () => {
    const { tones } = record((synth) =>
      playDriveEngine(synth, DRIVE.topSpeedPx * 0.5, 0),
    );
    expect(tones.length).toBeGreaterThan(0);
    for (const grain of tones) {
      // The peak is HELD — without this the grain is a blip whatever its
      // duration says, and no cadence short of a buzz will fuse two of them.
      expect(grain.holdMs ?? 0).toBeGreaterThan(ENGINE_GRAIN_MS);
      // …and the next grain lands during that hold, with the one before it
      // still up: three sounding at once, which is what flattens the sum.
      expect(grain.durationMs).toBeGreaterThan(ENGINE_GRAIN_MS * 2);
    }
  });

  it("stacks the wind deeper than the pitched layers", () => {
    // Uncorrelated noise sums in POWER, so a bed of noise grains needs more of
    // them overlapping than a bed of notes does to stop fluttering.
    const { noises } = record((synth) =>
      playDriveEngine(synth, DRIVE.topSpeedPx * 0.5, 0),
    );
    // The clatter is noise too and is meant to be the shortest sound here, so
    // the bed is what is left once the ticks are put aside.
    const bed = noises.filter((n) => n.durationMs >= 50);
    expect(bed.length).toBeGreaterThan(0);
    for (const grain of bed) {
      expect(grain.durationMs).toBeGreaterThan(ENGINE_GRAIN_MS * 4);
    }
  });

  it("glides toward where the note is GOING, so the grains agree", () => {
    // Three grains sound at once and each covers three cadences, so a grain
    // that held its pitch would be arguing with the two fired after it every
    // time the car accelerated. Each one glides along the same extrapolated
    // line instead: fired while accelerating it ends above where it started,
    // while braking below it, and at a steady speed it does not move.
    const from = DRIVE.topSpeedPx * 0.4;
    const prev = (speedPx: number) => ({ speedPx, dtMs: ENGINE_GRAIN_MS });
    const glide = (was: number): { from: number; to: number } => {
      const grain = record((synth) =>
        playDriveEngine(synth, from, 0, prev(was)),
      ).tones[0] as ToneOptions;
      return { from: grain.from, to: grain.to ?? grain.from };
    };
    const rising = glide(from * 0.9);
    expect(rising.to).toBeGreaterThan(rising.from);
    const falling = glide(from * 1.1);
    expect(falling.to).toBeLessThan(falling.from);
    const steady = glide(from);
    expect(steady.to).toBeCloseTo(steady.from, 6);
    // …and never runs away with itself: the prediction is the CRANK's, so
    // however wild the rate it stays inside the band the engine is asked for.
    // A slammed brake cannot glide the note below idle, and a standing start
    // cannot glide it past where the box lets go — which is also why it can
    // never wander into the next gear's pitch a third of a second early.
    const perRpm = engineNote(from).hz / engineNote(from).rpm;
    for (const was of [0, from * 4, -from]) {
      const g = glide(was);
      expect(g.to).toBeGreaterThanOrEqual(DRIVETRAIN.idleRpm * perRpm - 1e-6);
      expect(g.to).toBeLessThanOrEqual(DRIVETRAIN.shiftUpRpm * perRpm + 1e-6);
    }
  });

  it("leaves no hole in the bed — the summed level barely moves", () => {
    // THE ACTUAL BUG, MEASURED. Overlapping grains is not the same thing as a
    // continuous sound: what matters is what their ENVELOPES add up to, and
    // the old ones added up to a putter with daylight in it. So this rebuilds
    // the gain automation the way WebAudio will play it, sums every pitched
    // layer of a couple of seconds' worth of grains, and asks how far the total
    // moves between one grain and the next.
    const grains: { at: number; tone: ToneOptions }[] = [];
    let phase = 0;
    const speed = DRIVE.topSpeedPx * 0.45; // steady, so only the bed can wobble
    for (let grain = 0; grain < 20; grain++) {
      const at = grain * ENGINE_GRAIN_MS;
      const { tones } = record((synth) => {
        phase = playDriveEngine(
          synth,
          speed,
          0,
          { speedPx: speed, dtMs: ENGINE_GRAIN_MS },
          phase,
        );
      });
      for (const tone of tones) grains.push({ at, tone });
    }

    let lo = Infinity;
    let hi = 0;
    // Measured across the middle only: the first grains are the bed filling up
    // and the last are it draining, and neither is a hole.
    for (let t = 6 * ENGINE_GRAIN_MS; t < 14 * ENGINE_GRAIN_MS; t++) {
      let sum = 0;
      for (const { at, tone } of grains) sum += gainAt(tone, t - at);
      lo = Math.min(lo, sum);
      hi = Math.max(hi, sum);
    }
    expect(lo).toBeGreaterThan(0);
    // Under 2 dB of wobble. A putter is 15 and more — and the number to watch
    // if any of the four grain constants is ever retuned.
    expect(20 * Math.log10(hi / lo)).toBeLessThan(2);
  });

  it("clatters at the CRANK's rate, and carries the phase across grains", () => {
    // The ticks are the layer the ear can count at the bottom of the band, so
    // they have to run at the engine's rate rather than at the grain scheduler's
    // — and the only way that survives being cut into grains is for each grain
    // to pick the phase up where the last one dropped it. A grain that reset it
    // would lope at the grain rate, which is a rhythm nothing in the car makes.
    const ticksAt = (speedPx: number, phase: number) => {
      const { noises } = record((synth) => {
        next = playDriveEngine(synth, speedPx, 0, undefined, phase);
      });
      // The wind bed is the long one; the clatter is everything short.
      return noises.filter((n) => n.durationMs < 50).map((n) => n.delayMs ?? 0);
    };
    let next = 0;

    const slow = ticksAt(DRIVE.topSpeedPx * 0.02, 0);
    const fast = ticksAt(DRIVE.topSpeedPx * 0.6, 0);
    expect(slow.length).toBeGreaterThan(0);
    expect(fast.length).toBeGreaterThan(slow.length);

    // Walk a few grains at a steady speed and check the ticks come out evenly
    // spaced ACROSS the seams, not just inside each grain.
    const all: number[] = [];
    let phase = 0;
    for (let grain = 0; grain < 6; grain++) {
      for (const at of ticksAt(DRIVE.topSpeedPx * 0.3, phase)) {
        all.push(grain * ENGINE_GRAIN_MS + at);
      }
      phase = next;
    }
    expect(all.length).toBeGreaterThan(6);
    const gaps = all.slice(1).map((t, i) => t - (all[i] as number));
    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0] as number, 6);
  });

  it("holds the note flat across a shift and lets the blip say it", () => {
    // The crank did not slow down over a shift, it was handed a different
    // gear — so the rate across one is not a rate, and a grain that read it as
    // one would dive for a pitch the engine is not going to make.
    const before = gearOpening(1) - 1;
    const after = gearOpening(2);
    const grain = record((synth) =>
      playDriveEngine(synth, after, 0, { speedPx: before, dtMs: 105 }),
    ).tones[0] as ToneOptions;
    expect(engineNote(after).gear).not.toBe(engineNote(before).gear);
    expect(grain.to ?? grain.from).toBeCloseTo(grain.from, 6);
  });
});

/**
 * A tone's level `t` ms into it, as WebAudio will actually play the automation
 * `synth.tone()` writes: an exponential climb over the attack (from a
 * floor of 0.0001, which is what makes the first half of one nearly silent),
 * the peak held for `holdMs`, then an exponential fall back to that floor
 * across whatever is left.
 */
function gainAt(tone: ToneOptions, t: number): number {
  const { durationMs, volume = 0.06, attackMs = 0, holdMs = 0 } = tone;
  if (t < 0 || t > durationMs) return 0;
  const floor = 0.0001;
  const attack = Math.min(attackMs, durationMs * 0.5);
  const ramp = (from: number, to: number, f: number): number =>
    from * Math.pow(to / from, Math.min(1, Math.max(0, f)));
  if (t < attack) return ramp(floor, volume, t / attack);
  const decayFrom = Math.min(attack + holdMs, durationMs - 5);
  if (t < decayFrom) return volume;
  return ramp(volume, floor, (t - decayFrom) / (durationMs - decayFrom));
}

/** Play something at a synth that writes down what it was asked for. */
function record(play: (synth: Synth) => void): {
  tones: ToneOptions[];
  noises: NoiseOptions[];
} {
  const tones: ToneOptions[] = [];
  const noises: NoiseOptions[] = [];
  play({
    unlock() {},
    autostart() {},
    resume() {},
    now: () => 0,
    tone: (o) => tones.push(o),
    noise: (o) => noises.push(o),
    sample: () => null,
    decode: () => Promise.resolve(null),
  });
  return { tones, noises };
}

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

  it("lets a BODY move the frame, on the crowd's own scale", () => {
    // THE PICTURE'S HALF OF "the pedestrians should be felt". Priced against
    // `wearJoules` — the collision that totals the car — every person out here
    // landed in the bottom fifteenth of the scale and shoved the frame by about
    // a tenth of a pixel, which is to say by nothing. A body is now measured
    // against the worst thing that can happen to a body (`BODY_FULL_SHARE`),
    // and the ordering it always had is untouched: a wreck is still the biggest
    // thing on this road.
    const struck = createDriveFx();
    const traded = createDriveFx();
    // A person met DEAD SQUARE AT THE TOP OF THE DIAL on MEDIUM — 6.8% of the
    // car, which is `BODY_FULL_SHARE`'s own figure and moved with the top speed
    // when the wagon was re-engined (it was 3.6% against a 120 mph dial, and
    // absorbed energy goes as the SQUARE of the closing speed).
    driveBodyHit(struck, 0, 0, DRIVE.impact.wearJoules * 0.068, 0);
    // …and paint traded with a car at the same speed, which is a great deal
    // more energy.
    driveTrafficHit(traded, 0, 0, DRIVE.impact.wearJoules * 0.36, 0);
    expect(struck.shake).toBeGreaterThan(0.5);
    expect(struck.shake).toBeLessThan(traded.shake);
    // A gentle contact is still a gentle contact — the scale moved, the ladder
    // did not.
    const clipped = createDriveFx();
    driveBodyHit(clipped, 0, 0, DRIVE.impact.wearJoules * 0.004, 0);
    expect(clipped.shake).toBeLessThan(struck.shake * 0.35);
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
