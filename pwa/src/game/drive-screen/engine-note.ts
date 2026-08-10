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
// cadence, and the grains overlap into something continuous — the trick the
// horde's stampede rumble already uses.
//
// WHAT THE ENGINE IS MADE OF, in the order the ear finds them: a HUM (the
// firing note, the one layer whose pitch moves), a CLATTER over it (a dry tick
// per turn of the crank — the parts), a BASS bed under it (the mass of the car,
// nearly still), and the AIR of the wind and tyres across the top. Four jobs,
// and no two of them answer the same question: the hum says how hard the engine
// is working, the clatter says it is machinery, the bass says it is two tonnes
// of it, and the air says how fast it is going.
//
// AND "OVERLAP" IS NOT ENOUGH ON ITS OWN, which is what this used to get wrong.
// A tone's level falls exponentially across its whole length — a tenth of the
// peak a quarter of the way in — so grains that merely outlast the gap between
// them still arrive as separate events: what came out of the speaker was a
// putt … putt … putt with daylight between the putts, five to nine times a
// second, and a car does not do that at any speed. Three things fix it and all
// three are needed: the grain HOLDS its peak (`holdMs`, the sustain the voice
// grew for this), the cadence is a FRACTION of the hold rather than most of it
// so three grains are always up together, and the cadence is CONSTANT. That
// last one is the counter-intuitive half — a cadence that quickened with the
// revs made the rate of the putter the thing the ear followed, when the rate
// the engine is actually turning at is the PITCH and always was.
//
// So: pitch says revs, and nothing else has to. What the player hears is one
// unbroken note that climbs as the car does.
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
// (`engine/game/drive/drivetrain.ts`): ratios, a torque curve, an automatic that
// changes up a good thousand revs short of the redline, and the wagon's
// acceleration solved through all three. So this module has one job left, which
// is to VOICE what the engine is already doing. The tachometer on the
// dashboard, the shove in the player's back and the noise out of the speaker
// are three readings of one model, and none of them can drift.

import { DRIVE, DRIVETRAIN, engineRpm, gearFor, gearRev } from "@game/core";

import type { Synth } from "@ui/lib/synth.ts";

/**
 * RPM PER HERTZ — how the crank becomes a pitch.
 *
 * A SIX-cylinder four-stroke fires three times per revolution, so the note it
 * makes is `rpm / 60 * 3` — which is this constant and nothing chosen by ear.
 * It is the whole of "the sound matches the rpm": idle is a 40 Hz chug you feel
 * more than hear, and the top of a gear is 165 Hz of a tired engine being asked
 * for more than it has.
 *
 * IT IS A SIX BECAUSE THE BROCHURE SAYS SO. The wagon's engine makes four
 * hundred newton-metres and gives up before five thousand
 * (`engine/game/drive/drivetrain.ts`), which is a big lazy oil-burner and not the
 * four-cylinder this used to divide by — and the arithmetic is not cosmetic:
 * the same note over half the rev range would have dropped the whole engine an
 * octave the day the gearing became realistic, straight into the part of the
 * spectrum a phone speaker cannot reproduce.
 */
const RPM_PER_HZ = 20;

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

/**
 * THE GRAIN, and the four numbers that make a bed out of one-shots.
 *
 * `ENGINE_GRAIN_MS` is how often one is fired and the other three are its
 * shape: it comes up over the attack, sits at its peak for the hold, and falls
 * away over what is left. Fire one every `ENGINE_GRAIN_MS` and three of them
 * are sounding at any instant, their holds tiling end to end — the summed level
 * wobbles by about a decibel, which is engine roughness rather than a pulse.
 *
 * They are related, not independently chosen: the cadence has to be about a
 * HALF of the hold (three overlapping grains), and the life has to be the whole
 * of the attack, the hold and a short tail. Move one and the bed either gaps or
 * gets loud.
 */
export const ENGINE_GRAIN_MS = 105;
const GRAIN_ATTACK_MS = 60;
const GRAIN_HOLD_MS = 200;
const GRAIN_LIFE_MS = 320;

/** …and the wind's, which is the same grain in noise. It runs longer because
 * uncorrelated noise sums in POWER rather than in level, so a broadband bed
 * needs a deeper stack of grains than a pitched one to stop fluttering. */
const WIND_LIFE_MS = 525;

/** How low the BASS bed is allowed to go. Below about here a phone gives you
 * nothing and a desktop gives you cabinet noise, so the layer that is supposed
 * to be holding the whole sound up would simply stop existing at idle — which
 * is exactly where it is doing the most work. */
const BASS_FLOOR_HZ = 42;

/**
 * HOW FAR UP THE USABLE BAND a set of revs is — idle at 0, the shift point at
 * 1, and everything the ear cares about in between.
 *
 * MEASURED TO THE SHIFT POINT AND NOT TO THE REDLINE, which is the whole reason
 * this is a function rather than two copies of a subtraction. The box lets go a
 * thousand revs short of the stop (`DRIVETRAIN.shiftUpRpm`), so a band drawn to
 * the redline would spend the entire trip in its bottom two thirds: the note
 * would never get its edge, and a car at the top of third would sound like the
 * same car idling at the lights.
 */
function revBandAt(rpm: number): number {
  const span = Math.max(1, DRIVETRAIN.shiftUpRpm - DRIVETRAIN.idleRpm);
  return Math.min(1, Math.max(0, (rpm - DRIVETRAIN.idleRpm) / span));
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
  if (!prev || prev.dtMs <= 0) return rpm / RPM_PER_HZ;
  const before = engineNote(prev.speedPx);
  if (before.gear !== gear) return rpm / RPM_PER_HZ;
  const rate = (rpm - before.rpm) / prev.dtMs;
  const ahead = Math.max(
    DRIVETRAIN.idleRpm,
    Math.min(DRIVETRAIN.shiftUpRpm, rpm + rate * GRAIN_LIFE_MS),
  );
  return ahead / RPM_PER_HZ;
}

/** The grain before this one: how fast the car was going, and how long ago —
 * which is all it takes to know where the note is going next. */
export type EnginePrev = { speedPx: number; dtMs: number };

/**
 * THE CLATTER — the mechanical layer over the note: one dry tick per turn of
 * the crank, which is a tappet and an injector and a driveshaft and every other
 * hard thing in there arriving once a revolution.
 *
 * IT IS WHAT MAKES THE BED SOUND LIKE MACHINERY rather than like a tone
 * generator. The chug, the octave and the exhaust are all one pitch in three
 * flavours; nothing in them says the noise is coming out of an object with
 * parts in it. A tick does, and it does it for almost nothing: it is the
 * shortest sound in the game.
 *
 * ITS RATE IS THE CRANK'S, NOT THE GRAIN'S, and that is the one thing that has
 * to be got right. Ticks are the layer the ear can actually COUNT at the bottom
 * of the band — the putter a car makes idling at the lights, which quickens as
 * the revs come up until it blurs into the note itself. Tie their phase to the
 * grains and they lope at the grain rate instead, which is a rhythm nothing in
 * the car is making. So the phase is carried across grains by the caller.
 */
const TICK_MS = 13;
/** How close together they may get before it is a buzz rather than a clatter —
 * which also bounds how many a grain can hold. By the revs that reach this the
 * ticks are most of the way faded out anyway. */
const TICK_FLOOR_MS = ENGINE_GRAIN_MS / 4;

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
 * THE LEVELS ARE THE SUM'S, NOT THE GRAIN'S. Three grains sound at once, so
 * every volume here is roughly a third of what the player actually hears — the
 * numbers look quiet beside the rest of the bank and are not.
 */
export function playDriveEngine(
  synth: Synth,
  speedPx: number,
  wear: number,
  prev?: EnginePrev,
  tickAtMs = 0,
): number {
  const { hz, rev, rpm } = engineNote(speedPx);
  const to = glideTo(speedPx, prev);
  const load = Math.min(1, Math.abs(speedPx) / DRIVE.topSpeedPx);
  // How far up the usable rev band the crank is — which is what the timbre
  // follows, rather than road speed: a labouring engine in top and a screaming
  // one in first are at the same mph and do not sound remotely alike.
  const revBand = revBandAt(rpm);

  // ── THE HUM ───────────────────────────────────────────────────────────────
  // The firing note itself, in three flavours: the chug, its octave, and the
  // exhaust's edge on top. This is the layer that says how fast the engine is
  // turning, and the only one whose pitch moves.
  //
  // A triangle for the body, detuned into a pair so it reads as an engine
  // rather than a test tone, and gliding to where the note will be when this
  // grain runs out rather than sagging off it — a sag was what made a grain
  // sound like a stroke, and strokes are the thing this is no longer made of.
  synth.tone({
    type: "triangle",
    from: hz,
    to,
    durationMs: GRAIN_LIFE_MS,
    attackMs: GRAIN_ATTACK_MS,
    holdMs: GRAIN_HOLD_MS,
    volume: 0.008 + 0.01 * load,
    detuneCents: 10 + 14 * wear,
  });
  // ITS OCTAVE, which is what carries the note at all down at the bottom of the
  // band: a 40 Hz idle is barely a thing a phone speaker can reproduce, and a
  // player would hear most of it as silence. It fades out as the crank climbs and the fundamental
  // comes up into its own — the same way a real engine stops sounding boomy and
  // starts sounding sharp.
  synth.tone({
    type: "triangle",
    from: hz * 2,
    to: to * 2,
    durationMs: GRAIN_LIFE_MS,
    attackMs: GRAIN_ATTACK_MS,
    holdMs: GRAIN_HOLD_MS,
    volume: 0.007 - 0.005 * revBand,
    detuneCents: 8,
  });
  // The exhaust's edge — a thin sawtooth on the firing note, only really
  // audible once the revs are up, which is what makes the top of a gear sound
  // strained.
  if (rev > 0.35) {
    synth.tone({
      type: "sawtooth",
      from: hz,
      to,
      durationMs: GRAIN_LIFE_MS,
      attackMs: GRAIN_ATTACK_MS,
      holdMs: GRAIN_HOLD_MS,
      volume: 0.002 + 0.006 * rev,
      detuneCents: 16,
    });
  }
  // ── THE BASS ──────────────────────────────────────────────────────────────
  // THE FLOOR OF THE WHOLE THING — a low sine an octave under the firing note:
  // the mass of the car, the drivetrain, and the road coming up through the
  // floorpan. It is the layer nobody picks out and everybody would miss.
  //
  // FLOORED, AND THAT IS THE POINT. Half of a 40 Hz idle is 20 Hz, which is not
  // a note, it is a speaker excursion — nothing reproduces it and the hum is
  // left standing on nothing. Held at the bottom of the range instead, so the
  // bass is a bed the note sits ON rather than a second voice tracking it: it
  // barely moves at the bottom of the band and follows the octave up only once
  // there is somewhere to follow it to.
  const bassFrom = Math.max(BASS_FLOOR_HZ, hz * 0.5);
  synth.tone({
    type: "sine",
    from: bassFrom,
    to: Math.max(BASS_FLOOR_HZ, to * 0.5),
    durationMs: GRAIN_LIFE_MS,
    attackMs: GRAIN_ATTACK_MS,
    holdMs: GRAIN_HOLD_MS,
    volume: 0.009 + 0.007 * load,
    detuneCents: 5,
  });
  // ── THE AIR ───────────────────────────────────────────────────────────────
  // Wind and tyres: broadband under everything, opening up with speed. This is
  // the layer that actually sells 120 mph — pitch says revs, noise says SPEED.
  //
  // A NOISE GRAIN NEEDS NO HOLD, and could not be given one: its fade is baked
  // into the buffer and it is LINEAR rather than exponential, so a stack of
  // them is already most of the way to level. What it needs instead is depth —
  // five deep here against the pitched layers' three.
  synth.noise({
    durationMs: WIND_LIFE_MS,
    volume: 0.004 + 0.012 * load * load,
    filter: { type: "lowpass", frequency: 260 + 900 * load },
  });
  // ── THE CLATTER ───────────────────────────────────────────────────────────
  // One tick per revolution across this grain's own window (see
  // TICK_MS above). Loudest at idle and as the wagon falls apart — a tired
  // engine ticks, and a tired engine that has lost its bonnet ticks at you —
  // and never gone entirely, because it is the layer that says the noise has
  // parts in it.
  //
  // ALTERNATE TICKS ARE LIGHTER AND BRIGHTER, which is not decoration: a
  // four-stroke's events are not all the same event, and a perfectly even tick
  // is the one thing that reads as a metronome instead of an engine. The
  // alternation is counted within the grain rather than across the leg, so it
  // occasionally lands two of a kind in a row — which is more of the same
  // unevenness rather than a fault in it. Deterministic either way: the road is
  // replayed after a breakdown and must sound the same, and nothing here may
  // spend a draw on presentation.
  const gap = Math.max(TICK_FLOOR_MS, 60000 / Math.max(1, rpm));
  const tick = (0.005 + 0.009 * wear) * (0.35 + 0.65 * (1 - revBand));
  let at = tickAtMs;
  for (let i = 0; at < ENGINE_GRAIN_MS; i++, at += gap) {
    synth.noise({
      durationMs: TICK_MS,
      delayMs: at,
      volume: tick * (i % 2 === 0 ? 1 : 0.62),
      pan: -0.18,
      filter: {
        type: "bandpass",
        frequency: i % 2 === 0 ? 2100 : 2900,
        q: 2.2,
      },
    });
  }
  return at - ENGINE_GRAIN_MS;
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
