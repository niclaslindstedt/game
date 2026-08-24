// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SHELL OF GARBAGE — how the sky is filled, one spawn mark per kind, laid
// down by altitude as the climb unrolls.
//
// THE FIELD IS LAID ONCE, AHEAD OF THE SHIP, exactly the way the drive lays
// its crowd: each kind keeps a running mark (`nextJunkAt`, …) and the tick
// tops the sky up to `aheadPx` above the craft, so the same seed always meets
// the same bag at the same altitude — which is what makes a restart a lesson
// instead of a reshuffle. Nothing here is spent from anybody's run.

import { difficultyDef } from "../defs/difficulties.ts";
import { FLIGHT, flightCoursePx } from "./config.ts";
import type { FlightState, OrbitKind, OrbitObject } from "./types.ts";

/**
 * HOW MANY ART VARIANTS EACH KIND HAS — the one fact about the app's tables
 * the sim needs, so a variant rolled here always names a sprite that exists.
 * The app's own tables are the same length (`rocket-screen/orbit-art.ts`), and
 * the content test holds the two together.
 */
export const ORBIT_VARIANTS: Record<OrbitKind, number> = {
  junk: 20,
  satellite: 3,
  rock: 3,
};

/** The rung's field knobs, off the ladder. */
function rungFlight(state: FlightState) {
  return difficultyDef(state.params.difficulty).flight;
}

/**
 * THE BAND PROFILE — how thick the shell is at this altitude, 0–1 against the
 * kind's peak density. It RAMPS toward the shell's top (`bandFloorFrac` at the
 * bottom of the sky), because the fiction says so: the company fires its
 * garbage to where it stays, and thirty years of that is a ceiling, not a fog.
 * Above `shellTopFrac` it is ZERO — the finish is flying out of it.
 */
export function bandFrac(alt: number, coursePx: number): number {
  const f = FLIGHT.field;
  const shellTop = coursePx * f.shellTopFrac;
  if (alt >= shellTop) return 0;
  const t = Math.min(1, Math.max(0, alt / shellTop));
  return f.bandFloorFrac + (1 - f.bandFloorFrac) * t;
}

/** Px of climb between spawns of a kind at this altitude — the mark's stride,
 * derived from the peak density, the band and the rung. */
function stridePx(
  perKPx: number,
  rungMult: number,
  alt: number,
  coursePx: number,
): number {
  const density = perKPx * rungMult * bandFrac(alt, coursePx);
  return density <= 0 ? Number.POSITIVE_INFINITY : 1000 / density;
}

/** Where each kind's first mark sits on a fresh sky. */
export function firstMarks(): {
  junk: number;
  satellite: number;
  rock: number;
} {
  const start = FLIGHT.field.startAltPx;
  // Staggered so the shell's three kinds never introduce themselves in the
  // same breath: bags first (they only cost handling), the company's hardware
  // a stretch later, rocks last.
  return { junk: start, satellite: start * 1.6, rock: start * 2.1 };
}

/** Mint one drifting thing at this altitude. Every roll comes off the sky's
 * own stream. */
function mint(state: FlightState, kind: OrbitKind, alt: number): OrbitObject {
  const { rng } = state;
  const f = FLIGHT.field;
  const variant = Math.floor(rng() * ORBIT_VARIANTS[kind]);
  const x = 20 + rng() * (FLIGHT.fieldW - 40);
  let vx: number;
  let vy = 0;
  let r: number;
  if (kind === "junk") {
    vx = (rng() * 2 - 1) * f.junkDriftPx;
    vy = (rng() * 2 - 1) * (f.junkDriftPx / 2);
    r = 5 + rng() * 3;
  } else if (kind === "satellite") {
    // The one purposeful mover: crossing the sky on its own orbit, entering
    // from whichever side the roll says.
    const speed =
      f.satellitePx[0] + rng() * (f.satellitePx[1] - f.satellitePx[0]);
    vx = rng() < 0.5 ? speed : -speed;
    r = 10;
  } else {
    const speed = f.rockPx[0] + rng() * (f.rockPx[1] - f.rockPx[0]);
    vx = (rng() * 2 - 1) * speed;
    vy = -speed * (0.4 + rng() * 0.6);
    r = 5 + rng() * 4;
  }
  return {
    id: state.nextId++,
    kind,
    variant,
    x,
    alt,
    vx,
    vy,
    angle: rng() * Math.PI * 2,
    // Floating garbage tumbles slowly; rocks a little faster; a satellite
    // holds its attitude, because somebody paid for that.
    spin:
      kind === "satellite"
        ? (rng() * 2 - 1) * 0.06
        : (rng() * 2 - 1) * (kind === "rock" ? 1.2 : 0.55),
    r,
  };
}

/**
 * TOP THE SKY UP — advance every kind's mark to `aheadPx` above the craft,
 * minting as it goes, and sweep what has fallen `behindPx` below. Called every
 * tick of the ascent; the landing flies an empty sky.
 */
export function stepField(state: FlightState, dt: number): void {
  const f = FLIGHT.field;
  const rung = rungFlight(state);
  const coursePx = flightCoursePx(state.params);
  // Nothing is ever laid above the shell's top — the clear stretch is the
  // finish, and one bag drifting in it would un-say the whole beat.
  const ceiling = Math.min(
    state.craft.alt + f.aheadPx,
    coursePx * f.shellTopFrac,
  );

  while (state.nextJunkAt < ceiling) {
    state.field.push(mint(state, "junk", state.nextJunkAt));
    state.nextJunkAt +=
      stridePx(f.junkPerKPx, rung.junkMult, state.nextJunkAt, coursePx) *
      (0.6 + state.rng() * 0.8);
  }
  while (state.nextSatelliteAt < ceiling) {
    state.field.push(mint(state, "satellite", state.nextSatelliteAt));
    state.nextSatelliteAt +=
      stridePx(
        f.satellitePerKPx,
        rung.hazardMult,
        state.nextSatelliteAt,
        coursePx,
      ) *
      (0.6 + state.rng() * 0.8);
  }
  while (state.nextRockAt < ceiling) {
    state.field.push(mint(state, "rock", state.nextRockAt));
    state.nextRockAt +=
      stridePx(f.rockPerKPx, rung.hazardMult, state.nextRockAt, coursePx) *
      (0.6 + state.rng() * 0.8);
  }

  // Drift, tumble, and wrap the crossers — a satellite that leaves one edge is
  // on an orbit, and orbits come back.
  const floor = state.craft.alt - f.behindPx;
  for (let i = state.field.length - 1; i >= 0; i--) {
    const o = state.field[i]!;
    o.x += o.vx * dt;
    o.alt += o.vy * dt;
    o.angle += o.spin * dt;
    if (o.kind === "satellite") {
      if (o.x < -o.r && o.vx < 0) o.x = FLIGHT.fieldW + o.r;
      else if (o.x > FLIGHT.fieldW + o.r && o.vx > 0) o.x = -o.r;
    } else if (o.x < -40 || o.x > FLIGHT.fieldW + 40) {
      state.field.splice(i, 1);
      continue;
    }
    if (o.alt < floor) state.field.splice(i, 1);
  }
}
