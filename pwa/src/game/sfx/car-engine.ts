// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CAR IN THE BAY — the same engine the road is heard through, at the revs a
// car being manoeuvred is actually turning.
//
// IT IS THE SAME WAGON, so it is the same sound. Everything the road's engine is
// made of — the hum, its octave, the bass under it, the air over it, the clatter
// of the parts — is `sfx/engine-bed.ts`, and this module's whole job is to say
// what the crank is doing. The bay used to answer that with two hand-tuned
// layers of its own (a triangle from 55–125 Hz and a noise bed), which was a
// perfectly good engine noise belonging to a different car: it had no parts in
// it, no mass under it, and it climbed in a straight line from a standstill.
//
// AND THE CRANK IS DOING VERY LITTLE, which is the entire difference between
// this and the road. A car crossing a garage floor or nosing out of a bay is in
// FIRST and is never asked for more than a third of its band, so the note sits a
// good octave below the road's — idle at 40 Hz, and 100 Hz flat out — where the
// road's wagon runs to 315. Nothing else changes: same layers, same shape, same
// arithmetic, and a player who has driven the road recognises the car before it
// has moved.
//
// THREE THINGS THE BAY DOES NOT HAVE, all of them for the same reason (it is
// doing walking pace, not 170 mph):
//
//   * **NO WIND.** The air layer is scaled against what this car can EVER do
//     rather than against what it is doing now (`AIR_AT_TOP`), so the bay gets a
//     tenth of the road's wind roar instead of all of it.
//   * **NO EXHAUST EDGE.** The bed only puts a sawtooth on the note past a third
//     of the way up a gear, and the bay's ceiling is below that. A car being
//     parked does not bark.
//   * **NO SHIFT.** It never leaves first, so there is nothing to blip and the
//     note simply climbs and falls with the pedal.
//
// WHY THE STATE IS A MODULE-LEVEL OBJECT. A `carEngine` event carries a position
// and a throttle and nothing else, and two of the bed's inputs are about the
// grain BEFORE this one: where the note is travelling, and how far into this
// grain the clatter's next tick falls. A second car sounding at the same instant
// (an arriving night-shift wagon over the hero's own — `engine/game/arrivals.ts`)
// shares that state, which costs one grain's worth of glide on each and nothing
// else: both cars are the same model at the same sort of speed, and the ticks
// are a phase rather than a rhythm anyone could catch out. The alternative is a
// per-vehicle id on an event that is already pushed several times a second into
// a list replicated over the wire, which is a real cost for an imagined one.

import { clamp01 } from "@game/lib/vec.ts";

import type { Synth } from "@ui/lib/synth.ts";

import {
  IDLE_RPM,
  grainLifeMs,
  noteHz,
  playEngineBed,
  revBandAt,
} from "./engine-bed.ts";

/**
 * THE BAY'S CADENCE — `CAR.engineCueMs`, copied rather than imported (no module
 * in the sound bank has an edge into `@game/core`; see `engine-bed.ts`'s header)
 * and pinned to the original by `tests/content/car_engine_test.ts`.
 *
 * It is the SIMULATION that fires these grains, one per cue, so this is not a
 * number the sound gets to choose — it is a number the sound has to be told, and
 * the bed scales itself to whatever it is.
 */
export const CAR_GRAIN_MS = 210;

/**
 * WHERE THE CRANK TOPS OUT down here (rpm), at `CAR.driveSpeed`.
 *
 * Through first gear's own ratios (2.78 × 3.42 on a 0.36 m tyre) two thousand
 * revs is about twenty-eight km/h, which is the pace of a car being MOVED —
 * crossing a yard, nosing out of a bay, following a lane to the road. That is
 * what the bay is: `CAR.driveSpeed` is documented as "pulling out of the garage,
 * not the driving minigame", and the note says so.
 *
 * IT IS ALSO WHY THE WHOLE THING SITS AN OCTAVE DOWN. Idle to two thousand is
 * 40–100 Hz against the road's 40–315: the bay never gets near the shift point,
 * so it never gets the top two thirds of the band, the exhaust's edge, or a gear
 * change. A player hears the same engine loafing.
 */
export const CAR_TOP_RPM = 2000;

/**
 * How much of the road's wind this car can ever have. `CAR_TOP_RPM` in first is
 * about a tenth of what the wagon will do flat out in fifth, and the air layer
 * is a fraction of ABSOLUTE speed rather than of the throttle — so a car at full
 * bay speed gets a tenth of the roar, which is very nearly none.
 */
const AIR_AT_TOP = 0.1;

/**
 * The grain before this one: the throttle it was fired at, and how far into the
 * next grain the clatter is due to tick.
 *
 * Reset with the run (`resetCarEngine`, called from `stopRunSounds`) so a fresh
 * level never starts by gliding away from the last one's last grain.
 */
let last = { throttle: 0, tickMs: 0 };

/** Forget the previous grain — the run ended, or a test wants a clean bed. */
export function resetCarEngine(): void {
  last = { throttle: 0, tickMs: 0 };
}

/**
 * One grain of the run's car, fired by a `carEngine` cue.
 *
 * `intensity` is the throttle the simulation reports: the car's own speed as a
 * fraction of `CAR.driveSpeed`, so a standing engine idles and a car crossing
 * the yard at full tilt is at the top of its (short) band.
 *
 * WEAR IS NOT A FIELD ON THE CUE, so a run's car is always voiced fresh. What a
 * wrecked one loses here it gets back louder elsewhere: a bare axle under way
 * has its own sound (`carGrind`), which is the part of "this car is in trouble"
 * a player can actually act on.
 */
export function playCarEngine(synth: Synth, intensity: number): void {
  const throttle = clamp01(intensity);
  const rpm = IDLE_RPM + (CAR_TOP_RPM - IDLE_RPM) * throttle;
  // WHERE THE NOTE IS HEADING. Three grains sound at once and they have to
  // agree about the pitch, so each glides along the same line: the throttle is
  // extrapolated a full grain-life forward at the rate it has been moving, and a
  // grain fired now ends where a grain fired at its end begins. The bay needs
  // this as much as the road does — `CAR.driveAccel` takes the car from a
  // standstill to its top speed in half a second, which is under three grains.
  const rate = (throttle - last.throttle) / CAR_GRAIN_MS;
  const ahead = clamp01(throttle + rate * grainLifeMs(CAR_GRAIN_MS));
  const toRpm = IDLE_RPM + (CAR_TOP_RPM - IDLE_RPM) * ahead;

  last = {
    throttle,
    tickMs: playEngineBed(
      synth,
      {
        hz: noteHz(rpm),
        toHz: noteHz(toRpm),
        rpm,
        // In first gear, "how far up this gear" and "how far up the band" are
        // the same question — first opens at idle (`gearRev`, drivetrain.ts) —
        // and the bay is never in any other gear.
        rev: revBandAt(rpm),
        throttle,
        air: throttle * AIR_AT_TOP,
        wear: 0,
        grainMs: CAR_GRAIN_MS,
      },
      last.tickMs,
    ),
  };
}
