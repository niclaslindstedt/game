// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE LAUNCH HUD'S READINGS — what the flight's instruments say, and the
// binding surface the authored dashboard reads them through.
//
// THE LOOK IS A LAUNCH WEBCAST'S, IN THIS GAME'S OWN SKIN: twin dials (speed
// and altitude), a mission clock, a hull bar where a propellant bar would be,
// the attitude ("balance") indicator that IS the minigame, and a mission
// timeline across the top — all authored in `content/hud/elements/rocket_*`,
// with every judgement in `content/hud/scripts/rocket.lua`, so a mod can
// re-skin mission control the way it re-skins the wagon's dashboard.
//
// A MODULE RATHER THAN A CORNER OF THE SCREEN for the drive's reason: the
// dials are published to React only when one of them moves, so the diffable
// snapshot and its comparator live together where a test can reach them.

import {
  FLIGHT,
  climbMph,
  flightAltFrac,
  flightCoursePx,
  flightHandsOff,
  flightMph,
  flightOffCourse,
  flightShellClear,
  flightWindPx,
  type FlightState,
} from "@game/core";

import type { HudValues } from "../hud/bindings.ts";

/** The top of the altitude dial, in the unit it says out loud — the 100-mile
 * orbit the climb is going to (`FLIGHT.metersPerPx` is derived against it). */
const SPACE_MILES = 100;

/** One diffable snapshot of every instrument. */
export type FlightDials = {
  /** The speed dial: the big number, and its arc. Pegged at the dial's last
   * figure — the engine's own clamp (`flightMph`). */
  mph: number;
  speedFrac: number;
  /** The altitude dial: miles on the climb, feet-to-surface on the drop. */
  altitude: number;
  altFrac: number;
  /** The hull bar, where a launch feed's propellant bar sits. */
  hullPercent: number;
  hullFrac: number;
  /** One real hit from the end. */
  failing: boolean;
  /** THE ATTITUDE INDICATOR — the lean, split into its two shoulders so the
   * authored element is a pair of arcs that fill toward the side the ship is
   * falling over. Each is 0–1 of the flip. */
  leanPortFrac: number;
  leanStarFrac: number;
  /** …and the worst of the two, for the colour ladder. */
  leanFrac: number;
  /** Past the warning line right now. */
  warn: boolean;
  /** The mission clock, formatted (`T+ m:ss`) and raw. */
  clock: string;
  clockMs: number;
  clockStarted: boolean;
  /** The dashboard is up at all — it slides in as the hand-over lands. */
  dashLive: boolean;
  /** Which half is being flown, as the caption prints it. */
  phase: string;
  landing: boolean;
  /** Bags met hull-first so far — the trip's tally, not a cargo count. */
  trash: number;
  /** The boosters are open right now — the throttle indicator's light. */
  boost: boolean;
  /**
   * THE MISSION TIMELINE'S MARKER, 0–1 — STAGED, not raw altitude: the
   * authored strip spaces its six event labels evenly, so each leg of the trip
   * is mapped onto its own fifth and the marker crosses a label exactly as the
   * ship crosses the event. LIFTOFF → JUNK SHELL → ALL CLEAR → ORBIT → THE
   * DROP → TOUCHDOWN.
   */
  progress: number;
  /** Out of the shell — the timeline's ALL CLEAR lamp. */
  shellClear: boolean;
  paused: boolean;
  /** THE WIND METER: what the vane can feel (mph, absolute), which shoulder
   * it is on (-1 port, 0 calm, 1 starboard), and its share of the profile's
   * worst — zero in vacuum, which is the meter's own last word. */
  windMph: number;
  windDir: number;
  windFrac: number;
  /** Out of the launch corridor, 0..1 of the ramp the strays read. */
  offCourse: number;
  /** What is left in the tanks — the mass the climb is spending. */
  fuelFrac: number;
};

/** `T+ m:ss` — a mission clock, not a lap clock: whole seconds, because the
 * tenths live on the score card where they matter. */
function missionClock(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const rest = (s % 60).toString().padStart(2, "0");
  return `T+${m}:${rest}`;
}

/** Where the timeline's marker stands — see `FlightDials.progress`. */
export function missionProgress(state: FlightState): number {
  const seg = 1 / 5;
  if (state.phase === "landing") {
    if (state.outcome === "landed") return 1;
    const fallen = 1 - state.craft.alt / FLIGHT.landing.startAltPx;
    return 4 * seg + Math.min(1, Math.max(0, fallen)) * seg;
  }
  const coursePx = flightCoursePx(state.params);
  const shellIn = FLIGHT.field.startAltPx;
  const shellTop = coursePx * FLIGHT.field.shellTopFrac;
  const alt = state.craft.alt;
  if (state.outcome === "toOrbit") return 3 * seg;
  if (alt <= shellIn) return (Math.max(0, alt) / shellIn) * seg;
  if (alt <= shellTop) {
    return seg + ((alt - shellIn) / (shellTop - shellIn)) * seg;
  }
  return 2 * seg + ((alt - shellTop) / (coursePx - shellTop)) * seg;
}

/** Read every instrument off the sim. `throttle` is the input's, carried in
 * because the boosters' light is about the thumb rather than the state. */
export function flightDials(
  state: FlightState,
  paused: boolean,
  throttle: number,
): FlightDials {
  const { craft } = state;
  const landing = state.phase === "landing";
  const lean = craft.tilt / FLIGHT.ascent.flipRad;
  const hull = Math.max(0, Math.min(1, craft.hull));
  const mph = flightMph(state);
  const windPx = flightWindPx(state);
  return {
    mph,
    // The arc IS the figure: one telemetry (`flightMph`), so the needle and
    // the number can never tell two stories.
    speedFrac: Math.min(1, mph / FLIGHT.orbitalMph),
    altitude: landing
      ? Math.max(0, Math.round(craft.alt))
      : Math.round(flightAltFrac(state) * SPACE_MILES),
    altFrac: landing
      ? Math.max(0, Math.min(1, craft.alt / FLIGHT.landing.startAltPx))
      : flightAltFrac(state),
    hullPercent: Math.round(hull * 100),
    hullFrac: hull,
    failing: !landing && hull <= FLIGHT.hazard.satelliteHullFrac,
    leanPortFrac: Math.min(1, Math.max(0, -lean)),
    leanStarFrac: Math.min(1, Math.max(0, lean)),
    leanFrac: Math.min(1, Math.abs(lean)),
    warn:
      !landing &&
      state.outcome === "flying" &&
      Math.abs(craft.tilt) > FLIGHT.ascent.warnRad,
    clock: missionClock(state.clockMs),
    clockMs: state.clockMs,
    clockStarted: state.clockMs > 0,
    dashLive: state.ms > FLIGHT.opening.handsOffMs * 0.5,
    phase: landing ? "THE DROP" : "ASCENT",
    landing,
    trash: state.trashCount,
    boost: throttle > 0 && !flightHandsOff(state) && state.outcome === "flying",
    progress: missionProgress(state),
    shellClear: flightShellClear(state),
    paused,
    windMph: Math.round(climbMph(Math.abs(windPx))),
    windDir: windPx > 1 ? 1 : windPx < -1 ? -1 : 0,
    windFrac: Math.min(1, Math.abs(windPx) / FLIGHT.wind.maxPx),
    offCourse: flightOffCourse(state),
    fuelFrac: Math.max(0, Math.min(1, craft.fuel)),
  };
}

/** Nothing moved → the same object → React holds still. */
export function sameFlightDials(a: FlightDials, b: FlightDials): boolean {
  return (
    a.mph === b.mph &&
    a.speedFrac === b.speedFrac &&
    a.altitude === b.altitude &&
    a.altFrac === b.altFrac &&
    a.hullPercent === b.hullPercent &&
    a.failing === b.failing &&
    a.leanPortFrac === b.leanPortFrac &&
    a.leanStarFrac === b.leanStarFrac &&
    a.warn === b.warn &&
    a.clock === b.clock &&
    a.clockStarted === b.clockStarted &&
    a.dashLive === b.dashLive &&
    a.phase === b.phase &&
    a.trash === b.trash &&
    a.boost === b.boost &&
    a.progress === b.progress &&
    a.shellClear === b.shellClear &&
    a.paused === b.paused &&
    a.windMph === b.windMph &&
    a.windDir === b.windDir &&
    a.windFrac === b.windFrac &&
    a.offCourse === b.offCourse &&
    a.fuelFrac === b.fuelFrac
  );
}

/** THE QUANTISED SNAPSHOT — the continuous readings coarsened before they are
 * diffed, so a needle that wants smooth does not re-render React sixty times a
 * second. Call on the raw dials before `sameFlightDials`. */
export function quantiseFlightDials(dials: FlightDials): FlightDials {
  const q = (v: number, step: number) => Math.round(v / step) * step;
  return {
    ...dials,
    mph: q(dials.mph, 60),
    speedFrac: q(dials.speedFrac, 1 / 48),
    altFrac: q(dials.altFrac, 1 / 64),
    hullFrac: q(dials.hullFrac, 1 / 32),
    leanPortFrac: q(dials.leanPortFrac, 1 / 32),
    leanStarFrac: q(dials.leanStarFrac, 1 / 32),
    leanFrac: q(dials.leanFrac, 1 / 32),
    progress: q(dials.progress, 1 / 128),
    clockMs: q(dials.clockMs, 1000),
    windMph: q(dials.windMph, 5),
    windFrac: q(dials.windFrac, 1 / 24),
    offCourse: q(dials.offCourse, 1 / 16),
    fuelFrac: q(dials.fuelFrac, 1 / 48),
  };
}

/** The dials as the authored dashboard reads them — the `rocket.*` binding
 * group (`scripts/asset-tools/hud-schema.mjs`). */
export function flightBindings(d: FlightDials): HudValues {
  return {
    "rocket.mph": d.mph,
    "rocket.speedFrac": d.speedFrac,
    "rocket.altitude": d.altitude,
    "rocket.altFrac": d.altFrac,
    "rocket.hullPercent": d.hullPercent,
    "rocket.hullFrac": d.hullFrac,
    "rocket.failing": d.failing,
    "rocket.leanPortFrac": d.leanPortFrac,
    "rocket.leanStarFrac": d.leanStarFrac,
    "rocket.leanFrac": d.leanFrac,
    "rocket.warn": d.warn,
    "rocket.clock": d.clock,
    "rocket.clockMs": d.clockMs,
    "rocket.clockStarted": d.clockStarted,
    "rocket.dashLive": d.dashLive,
    "rocket.phase": d.phase,
    "rocket.landing": d.landing,
    "rocket.trash": d.trash,
    "rocket.boost": d.boost,
    "rocket.progress": d.progress,
    "rocket.shellClear": d.shellClear,
    "rocket.paused": d.paused,
    "rocket.windMph": d.windMph,
    "rocket.windDir": d.windDir,
    "rocket.windFrac": d.windFrac,
    "rocket.offCourse": d.offCourse,
    "rocket.fuelFrac": d.fuelFrac,
  };
}
