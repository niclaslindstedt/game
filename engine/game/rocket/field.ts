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
import { FLIGHT, flightCoursePx, offCourseFrac } from "./config.ts";
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
  plane: 2,
  drone: 2,
  bird: 2,
  skydiver: 2,
  paraglider: 2,
};

/**
 * WHAT EACH PIECE OF JUNK WEIGHS (kg) — one entry per junk variant, in the
 * art's own order (`rocket-screen/orbit-art.ts` names the cast). The weight
 * is the whole of what a hit costs (`FLIGHT.trash` prices the shove per kg),
 * so the table IS the difficulty of the field: household guesses, kept
 * honest — a fridge is a fridge.
 */
export const JUNK_KG: readonly number[] = [
  8, // 0  a tied trash bag
  20, // 1  an empty steel drum
  1, // 2  a bottle
  9, // 3  a car tyre
  30, // 4  a TV set, aerials and all
  70, // 5  a fridge, door hanging ajar
  75, // 6  a washing machine
  25, // 7  a mattress
  45, // 8  a toilet
  90, // 9  a couch — the heaviest thing the company ever threw
  2, // 10 a cardboard box
  1, // 11 a fish skeleton
  50, // 12 a water heater
  65, // 13 a chest freezer with a porthole
  5, // 14 a desk fan
  4, // 15 a floor lamp
  0.5, // 16 a shoe
  4, // 17 a traffic cone
  0.2, // 18 a banana peel
  0.1, // 19 a crushed can
];

/** The weight a variant hits with — clamped rather than trusted, the sprite
 * table's own rule, so a mod's shorter cast degrades to the last entry. */
export function junkKg(variant: number): number {
  return JUNK_KG[Math.min(JUNK_KG.length - 1, Math.max(0, variant))]!;
}

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
  stray: number;
} {
  const start = FLIGHT.field.startAltPx;
  // Staggered so the shell's three kinds never introduce themselves in the
  // same breath: bags first (they only cost handling), the company's hardware
  // a stretch later, rocks last. The strays' mark starts low — the birds are
  // in the first stretch of real sky.
  return {
    junk: start,
    satellite: start * 1.6,
    rock: start * 2.1,
    stray: start * 0.4,
  };
}

/** Mint one drifting thing of the SHELL's kinds at this altitude. Every roll
 * comes off the sky's own stream, and the x is dealt around the SHIP — the
 * shell is everywhere, so it follows a ship that has wandered off the
 * corridor instead of staying parked over the pad. */
function mint(state: FlightState, kind: OrbitKind, alt: number): OrbitObject {
  const { rng } = state;
  const f = FLIGHT.field;
  const variant = Math.floor(rng() * ORBIT_VARIANTS[kind]);
  const x = state.craft.x + (rng() - 0.5) * (FLIGHT.fieldW - 40);
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
 * MINT ONE STRAY — the off-corridor sky's own population, off the strays'
 * stream. Which kind is the ALTITUDE's call (birds and hobbyists in the low
 * sky, airliners across their cruise lanes, drones most of the way up), and
 * everything upright-and-alive flies level rather than tumbling.
 */
function mintStray(state: FlightState, alt: number): OrbitObject {
  const rng = state.strayRng;
  const s = FLIGHT.stray;
  const coursePx = flightCoursePx(state.params);
  const off = offCourseFrac(state.craft.x);

  // The altitude's own cast list, weighted; a kind out of its band weighs 0.
  const inPlaneBand = alt >= s.planeAlt[0] && alt <= s.planeAlt[1];
  const weights: readonly (readonly [OrbitKind, number])[] = [
    ["bird", alt <= s.birdTopAlt ? 1 : 0],
    ["skydiver", alt <= s.diverTopAlt && off > 0.05 ? 0.7 : 0],
    ["paraglider", alt <= s.diverTopAlt && off > 0.05 ? 0.6 : 0],
    // The lanes are OFF the corridor — an airliner needs the ship to have
    // properly left the closed column.
    ["plane", inPlaneBand && off > 0.25 ? 1.2 : 0],
    ["drone", alt <= coursePx * s.droneTopFrac ? 0.5 + off : 0],
  ];
  const total = weights.reduce((sum, [, w]) => sum + w, 0);
  let pick: OrbitKind = "drone";
  let roll = rng() * (total || 1);
  for (const [kind, w] of weights) {
    roll -= w;
    if (roll <= 0 && w > 0) {
      pick = kind;
      break;
    }
  }

  const side: 1 | -1 = rng() < 0.5 ? -1 : 1;
  let x = state.craft.x + (rng() - 0.5) * (FLIGHT.fieldW - 40);
  let vx: number;
  let vy = 0;
  let r: number;
  const spin = 0;
  if (pick === "plane") {
    // Enters from a wing of the sky, crossing the ship's column at lane speed.
    x = state.craft.x + side * s.entryPx;
    vx = -side * (s.planePx[0] + rng() * (s.planePx[1] - s.planePx[0]));
    r = 13;
  } else if (pick === "bird") {
    x = state.craft.x + side * (s.entryPx * (0.4 + rng() * 0.6));
    vx = -side * (s.birdPx[0] + rng() * (s.birdPx[1] - s.birdPx[0]));
    vy = (rng() * 2 - 1) * 12;
    r = 3;
  } else if (pick === "skydiver") {
    vy = -(18 + rng() * 14);
    vx = (rng() * 2 - 1) * 12;
    r = 5;
  } else if (pick === "paraglider") {
    vx = (rng() < 0.5 ? -1 : 1) * (22 + rng() * 24);
    vy = -(4 + rng() * 8);
    r = 6;
  } else {
    // A drone holds its parcel line: a slow purposeful drift, no tumble.
    vx = (rng() * 2 - 1) * 16;
    vy = (rng() * 2 - 1) * 10;
    r = 5;
  }
  return {
    id: state.nextId++,
    kind: pick,
    variant: Math.floor(rng() * ORBIT_VARIANTS[pick]),
    x,
    alt,
    vx,
    vy,
    angle: 0,
    spin,
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

  // ── THE STRAYS — the off-corridor sky, on their own stream and mark. ──────
  // The stride reads how far off course the ship is RIGHT NOW, so wandering
  // thickens the sky and coming home thins it — and none of it touches the
  // shell's stream (`FlightState.nextStrayAt`).
  const s = FLIGHT.stray;
  const strayCeiling = Math.min(
    state.craft.alt + f.aheadPx,
    coursePx * f.shellTopFrac,
  );
  while (state.nextStrayAt < strayCeiling) {
    const off = offCourseFrac(state.craft.x);
    state.field.push(mintStray(state, state.nextStrayAt));
    const stride =
      (s.strideMaxPx + (s.strideMinPx - s.strideMaxPx) * off) /
      Math.max(0.2, rung.hazardMult);
    state.nextStrayAt +=
      (off > 0 ? stride : stride * s.onCourseStrideMult) *
      (0.7 + state.strayRng() * 0.6);
  }

  // Drift, tumble, and wrap the crossers. The windows are the SHIP's — the
  // sky has no edges, so "gone" means far enough from the climb to never
  // matter, and a satellite that leaves one wing of it is on an orbit, and
  // orbits come back.
  const floor = state.craft.alt - f.behindPx;
  const wingPx = FLIGHT.fieldW + 60;
  for (let i = state.field.length - 1; i >= 0; i--) {
    const o = state.field[i]!;
    o.x += o.vx * dt;
    o.alt += o.vy * dt;
    o.angle += o.spin * dt;
    const away = o.x - state.craft.x;
    if (o.kind === "satellite") {
      if (away < -wingPx && o.vx < 0) o.x = state.craft.x + wingPx;
      else if (away > wingPx && o.vx > 0) o.x = state.craft.x - wingPx;
    } else if (Math.abs(away) > wingPx + 200) {
      state.field.splice(i, 1);
      continue;
    }
    if (o.alt < floor) state.field.splice(i, 1);
  }
}
