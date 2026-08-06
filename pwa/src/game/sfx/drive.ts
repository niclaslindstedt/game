// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ROAD'S OWN SOUNDS — the engine under the player's foot, and the hits.
//
// WHY THIS IS CODE AND NOT A `content/sounds/` ENTRY. Everything discrete about
// the drive IS content (`drive_*.yaml`, played by id — see `playDriveSound`);
// what lives here is the one thing a static entry cannot hold: a note that
// rides a CONTINUOUS parameter. The engine's pitch is a function of road speed
// and nothing else, and it has to be re-evaluated several times a second — the
// same reason the sandstorm's howl and the run's own `carEngine` rumble kept
// their code while the rest of the bank moved into YAML.
//
// HOW A RUNNING ENGINE IS MADE OUT OF ONE-SHOTS. The synth has no sustained
// voice: `tone()` starts, glides and stops. So the engine is a GRAIN fired on a
// cadence, each grain a little longer than the gap between them, so they overlap
// into something continuous — the trick the horde's stampede rumble already
// uses. It also buys the thing a sustained oscillator would have made hard: the
// cadence itself quickens with the revs, so the engine putters at a walking
// pace and thrashes at the top end.
//
// AND IT HAS A GEARBOX, which is the whole reason the note is interesting. A
// pitch that rose smoothly from standstill to 120 is a siren, not a car; what a
// car does is climb, DROP, and climb again. So the speed range is cut into
// gears: within a gear the note rises with the revs, and crossing into the next
// one drops it back down to a higher floor than the last gear started at. That
// sawtooth is what the ear hears as "accelerating", and it is why the drive
// sounds like it is being driven rather than like it is being faded up.

import type { Synth } from "@ui/lib/synth.ts";

/** How many gears the wagon has. Five, and the top one is long — the last
 * quarter of the speed range is one gear, so flat out is a sustained thrash
 * rather than another shift. */
const GEARS = [0, 0.13, 0.3, 0.5, 0.72] as const;
/** The note a gear opens at, and the note it screams at (Hz). Both climb with
 * the gear so an upshift DROPS the pitch without ever dropping it back to where
 * the car pulled away from. */
const GEAR_FLOOR = 58;
const GEAR_FLOOR_STEP = 11;
const GEAR_REACH = 74;

/** What the engine is doing at a given fraction of top speed. Pure, and
 * exported because it is the part worth testing — the sound of it is judged by
 * ear, but "the pitch drops on an upshift" is a fact a test can hold. */
export function engineNote(speedFrac: number): {
  gear: number;
  rev: number;
  hz: number;
} {
  const frac = Math.min(1, Math.max(0, speedFrac));
  let gear = 0;
  for (let i = GEARS.length - 1; i >= 0; i--) {
    if (frac >= (GEARS[i] ?? 0)) {
      gear = i;
      break;
    }
  }
  const from = GEARS[gear] ?? 0;
  const to = GEARS[gear + 1] ?? 1;
  // How far up THIS gear the car is — the revs. The top gear is measured
  // against the top of the range, so holding the throttle down keeps climbing.
  const rev = to > from ? Math.min(1, (frac - from) / (to - from)) : 0;
  const hz = GEAR_FLOOR + gear * GEAR_FLOOR_STEP + rev * GEAR_REACH;
  return { gear, rev, hz };
}

/** Ms between engine grains at idle and at the top of a gear — the putter rate,
 * which quickens with the revs exactly as a real one does. */
const GRAIN_SLOW_MS = 190;
const GRAIN_FAST_MS = 96;

/** How long to wait before the next grain, given where the revs are. */
export function engineGrainMs(rev: number): number {
  return GRAIN_SLOW_MS - (GRAIN_SLOW_MS - GRAIN_FAST_MS) * Math.min(1, rev);
}

/**
 * One grain of the running engine, plus the wind and tyre roar over it.
 *
 * `speedFrac` is road speed over the car's own top end; `wear` fattens the note
 * as the wagon comes apart — a car with its bonnet gone and a wheel off does not
 * sound like one fresh out of the bay.
 */
export function playDriveEngine(
  synth: Synth,
  speedFrac: number,
  wear: number,
): void {
  const { hz, rev } = engineNote(speedFrac);
  const load = Math.min(1, Math.max(0, speedFrac));
  // The chug. A triangle for the body, detuned into a pair so it reads as an
  // engine rather than a test tone, sagging very slightly across the grain so
  // consecutive grains sound like strokes instead of a held pipe.
  synth.tone({
    type: "triangle",
    from: hz,
    to: hz * 0.96,
    durationMs: 230,
    volume: 0.022 + 0.026 * load,
    detuneCents: 10 + 14 * wear,
  });
  // The exhaust's edge — a thin sawtooth an octave down, only really audible
  // once the revs are up, which is what makes the top of a gear sound strained.
  if (rev > 0.35) {
    synth.tone({
      type: "sawtooth",
      from: hz * 0.5,
      to: hz * 0.49,
      durationMs: 210,
      volume: 0.006 + 0.016 * rev,
      detuneCents: 16,
    });
  }
  // Wind and tyres: broadband under everything, opening up with speed. This is
  // the layer that actually sells 120 mph — pitch says revs, noise says SPEED.
  synth.noise({
    durationMs: 220,
    volume: 0.008 + 0.026 * load * load,
    filter: { type: "lowpass", frequency: 260 + 900 * load },
  });
}

/** The blip of an upshift — throttle off, the note falls away, and the next
 * grain comes in on the new gear's floor. */
export function playDriveShift(synth: Synth, speedFrac: number): void {
  const { hz } = engineNote(speedFrac);
  synth.tone({
    type: "sawtooth",
    from: hz * 1.12,
    to: hz * 0.72,
    durationMs: 90,
    volume: 0.018,
    detuneCents: 12,
  });
  synth.noise({
    durationMs: 70,
    volume: 0.012,
    filter: { type: "highpass", frequency: 2600 },
  });
}
