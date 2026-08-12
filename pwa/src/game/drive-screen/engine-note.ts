// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ROAD'S OWN ENGINE — what the wagon's crank is doing, and the blip when
// the box lets go of it.
//
// WHY THIS IS CODE AND NOT A `content/sounds/` ENTRY. Everything discrete about
// the drive IS content (`drive_*.yaml`, played by id — see `playDriveSound`);
// what lives here is the one thing a static entry cannot hold: a note that
// rides a CONTINUOUS parameter. The engine's pitch is a function of road speed
// and nothing else, and it has to be re-evaluated several times a second — the
// same reason the sandstorm's howl and the stampede's rumble kept their code
// while the rest of the bank moved into YAML.
//
// WHAT IT IS NOT is the sound itself. The LAYERS a running engine is made of —
// the hum, its octave, the bass under it, the air over it, the clatter of the
// parts, and the overlapping-grain trick that turns one-shots into one unbroken
// note — are `pwa/src/game/sfx/engine-bed.ts`, because this game has TWO cars
// and they are the same car: the wagon on the road here, and the same wagon
// being manoeuvred around a level (`sfx/car-engine.ts`). Two readings of one
// voice, and neither of them owns it.
//
// WHAT IS LEFT HERE IS THE CRANK, which is the whole reason the note is
// interesting. A pitch that rose smoothly from standstill to 174 is a siren,
// not a car; what a car does is climb, DROP, and climb again. So the note is
// not a function of road speed at all — it is a function of the crank, and the
// crank is what the gearbox stands between. That sawtooth is what the ear hears
// as "accelerating", and it is why the drive sounds like it is being driven
// rather than like it is being faded up.
//
// AND THE CRANK IS THE ENGINE'S, NOT THIS FILE'S. The gearbox used to live here
// — five speed thresholds picked so the note would sawtooth nicely — which
// meant the sound had a gearbox and the CAR did not. It is real physics now
// (`engine/game/drive/drivetrain.ts`): ratios, a torque curve, an automatic that
// changes up a good thousand revs short of the redline, and the wagon's
// acceleration solved through all three. So this module has one job left, which
// is to VOICE what the engine is already doing. The tachometer on the
// dashboard, the shove in the player's back and the noise out of the speaker
// are three readings of one model, and none of them can drift.

import { DRIVE, DRIVETRAIN, engineRpm, gearFor, gearRev } from "@game/core";

import type { Synth } from "@ui/lib/synth.ts";

import {
  ENGINE_GRAIN_MS,
  RPM_PER_HZ,
  grainLifeMs,
  noteHz,
  playEngineBed,
} from "../sfx/engine-bed.ts";

export { ENGINE_GRAIN_MS } from "../sfx/engine-bed.ts";

/** How long one of the road's grains lasts — three cadences, which is how far
 * ahead the note has to be predicted (`glideTo`). */
const GRAIN_LIFE_MS = grainLifeMs(ENGINE_GRAIN_MS);

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
    hz: noteHz(rpm),
  };
}

/**
 * WHERE THE NOTE IS HEADING — the pitch this grain glides to over its life.
 *
 * Every grain covers three cadences, so at any instant three of them are
 * sounding and they must agree about the pitch or the engine chorusses against
 * itself every time the car accelerates. They agree by each gliding along the
 * SAME line: the road speed is extrapolated a full grain-life forward at the
 * rate it has been changing, so a grain fired now ends where a grain fired at
 * its end will begin.
 *
 * IT IS THE CRANK THAT IS EXTRAPOLATED, NOT THE ROAD SPEED, and that is the
 * whole subtlety. A prediction run through the gearbox walks into the NEXT gear
 * and comes back with a pitch a third lower — so the note would start falling
 * away a third of a second before the shift, which is the one moment on this
 * road the ear is actually listening to. Revs cannot do that: they climb to
 * where the box lets go and no further, which is what the clamp says.
 *
 * And across a shift there is no rate to read at all — the crank did not slow
 * down, it was handed a different gear — so the grain that straddles one holds
 * its pitch and lets the blip (`playDriveShift`) be the event.
 */
function glideTo(speedPx: number, prev: EnginePrev | undefined): number {
  const { gear, rpm } = engineNote(speedPx);
  if (!prev || prev.dtMs <= 0) return noteHz(rpm);
  const before = engineNote(prev.speedPx);
  if (before.gear !== gear) return noteHz(rpm);
  const rate = (rpm - before.rpm) / prev.dtMs;
  const ahead = Math.max(
    DRIVETRAIN.idleRpm,
    Math.min(DRIVETRAIN.shiftUpRpm, rpm + rate * GRAIN_LIFE_MS),
  );
  return noteHz(ahead);
}

/** The grain before this one: how fast the car was going, and how long ago —
 * which is all it takes to know where the note is going next. */
export type EnginePrev = { speedPx: number; dtMs: number };

/**
 * One grain of the running engine, plus the wind and tyre roar over it.
 *
 * `speedPx` is the car's own road speed — the same number the physics is
 * integrating, so the note is the engine's actual revs rather than a rendering
 * of them; `wear` fattens it as the wagon comes apart, because a car with its
 * bonnet gone and a wheel off does not sound like one fresh out of the bay.
 * `prev` is the grain before this one, absent only for the first of a leg (see
 * `glideTo`), and `tickAtMs` is how far into this grain the clatter's next tick
 * falls.
 *
 * Returns where that clatter has got to — the ms into the NEXT grain at which
 * its first tick is due, which the caller hands straight back
 * (`EngineNoteState.tickMs`).
 *
 * ON THE ROAD, "HOW HARD IT IS WORKING" AND "HOW FAST THE AIR IS GOING PAST"
 * ARE ONE NUMBER, which is why both of the bed's loads are handed the same
 * fraction of top speed. They part company only down in the bay, where the car
 * is at full throttle at a walking pace (`sfx/car-engine.ts`).
 */
export function playDriveEngine(
  synth: Synth,
  speedPx: number,
  wear: number,
  prev?: EnginePrev,
  tickAtMs = 0,
): number {
  const { hz, rev, rpm } = engineNote(speedPx);
  const load = Math.min(1, Math.abs(speedPx) / DRIVE.topSpeedPx);
  return playEngineBed(
    synth,
    {
      hz,
      toHz: glideTo(speedPx, prev),
      rpm,
      rev,
      throttle: load,
      air: load,
      wear,
      grainMs: ENGINE_GRAIN_MS,
    },
    tickAtMs,
  );
}

/**
 * The blip of an upshift — throttle off, the note falls away, and the next
 * grain comes in on the new gear's floor.
 *
 * It falls from the SHIFT POINT, because that is where the box always lets go:
 * a shift happens at exactly the revs that would have passed it, so the drop the
 * player hears is the real interval between the two gears rather than a
 * decoration on top of the new one. (It is emphatically NOT the redline — the
 * wagon never gets within a thousand revs of that, and a blip that fell from
 * there would be a note the engine was never making.)
 *
 * THE BAY HAS NO PEER TO THIS, and that is not an omission: a car being
 * manoeuvred never leaves first, so there is no shift to mark.
 */
export function playDriveShift(synth: Synth, speedPx: number): void {
  const { hz } = engineNote(speedPx);
  synth.tone({
    type: "sawtooth",
    from: DRIVETRAIN.shiftUpRpm / RPM_PER_HZ,
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
