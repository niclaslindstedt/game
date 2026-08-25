// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT IS UP THERE — how the sky is filled, on three running marks laid down
// by altitude as the climb unrolls.
//
// THE SKY IS LAID ONCE, AHEAD OF THE SHIP, exactly the way the drive lays its
// crowd: each mark walks upward, minting as it goes, and the tick tops the sky
// up to `aheadPx` above the craft — so the same seed always meets the same
// thing at the same altitude, which is what makes a restart a lesson instead
// of a reshuffle. Nothing here is spent from anybody's run.
//
// THE THREE MARKS, and which population each deals:
//
//   nextJunkAt     GOODCO's shell of garbage, on its thickening profile
//                  (`bandFrac`) — the ceiling the whole upper climb is under.
//   nextOrbitAt    everything in ORBIT (`SKY_LAYERS`' orbital bands: the
//                  constellation, the military's, the rocks). On the SHELL's
//                  stream, on a stride NOTHING the player does can move.
//   nextTrafficAt  the air traffic (`SKY_LAYERS`' atmospheric bands), on its
//                  own stream, thickening with how far off the closed
//                  corridor the ship has wandered.
//
// THE SPLIT BETWEEN THE LAST TWO IS LOAD-BEARING. A restart replays the same
// seeded sky so the hardware that killed you is waiting where it was — which
// only holds while the hardware's stride is independent of how the flight was
// flown. Air traffic is dealt off its own stream for the same reason in
// reverse: wandering may thicken the lanes and must never shift an orbit.

import type { Rng } from "@game/lib/rng.ts";

import { difficultyDef } from "../defs/difficulties.ts";
import type { Difficulty } from "../types/core.ts";
import { FLIGHT, flightCoursePx, kphPx, offCourseFrac } from "./config.ts";
import {
  SKY_LAYERS,
  layerFrac,
  layerPerKPx,
  type SkyBand,
  type SkyLayer,
} from "./layers.ts";
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
  milsat: 2,
  rock: 3,
  // 0–1 the airliners at cruise, 2 the high-wing single in the light lanes.
  plane: 3,
  // 0–1 the parcel quads over the rooftops, 2 the watch deck's solar wing.
  drone: 3,
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

/**
 * WHAT AN AIRCRAFT TAKES OFF THE SKIN, by variant (fraction of the whole
 * ship) — the same shape as `JUNK_KG`, because it is the same kind of fact:
 * what one of these weighs and how fast it was going.
 *
 * An airliner met in its own lane is very nearly the end of any ship; the
 * high-wing single down in the light lanes is a fifth of that, which is what
 * makes the low sky a place to LEARN the dodge before the airways ask for it.
 */
export const PLANE_HULL_FRAC: readonly number[] = [
  0.7, // 0  the passenger line's
  0.7, // 1  the cargo line's
  0.28, // 2  a high-wing single
];

/** …the same clamp, for the same reason. */
export function planeHullFrac(variant: number): number {
  return PLANE_HULL_FRAC[
    Math.min(PLANE_HULL_FRAC.length - 1, Math.max(0, variant))
  ]!;
}

/**
 * THE THREE GATES A TOUCHDOWN PASSES, on THIS rung — the shipped limits worked
 * through `DifficultyDef.flight.gateMult`.
 *
 * ONE RESOLVER, read by everything that has an opinion about a landing: the sim
 * that judges it, the auto-pilot that flies a profile inside it, and the score
 * that pays for a gentle one. Three copies of `safe * mult` is three places for
 * a rung to mean three different things.
 */
export function landingGates(difficulty: Difficulty): {
  vyPx: number;
  vxPx: number;
  tiltRad: number;
} {
  const l = FLIGHT.landing;
  const mult = difficultyDef(difficulty).flight.gateMult;
  return {
    vyPx: l.safeVyPx * mult,
    vxPx: l.safeVxPx * mult,
    tiltRad: l.safeTiltRad * mult,
  };
}

/** The rung's field knobs, off the ladder. */
function rungFlight(state: FlightState) {
  return difficultyDef(state.params.difficulty).flight;
}

/**
 * THE SHELL'S PROFILE — how thick the garbage is at this altitude, 0–1 against
 * its peak density. It RAMPS toward the shell's top (`bandFloorFrac` at the
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

/** Px of climb between spawns of the SHELL at this altitude — the mark's
 * stride, derived from the peak density, the profile and the rung. */
function shellStridePx(
  rungMult: number,
  alt: number,
  coursePx: number,
): number {
  const density = FLIGHT.field.junkPerKPx * rungMult * bandFrac(alt, coursePx);
  return density <= 0 ? Number.POSITIVE_INFINITY : 1000 / density;
}

/** Where each mark sits on a fresh sky. The traffic mark opens right off the
 * lawn — the birds are the first thing anybody meets — while the shell and the
 * orbits are dealt from wherever their own layers begin. */
export function firstMarks(): {
  junk: number;
  orbit: number;
  traffic: number;
} {
  return {
    junk: FLIGHT.field.startAltPx,
    orbit: lowestBandFloor("orbit"),
    traffic: lowestBandFloor("traffic"),
  };
}

/**
 * EACH LAYER'S ACCOUNT AT THE START (see `walkBand`), opened part-paid off the
 * sky's own stream — a debt starting at exactly zero puts every seed's first
 * bird at the same altitude, which is the one thing a seeded sky should not
 * make identical.
 */
export function firstLayerDue(rng: Rng): number[] {
  return SKY_LAYERS.map(() => rng());
}

/** The bottom of the lowest layer on a mark — where that mark starts walking,
 * fades included, so a band's first arrivals are not skipped. */
function lowestBandFloor(band: SkyBand): number {
  let floor = Number.POSITIVE_INFINITY;
  for (const layer of SKY_LAYERS) {
    if (layer.band !== band) continue;
    floor = Math.min(floor, Math.max(0, layer.from - layer.fade));
  }
  return Number.isFinite(floor) ? floor : 0;
}

/** How thick ONE layer is at this altitude — spawns per 1000 px of climb,
 * through its band profile, what wandering off the corridor adds, and the
 * rung's hazard knob if it is a thing that can hole the ship. */
function layerDensity(
  layer: SkyLayer,
  alt: number,
  off: number,
  hazardMult: number,
): number {
  const frac = layerFrac(layer, alt);
  if (frac <= 0) return 0;
  return (
    layerPerKPx(layer) *
    frac *
    (1 + (layer.offCourseMult - 1) * off) *
    (layer.hazard ? hazardMult : 1)
  );
}

/**
 * HOW FAR A BANDED MARK STEPS AT A TIME (px of climb) — and the reason the
 * banded populations are walked in FIXED steps rather than on a stride the way
 * the shell is.
 *
 * A stride is `1000 / density`, and in the thin tail of a fade the density is
 * nearly zero, so the stride is enormous: one step out of the bottom of the
 * constellation's fade lands the mark 35 000 px up, past the top of the sky,
 * and every orbit above it is silently never dealt. Stepping a fixed distance
 * and spawning by EXPECTATION over that step has no such tail — the count over
 * a band comes out at its authored `perTrip` whatever shape the fade is.
 *
 * 40 px samples the narrowest band in the table about ten times over.
 */
const BAND_STEP_PX = 40;

/**
 * MINT ONE PIECE OF THE SHELL at this altitude. Every roll comes off the sky's
 * own stream, and the x is dealt around the SHIP — the garbage is everywhere,
 * so it follows a ship that has wandered off the corridor instead of staying
 * parked over the pad.
 *
 * IT DRIFTS ALONG-TRACK AND IT DOES NOT FALL. A fridge fired into orbit is in
 * orbit: what is left after the ship's own orbit is subtracted is a few tens
 * of km/h of nothing much, nearly all of it sideways
 * (`FLIGHT.field.junkRiseFrac`).
 */
function mintJunk(state: FlightState, alt: number): OrbitObject {
  const { rng } = state;
  const f = FLIGHT.field;
  const drift = span(rng, f.junkKph);
  return {
    id: state.nextId++,
    kind: "junk",
    variant: Math.floor(rng() * ORBIT_VARIANTS.junk),
    x: state.craft.x + (rng() - 0.5) * (FLIGHT.fieldW - 40),
    alt,
    vx: (rng() < 0.5 ? -1 : 1) * drift,
    vy: (rng() * 2 - 1) * drift * f.junkRiseFrac,
    angle: rng() * Math.PI * 2,
    spin: (rng() * 2 - 1) * 0.55,
    r: 5 + rng() * 3,
  };
}

/** A roll inside an authored `[min, max]` pair. */
function span(rng: () => number, range: readonly [number, number]): number {
  return range[0] + rng() * (range[1] - range[0]);
}

/**
 * MINT ONE THING OFF A LAYER — its kind and its art come from the layer, and
 * its TRAJECTORY from what that thing actually is.
 *
 * The four ways of moving in this sky, and each one is a fact rather than a
 * flourish: an AIRCRAFT cruises level and crosses the ship's column at lane
 * speed; a BIRD flies level and bobs; a CANOPY is the only thing up here
 * genuinely coming down, under a sink rate and a forward drive; a DRONE holds
 * its route. And anything IN ORBIT does not fall at all — the constellation,
 * the military's birds and the loose rock all cross ALONG-TRACK, because what
 * is left when two orbits are subtracted is the angle between them, never a
 * descent.
 */
function mintLayer(
  state: FlightState,
  layer: SkyLayer,
  alt: number,
  rng: () => number,
): OrbitObject {
  const t = FLIGHT.traffic;
  const f = FLIGHT.field;
  const kind = layer.kind;
  const variant = layer.variants[Math.floor(rng() * layer.variants.length)]!;
  const side: 1 | -1 = rng() < 0.5 ? -1 : 1;
  let x = state.craft.x + (rng() - 0.5) * (FLIGHT.fieldW - 40);
  // `vx` and `r` are set by every branch below; `vy` and `spin` are the two a
  // level flier leaves alone.
  let vx: number;
  let r: number;
  let vy = 0;
  let spin = 0;

  if (kind === "plane") {
    // Aircraft enter from a wing of the sky and cross the ship's column at
    // lane speed, dead level. The high-wing single is a quarter the airliner.
    const light = variant >= 2;
    x = state.craft.x + side * t.entryPx;
    vx = -side * kphPx(span(rng, light ? t.lightPlaneKph : t.planeKph));
    r = light ? 8 : 13;
  } else if (kind === "bird") {
    x = state.craft.x + side * (t.entryPx * (0.4 + rng() * 0.6));
    vx = -side * kphPx(span(rng, t.birdKph));
    vy = (rng() * 2 - 1) * kphPx(span(rng, t.birdBobKph));
    r = 3;
  } else if (kind === "skydiver") {
    vy = -kphPx(span(rng, t.diverSinkKph));
    vx = (rng() * 2 - 1) * kphPx(span(rng, t.diverDriveKph));
    r = 5;
  } else if (kind === "paraglider") {
    vx = (rng() < 0.5 ? -1 : 1) * kphPx(span(rng, t.gliderKph));
    vy = -kphPx(span(rng, t.gliderSinkKph));
    r = 6;
  } else if (kind === "drone") {
    // A parcel quad holds its route; the watch deck's solar wing tracks fast
    // through thin air and is never in a hurry to be anywhere.
    const watch = variant >= 2;
    const speed = kphPx(span(rng, watch ? t.watchDroneKph : t.droneKph));
    vx = (rng() < 0.5 ? -1 : 1) * speed;
    vy = (rng() * 2 - 1) * speed * 0.15;
    r = watch ? 9 : 5;
  } else if (kind === "satellite" || kind === "milsat") {
    // The fastest things the climb meets, and the only ones whose speed is
    // an ANGLE rather than a throttle. They hold attitude — somebody paid for
    // that — and they cross rather than descend.
    const speed = kphPx(
      span(rng, kind === "milsat" ? f.milsatKph : f.satelliteKph),
    );
    vx = rng() < 0.5 ? speed : -speed;
    vy = (rng() * 2 - 1) * speed * 0.05;
    spin = (rng() * 2 - 1) * 0.06;
    r = kind === "milsat" ? 12 : 10;
  } else {
    // A loose piece of orbital rock, tumbling: same frame, same rule — a
    // different orbit is a different PLANE, not a fall.
    const speed = kphPx(span(rng, f.rockKph));
    vx = (rng() < 0.5 ? -1 : 1) * speed;
    vy = (rng() * 2 - 1) * speed * f.rockRiseFrac;
    spin = (rng() * 2 - 1) * 1.2;
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
    // Everything built or alive flies level; only what is adrift lies at an
    // angle it did not choose.
    angle: kind === "rock" ? rng() * Math.PI * 2 : 0,
    spin,
    r,
  };
}

/**
 * WALK ONE BAND'S MARK up to `ceiling`, minting as it goes. Returns where the
 * mark ended up.
 *
 * EACH LAYER KEEPS ITS OWN RUNNING DEBT (`FlightState.layerDue`) rather than
 * being picked out of a weighted hat, and that is the difference between "you
 * usually meet the watch deck" and "you meet it". A hat rolls an independent
 * coin per step, so a band authored at three deals none about one climb in
 * twenty — and the one thing this table exists to promise is that every
 * neighbourhood is flown through on every trip. A debt cannot come out zero:
 * the density is integrated over the step, added to the layer's own account,
 * and every whole unit in it is a thing in the sky. What stays random is
 * WHERE it is, WHICH variant it wears, and how it is moving.
 */
function walkBand(
  state: FlightState,
  band: SkyBand,
  mark: number,
  ceiling: number,
  rng: () => number,
): number {
  const off = offCourseFrac(state.craft.x);
  const hazardMult = rungFlight(state).hazardMult;
  let at = mark;
  while (at < ceiling) {
    for (let i = 0; i < SKY_LAYERS.length; i++) {
      const layer = SKY_LAYERS[i]!;
      if (layer.band !== band) continue;
      const density = layerDensity(layer, at, off, hazardMult);
      if (density <= 0) continue;
      let due = (state.layerDue[i] ?? 0) + (density * BAND_STEP_PX) / 1000;
      while (due >= 1) {
        due -= 1;
        const alt = at + rng() * BAND_STEP_PX;
        state.field.push(mintLayer(state, layer, alt, rng));
      }
      state.layerDue[i] = due;
    }
    at += BAND_STEP_PX;
  }
  return at;
}

/**
 * TOP THE SKY UP — advance every mark to `aheadPx` above the craft, minting as
 * it goes, and sweep what has fallen `behindPx` below. Called every tick of
 * the ascent; the landing flies an empty sky.
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
    state.field.push(mintJunk(state, state.nextJunkAt));
    state.nextJunkAt +=
      shellStridePx(rung.junkMult, state.nextJunkAt, coursePx) *
      (0.6 + state.rng() * 0.8);
  }

  state.nextOrbitAt = walkBand(
    state,
    "orbit",
    state.nextOrbitAt,
    ceiling,
    state.rng,
  );
  state.nextTrafficAt = walkBand(
    state,
    "traffic",
    state.nextTrafficAt,
    ceiling,
    state.trafficRng,
  );

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
    if (o.kind === "satellite" || o.kind === "milsat") {
      if (away < -wingPx && o.vx < 0) o.x = state.craft.x + wingPx;
      else if (away > wingPx && o.vx > 0) o.x = state.craft.x - wingPx;
    } else if (Math.abs(away) > wingPx + 200) {
      state.field.splice(i, 1);
      continue;
    }
    if (o.alt < floor) state.field.splice(i, 1);
  }
}
