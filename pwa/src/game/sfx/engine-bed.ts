// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A RUNNING ENGINE, MADE OUT OF ONE-SHOTS — and there are two cars in this
// game, so the voice lives here rather than inside either of them.
//
// WHY THIS IS CODE AND NOT A `content/sounds/` ENTRY. Everything discrete a car
// does IS content (the road's `drive_*.yaml`, the run's `car_start`); what lives
// here is the one thing a static entry cannot hold: a note that rides a
// CONTINUOUS parameter. The engine's pitch is a function of the crank and
// nothing else, and it has to be re-evaluated several times a second — the same
// reason the sandstorm's howl and the stampede's rumble kept their code
// (`scripts/sound-data/record.mjs`'s PARAMETERIZED list).
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
// So: pitch says revs, and nothing else has to.
//
// TWO CARS, ONE VOICE, AND THE ONLY DIFFERENCE IS THE CRANK. The road's wagon
// (`drive-screen/engine-note.ts`) voices a real drivetrain — five gears, a
// torque curve, and a note that sawtooths to 6300 rpm. The car in the BAY
// (`car-engine.ts`) is the SAME wagon being manoeuvred in first, never asked
// for more than a third of its band: same layers, same shape, same arithmetic,
// a good octave lower and with no wind behind it. Neither of them owns a layer,
// and neither may drift from the other by accident — which is what this module
// buys and is the whole reason it exists.
//
// AND THE CADENCE IS A PARAMETER, because the two are fired by different
// clocks: the road schedules its own grains on the drive's clock, and the bay's
// arrive as `carEngine` events on the simulation's (`CAR.engineCueMs`, which is
// exactly twice as slow). Every number in a grain scales with the cadence
// (`grainShape`), so a bed fired at half the rate is the SAME bed — three
// grains sounding at once, the same summed level — rather than a quieter one
// with holes in it.
//
// WHAT IT MAY NOT IMPORT is anything out of `@game/core`. No module in the
// sound bank has an edge into the engine (`listener.ts`'s header has the
// reason: the bank is reached from the interface's side too, where the critical
// path is measured), so the four numbers below that are really the wagon's own
// are COPIED here and pinned to their originals by
// `tests/content/car_engine_test.ts` — the same arrangement `server/wire/frames.ts`
// uses for the command list, and for the same reason.

import type { Synth } from "@ui/lib/synth.ts";

/**
 * RPM PER HERTZ — how the crank becomes a pitch.
 *
 * A SIX-cylinder four-stroke fires three times per revolution, so the note it
 * makes is `rpm / 60 * 3` — which is this constant and nothing chosen by ear.
 * It is the whole of "the sound matches the rpm": idle is a 40 Hz chug you feel
 * more than hear, and the top of a gear is 315 Hz of a tired engine being asked
 * for more than it has.
 *
 * IT IS A SIX BECAUSE THE BROCHURE SAYS SO. The wagon's engine makes five
 * hundred and eighty newton-metres and gives up before seven thousand
 * (`engine/game/drive/drivetrain.ts`), which is a big lazy thing and not the
 * four-cylinder this used to divide by — and the arithmetic is not cosmetic:
 * the same note over half the rev range would have dropped the whole engine an
 * octave the day the gearing became realistic, straight into the part of the
 * spectrum a phone speaker cannot reproduce.
 */
export const RPM_PER_HZ = 20;

/**
 * THE CRANK'S OWN TWO NUMBERS — where it idles, and where the box lets go of
 * it. `DRIVETRAIN.idleRpm` and `DRIVETRAIN.shiftUpRpm`, copied rather than
 * imported (see the module header) and pinned by test.
 *
 * They are here rather than at either caller because they are what a set of
 * revs is MEASURED AGAINST — the road and the bay have to agree about how far
 * up the band 2000 rpm is, or the same engine sounds like two different ones
 * depending on which side of a garage door it is on.
 */
export const IDLE_RPM = 800;
export const SHIFT_UP_RPM = 6300;

/** The firing note these revs make (Hz). */
export function noteHz(rpm: number): number {
  return rpm / RPM_PER_HZ;
}

/**
 * HOW FAR UP THE USABLE BAND a set of revs is — idle at 0, the shift point at
 * 1, and everything the ear cares about in between. What the TIMBRE follows,
 * rather than road speed: a labouring engine in top and a screaming one in
 * first are at the same mph and do not sound remotely alike.
 *
 * MEASURED TO THE SHIFT POINT AND NOT TO THE REDLINE, which is the whole reason
 * this is a function rather than two copies of a subtraction. The box lets go a
 * thousand revs short of the stop, so a band drawn to the redline would spend
 * the entire trip in its bottom two thirds: the note would never get its edge,
 * and a car at the top of third would sound like the same car idling at the
 * lights.
 */
export function revBandAt(rpm: number): number {
  const span = Math.max(1, SHIFT_UP_RPM - IDLE_RPM);
  return Math.min(1, Math.max(0, (rpm - IDLE_RPM) / span));
}

/**
 * THE ROAD'S CADENCE, and the shape below is written in its units.
 *
 * `ENGINE_GRAIN_MS` is how often a grain is fired and the other numbers are its
 * shape: it comes up over the attack, sits at its peak for the hold, and falls
 * away over what is left. Fire one every `ENGINE_GRAIN_MS` and three of them
 * are sounding at any instant, their holds tiling end to end — the summed level
 * wobbles by about a decibel, which is engine roughness rather than a pulse.
 *
 * They are related, not independently chosen: the cadence has to be about a
 * HALF of the hold (three overlapping grains), and the life has to be the whole
 * of the attack, the hold and a short tail. Move one and the bed either gaps or
 * gets loud — which is why a bed fired on a DIFFERENT cadence scales all of
 * them together (`grainShape`) instead of picking new ones.
 */
export const ENGINE_GRAIN_MS = 105;
const GRAIN_ATTACK_MS = 60;
const GRAIN_HOLD_MS = 200;
const GRAIN_LIFE_MS = 320;

/** …and the wind's, which is the same grain in noise. It runs longer because
 * uncorrelated noise sums in POWER rather than in level, so a broadband bed
 * needs a deeper stack of grains than a pitched one to stop fluttering. */
const WIND_LIFE_MS = 525;

/** How long ONE grain of a bed fired every `grainMs` lasts — three cadences,
 * which is how far ahead a caller has to look when it works out where the note
 * is travelling (`glideTo`, engine-note.ts). */
export function grainLifeMs(grainMs: number): number {
  return grainShape(grainMs).lifeMs;
}

/** The whole grain, in the units of whatever cadence it is being fired on. At
 * the road's own cadence the scale is exactly 1 and these are the four numbers
 * above, unchanged. */
function grainShape(grainMs: number): {
  attackMs: number;
  holdMs: number;
  lifeMs: number;
  windMs: number;
} {
  const scale = grainMs / ENGINE_GRAIN_MS;
  return {
    attackMs: GRAIN_ATTACK_MS * scale,
    holdMs: GRAIN_HOLD_MS * scale,
    lifeMs: GRAIN_LIFE_MS * scale,
    windMs: WIND_LIFE_MS * scale,
  };
}

/** How low the BASS bed is allowed to go. Below about here a phone gives you
 * nothing and a desktop gives you cabinet noise, so the layer that is supposed
 * to be holding the whole sound up would simply stop existing at idle — which
 * is exactly where it is doing the most work. */
const BASS_FLOOR_HZ = 42;

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
/**
 * How close together they may get before it is a buzz rather than a clatter.
 * By the revs that reach this the ticks are most of the way faded out anyway.
 *
 * IT DOES NOT SCALE WITH THE CADENCE, unlike everything else about a grain: it
 * is a fact about what an ear can still hear as separate events, not about how
 * often the bed is being topped up. Scaled, a bed fired half as often would
 * have flattened the bay's clatter to well under the crank's own rate — the one
 * layer whose whole job is to be counted.
 */
const TICK_FLOOR_MS = ENGINE_GRAIN_MS / 4;

/**
 * ONE ENGINE, AT ONE INSTANT — everything a grain needs to know, and nothing
 * about which car it belongs to.
 *
 * `throttle` and `air` are deliberately two numbers rather than the one the
 * road can get away with. For the wagon on the motorway they are the same
 * fraction — how hard it is working IS how fast it is going — but the car
 * pulling out of a bay is working for its living at a walking pace, and a
 * standing start that opened up the wind roar of 170 mph would be a car being
 * lifted by a crane.
 */
export type EngineVoice = {
  /** The firing note now (Hz), and where the grain should glide to over its
   * life so the three that sound together agree about the pitch. */
  hz: number;
  toHz: number;
  /** What the crank is turning at — the clatter's own rate. */
  rpm: number;
  /** How far up the CURRENT gear the crank is, 0..1 — the exhaust's edge. */
  rev: number;
  /** How hard the engine is working, 0..1 — the hum and the bass. */
  throttle: number;
  /** How fast the air is going past, 0..1 of what this car can ever do — the
   * wind and the tyres. */
  air: number;
  /** How far the car has come apart, 0..1: a fatter, tickier engine. */
  wear: number;
  /** The cadence this bed is being fired on (ms) — see the module header. */
  grainMs: number;
};

/**
 * One grain of a running engine, plus the wind and tyre roar over it.
 *
 * `tickAtMs` is how far into this grain the clatter's next tick falls; the
 * return is the same thing for the NEXT grain, which the caller hands straight
 * back. (The road keeps it on `EngineNoteState.tickMs`; the bay keeps it in
 * `car-engine.ts`.)
 *
 * THE LEVELS ARE THE SUM'S, NOT THE GRAIN'S. Three grains sound at once, so
 * every volume here is roughly a third of what the player actually hears — the
 * numbers look quiet beside the rest of the bank and are not.
 */
export function playEngineBed(
  synth: Synth,
  voice: EngineVoice,
  tickAtMs = 0,
): number {
  const { hz, toHz: to, rpm, rev, throttle, air, wear, grainMs } = voice;
  const { attackMs, holdMs, lifeMs, windMs } = grainShape(grainMs);
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
    durationMs: lifeMs,
    attackMs,
    holdMs,
    volume: 0.008 + 0.01 * throttle,
    detuneCents: 10 + 14 * wear,
  });
  // ITS OCTAVE, which is what carries the note at all down at the bottom of the
  // band: a 40 Hz idle is barely a thing a phone speaker can reproduce, and a
  // player would hear most of it as silence. It fades out as the crank climbs
  // and the fundamental comes up into its own — the same way a real engine
  // stops sounding boomy and starts sounding sharp.
  synth.tone({
    type: "triangle",
    from: hz * 2,
    to: to * 2,
    durationMs: lifeMs,
    attackMs,
    holdMs,
    volume: 0.007 - 0.005 * revBand,
    detuneCents: 8,
  });
  // The exhaust's edge — a thin sawtooth on the firing note, only really
  // audible once the revs are up, which is what makes the top of a gear sound
  // strained. A car being parked never reaches it, and should not.
  if (rev > 0.35) {
    synth.tone({
      type: "sawtooth",
      from: hz,
      to,
      durationMs: lifeMs,
      attackMs,
      holdMs,
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
  synth.tone({
    type: "sine",
    from: Math.max(BASS_FLOOR_HZ, hz * 0.5),
    to: Math.max(BASS_FLOOR_HZ, to * 0.5),
    durationMs: lifeMs,
    attackMs,
    holdMs,
    volume: 0.009 + 0.007 * throttle,
    detuneCents: 5,
  });
  // ── THE AIR ───────────────────────────────────────────────────────────────
  // Wind and tyres: broadband under everything, opening up with speed. This is
  // the layer that actually sells 120 mph — pitch says revs, noise says SPEED —
  // and it is the layer a car crossing a garage barely has at all.
  //
  // A NOISE GRAIN NEEDS NO HOLD, and could not be given one: its fade is baked
  // into the buffer and it is LINEAR rather than exponential, so a stack of
  // them is already most of the way to level. What it needs instead is depth —
  // five deep here against the pitched layers' three.
  synth.noise({
    durationMs: windMs,
    volume: 0.004 + 0.012 * air * air,
    filter: { type: "lowpass", frequency: 260 + 900 * air },
  });
  // ── THE CLATTER ───────────────────────────────────────────────────────────
  // One tick per revolution across this grain's own window (see TICK_MS above).
  // Loudest at idle and as the wagon falls apart — a tired engine ticks, and a
  // tired engine that has lost its bonnet ticks at you — and never gone
  // entirely, because it is the layer that says the noise has parts in it.
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
  for (let i = 0; at < grainMs; i++, at += gap) {
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
  return at - grainMs;
}
