// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// ONE TICK'S DRAIN — what the sim's events become on the way to the player's
// eyes, ears and hands.
//
// THE ENGINE SAYS WHAT HAPPENED AND THIS FILE SAYS WHAT THAT IS LIKE, the
// drive's own split: `stepFlight` leaves `events` and `strikes` full, and this
// empties them into the fx layer, the sound bank and the speech box. Both the
// screen and the `?rocket` workbench run it unchanged; what happens AFTER a
// terminal beat is policy and lives in `end-flight.ts` instead.

import {
  FLIGHT,
  FLIGHT_OUTCOME,
  flightOffCourse,
  flightShellClear,
  flightWindPx,
  type FlightState,
} from "@game/core";

import { synth } from "../audio.ts";
import { playFlightSound } from "../sfx/index.ts";
import { FLIGHT_TIPPING, FLIGHT_VOICE } from "./voice.ts";
import {
  BOOM_DEEP_SOUND,
  BOOST_SOUND,
  CLANG_SOUNDS,
  ORBIT_SOUND,
  POOF_SOUND,
  RAIN_SOUND,
  RUMBLE_SOUND,
  SPLAT_SOUNDS,
  STICK_SOUNDS,
  THUNDER_SOUNDS,
  TOUCHDOWN_SOUND,
  WARNING_SOUND,
  boomFor,
  takeAt,
} from "./rocket-sounds.ts";
import {
  boomFx,
  burstFx,
  poofFx,
  splatFx,
  type RocketFxState,
} from "./rocket-fx.ts";
import { STRIKE_WINDOW_MS, stormIntensity, thunderDue } from "./storm.ts";

/** Where the wind meter's red begins for the jet-stream line — the Lua
 * ladder's own top rung (`content/hud/scripts/rocket.lua`). */
const JET_LINE_FRAC = 0.8;
/** …and how far off the corridor earns the off-course line. */
const OFF_COURSE_LINE_FRAC = 0.5;

/** The one-shot beats this drain owes exactly once per flight — the sim can
 * only raise `orbit` once, but the shell-clear line is an EDGE the app reads,
 * so the app keeps the latch. The sky's SURPRISES are once-per-flight too
 * (the first bird, the first canopy, the first jet-stream shove, the first
 * proper wander); only the tip-over line repeats, as a rotation, because the
 * ship never stops trying. */
export type FlightBeats = {
  clearSaid: boolean;
  monologueSaid: boolean;
  descentSaid: boolean;
  birdSaid: boolean;
  hobbyistSaid: boolean;
  jetSaid: boolean;
  offCourseSaid: boolean;
  /** How many tip-over scares have spoken — the rotation's cursor. */
  tips: number;
};

export function createFlightBeats(): FlightBeats {
  return {
    clearSaid: false,
    monologueSaid: false,
    descentSaid: false,
    birdSaid: false,
    hobbyistSaid: false,
    jetSaid: false,
    offCourseSaid: false,
    tips: 0,
  };
}

/**
 * Drain one tick. `say` raises a thought by id — the screen owns the box.
 * Muted (`auto`) surfaces pass a no-op.
 */
export function drainFlight(
  flight: FlightState,
  fx: RocketFxState,
  beats: FlightBeats,
  say: (id: string) => void,
): void {
  const nowMs = flight.ms;

  for (const event of flight.events) {
    switch (event.type) {
      case "stuck":
        playFlightSound(synth, takeAt(STICK_SOUNDS, event.side * 40, nowMs));
        break;
      case "strike":
        playFlightSound(synth, takeAt(CLANG_SOUNDS, event.x, event.alt));
        break;
      case "explosion":
        boomFx(fx, event.x, event.alt, event.size, event.seed, nowMs);
        playFlightSound(synth, boomFor(event.seed));
        // The big one gets the floor under it — the layer that makes a ship
        // going up read as bigger than a satellite going up.
        if (event.size === "big") playFlightSound(synth, BOOM_DEEP_SOUND);
        break;
      case "splat": {
        // Something soft across the nose: the thud, the gore-gated burst and
        // the smear (`splatFx` — the gate travelled in on the params), and
        // the pilot's one dry thought the first time each kind surprises him.
        playFlightSound(synth, takeAt(SPLAT_SOUNDS, event.side * 30, nowMs));
        splatFx(
          fx,
          {
            kind: event.kind,
            x: flight.craft.x + event.across,
            alt: flight.craft.alt + event.along,
            side: event.side,
            along: event.along,
            across: event.across,
            gib: flight.params.gib !== false,
            dust: flight.params.dust === true,
          },
          nowMs,
        );
        if (event.kind === "bird") {
          if (!beats.birdSaid) {
            beats.birdSaid = true;
            say(FLIGHT_VOICE.bird);
          }
        } else if (!beats.hobbyistSaid) {
          beats.hobbyistSaid = true;
          say(FLIGHT_VOICE.hobbyist);
        }
        break;
      }
      case "wrecked":
        // The explosion event beside it carries the picture and the noise;
        // the hold and the restart are `end-flight.ts`'s. What the wreck
        // itself leaves is the SPOT, latched for the camera — the sim keeps
        // the unseen hull falling, and the show must not be dragged off with
        // it.
        fx.wreckAt = { x: event.x, alt: event.alt };
        break;
      case "warning":
        playFlightSound(synth, WARNING_SOUND);
        // The scare gets a thought as well as a beep — the rotation, so the
        // third scare is not the first one word for word.
        say(FLIGHT_TIPPING[beats.tips % FLIGHT_TIPPING.length]!);
        beats.tips++;
        break;
      case "orbit":
        playFlightSound(synth, ORBIT_SOUND);
        break;
      case "touchdown":
        playFlightSound(synth, TOUCHDOWN_SOUND);
        say(FLIGHT_VOICE.touchdown);
        break;
    }
  }

  // The garbage that came apart this tick — a blast core's work, mostly.
  for (const strike of flight.strikes) {
    burstFx(fx, strike.kind, strike.variant, strike.x, strike.alt, nowMs);
  }

  // ── THE EDGES THE APP READS ───────────────────────────────────────────────
  if (!beats.monologueSaid && flight.phase === "ascent" && nowMs > 2600) {
    beats.monologueSaid = true;
    say(FLIGHT_VOICE.monologue);
  }
  if (
    !beats.clearSaid &&
    flight.phase === "ascent" &&
    flight.outcome === FLIGHT_OUTCOME.flying &&
    flightShellClear(flight)
  ) {
    beats.clearSaid = true;
    playFlightSound(synth, ORBIT_SOUND);
    say(FLIGHT_VOICE.clear);
  }
  if (!beats.descentSaid && flight.phase === "landing" && nowMs > 1400) {
    beats.descentSaid = true;
    say(FLIGHT_VOICE.descent);
  }
  // The weather's and the corridor's own edges — each spoken once, the first
  // time the sky earns it.
  if (
    !beats.jetSaid &&
    flight.phase === "ascent" &&
    Math.abs(flightWindPx(flight)) >= FLIGHT.wind.maxPx * JET_LINE_FRAC
  ) {
    beats.jetSaid = true;
    say(FLIGHT_VOICE.jetstream);
  }
  if (
    !beats.offCourseSaid &&
    flight.phase === "ascent" &&
    flightOffCourse(flight) >= OFF_COURSE_LINE_FRAC
  ) {
    beats.offCourseSaid = true;
    say(FLIGHT_VOICE.offCourse);
  }
}

/**
 * THE CONTINUOUS PAIR — the booster's rumble and the poofs — fed from the
 * INPUT rather than the events, because a held control is not an event.
 * Called each tick with what the thumb is doing; both go through their own
 * funnels so a held control is a note, never a drumroll.
 */
export function voiceFlightControls(
  flight: FlightState,
  fx: RocketFxState,
  rumble: { nextMs: number },
  throttle: number,
  steer: number,
): void {
  const nowMs = flight.ms;
  if (flight.outcome !== FLIGHT_OUTCOME.flying) return;
  // A CONSTANT cadence — the bed rule (`continuous-bed-needs-a-hold`): the
  // grains carry a hold sized to fuse at this spacing, and a cadence that
  // moved with the throttle would make the RATE the thing the ear follows.
  // The boost is a second, brighter grain LAYERED on the same clock instead —
  // the engine opening up, not speeding up.
  if (nowMs >= rumble.nextMs) {
    rumble.nextMs = nowMs + 190;
    playFlightSound(synth, RUMBLE_SOUND);
    if (throttle > 0) playFlightSound(synth, BOOST_SOUND);
    // The downpour rides the same clock — a third grain under the engine while
    // the climb is still inside the storm, gone the moment it punches out.
    if (flight.phase === "ascent" && stormIntensity(flight.craft.alt) > 0.1) {
      playFlightSound(synth, RAIN_SOUND);
    }
  }
  if (Math.abs(steer) > 0.25) {
    // The poof leaves the OPPOSITE shoulder — the nozzle pushes the nose the
    // way the thumb asked by venting the other way.
    const vent: 1 | -1 = steer > 0 ? -1 : 1;
    const fired = poofFx(
      fx,
      flight.craft.x + vent * 8,
      flight.craft.alt + 6,
      vent,
      nowMs,
    );
    if (fired) playFlightSound(synth, POOF_SOUND);
  }
}

/**
 * THE THUNDER — each strike's clap, seconds after its flash, exactly once.
 * The schedule is the storm's own (`thunderDue`, hashed off the seed), so all
 * this owes is the LATCH: the last window already clapped for, kept by the
 * screen the way the rumble clock is.
 */
export function voiceStorm(
  flight: FlightState,
  storm: { clappedWindow: number },
): void {
  if (flight.phase !== "ascent") return;
  if (stormIntensity(flight.craft.alt) <= 0) return;
  // The due window is the one BEHIND the clock when thunder trails its flash
  // across a boundary, so both candidates are checked, oldest first.
  const w = Math.floor(flight.ms / STRIKE_WINDOW_MS);
  for (const window of [w - 1, w]) {
    if (window <= storm.clappedWindow) continue;
    const due = thunderDue(flight.params.seed, window);
    if (due === null || flight.ms < due) continue;
    storm.clappedWindow = window;
    playFlightSound(
      synth,
      THUNDER_SOUNDS[Math.abs(window) % THUNDER_SOUNDS.length]!,
    );
  }
}
