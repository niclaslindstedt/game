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
// car does is climb, DROP, and climb again. So the note is not a function of
// road speed at all — it is a function of the CRANK, and the crank is what the
// gearbox stands between. That sawtooth is what the ear hears as
// "accelerating", and it is why the drive sounds like it is being driven rather
// than like it is being faded up.
//
// AND THE CRANK IS THE ENGINE'S, NOT THIS FILE'S. The gearbox used to live here
// — five speed thresholds picked so the note would sawtooth nicely — which
// meant the sound had a gearbox and the CAR did not. It is real physics now
// (`src/game/drive/drivetrain.ts`): ratios, a torque curve, an automatic that
// changes up at the redline, and the wagon's acceleration solved through all
// three. So this module has one job left, which is to VOICE what the engine is
// already doing. The tachometer on the dashboard, the shove in the player's
// back and the noise out of the speaker are three readings of one model, and
// none of them can drift.

import { DRIVE, DRIVETRAIN, engineRpm, gearFor, gearRev } from "@game/core";

import type { Synth } from "@ui/lib/synth.ts";

/**
 * RPM PER HERTZ — how the crank becomes a pitch.
 *
 * A four-cylinder four-stroke fires twice per revolution, so the note it makes
 * is `rpm / 60 * 2` — which is this constant and nothing chosen by ear. It is
 * the whole of "the sound matches the rpm": idle is a 27 Hz chug you feel more
 * than hear, and the redline is 193 Hz of a tired engine being asked for more
 * than it has.
 */
const RPM_PER_HZ = 30;

/**
 * What the engine is doing at a given road speed (world px/s) — the gear the
 * box has chosen, how far up it the car is, the revs, and the note that makes.
 *
 * A thin read of the drivetrain plus the one thing that IS this module's: the
 * pitch. Exported because it is the part worth testing — the sound of it is
 * judged by ear, but "the pitch drops on an upshift" is a fact a test can hold.
 */
export function engineNote(speedPx: number): {
  gear: number;
  rev: number;
  rpm: number;
  hz: number;
} {
  const rpm = engineRpm(speedPx);
  return {
    gear: gearFor(speedPx),
    rev: gearRev(speedPx),
    rpm,
    hz: rpm / RPM_PER_HZ,
  };
}

/** Ms between engine grains at idle and at the redline — the putter rate,
 * which quickens with the crank exactly as a real one does. */
const GRAIN_SLOW_MS = 190;
const GRAIN_FAST_MS = 96;

/** How long to wait before the next grain, at these revs. Keyed to the RPM
 * rather than to how far up a gear the car is: the cadence is the engine
 * turning over, and an upshift slows it down again the way it slows the note
 * down. */
export function engineGrainMs(rpm: number): number {
  const band =
    (rpm - DRIVETRAIN.idleRpm) / (DRIVETRAIN.redlineRpm - DRIVETRAIN.idleRpm);
  const frac = Math.min(1, Math.max(0, band));
  return GRAIN_SLOW_MS - (GRAIN_SLOW_MS - GRAIN_FAST_MS) * frac;
}

/**
 * One grain of the running engine, plus the wind and tyre roar over it.
 *
 * `speedPx` is the car's own road speed — the same number the physics is
 * integrating, so the note is the engine's actual revs rather than a rendering
 * of them; `wear` fattens it as the wagon comes apart, because a car with its
 * bonnet gone and a wheel off does not sound like one fresh out of the bay.
 */
export function playDriveEngine(
  synth: Synth,
  speedPx: number,
  wear: number,
): void {
  const { hz, rev, rpm } = engineNote(speedPx);
  const load = Math.min(1, Math.abs(speedPx) / DRIVE.topSpeedPx);
  // How far up the whole rev band the crank is — which is what the timbre
  // follows, rather than road speed: a labouring engine in top and a screaming
  // one in first are at the same mph and do not sound remotely alike.
  const revBand = Math.min(
    1,
    Math.max(
      0,
      (rpm - DRIVETRAIN.idleRpm) / (DRIVETRAIN.redlineRpm - DRIVETRAIN.idleRpm),
    ),
  );
  // The chug: the firing note itself. A triangle for the body, detuned into a
  // pair so it reads as an engine rather than a test tone, sagging very slightly
  // across the grain so consecutive grains sound like strokes instead of a held
  // pipe.
  synth.tone({
    type: "triangle",
    from: hz,
    to: hz * 0.96,
    durationMs: 230,
    volume: 0.022 + 0.026 * load,
    detuneCents: 10 + 14 * wear,
  });
  // ITS OCTAVE, which is what carries the note at all down at the bottom of the
  // band: a 28 Hz idle is a thing a phone speaker cannot reproduce and a player
  // would hear as silence. It fades out as the crank climbs and the fundamental
  // comes up into its own — the same way a real engine stops sounding boomy and
  // starts sounding sharp.
  synth.tone({
    type: "triangle",
    from: hz * 2,
    to: hz * 1.94,
    durationMs: 220,
    volume: 0.018 - 0.013 * revBand,
    detuneCents: 8,
  });
  // The exhaust's edge — a thin sawtooth on the firing note, only really
  // audible once the revs are up, which is what makes the top of a gear sound
  // strained.
  if (rev > 0.35) {
    synth.tone({
      type: "sawtooth",
      from: hz,
      to: hz * 0.98,
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

/**
 * The blip of an upshift — throttle off, the note falls away, and the next
 * grain comes in on the new gear's floor.
 *
 * It falls from the REDLINE, because that is where the box always lets go: a
 * shift happens at exactly the revs that would have passed it, so the drop the
 * player hears is the real interval between the two gears rather than a
 * decoration on top of the new one.
 */
export function playDriveShift(synth: Synth, speedPx: number): void {
  const { hz } = engineNote(speedPx);
  synth.tone({
    type: "sawtooth",
    from: DRIVETRAIN.redlineRpm / RPM_PER_HZ,
    to: hz * 0.94,
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
