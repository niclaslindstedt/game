// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT A FLIGHT IS — the climb from the burning lawn to orbit and the drop onto
// the moon, as a state object, and everything adrift in between.
//
// A FLIGHT IS NOT A RUN, for the drive's own reason: there is no level under
// it, no carve, no horde, no loot, no XP and no party — it is one ship, one
// column of sky, and the company's garbage. It is its own state rather than a
// `GamePhase` on `GameState`, because a minigame that borrowed the run's state
// would inherit the spawner, the menace meter and the autopilot, and every one
// of them would have to be taught to sit this out.
//
// AND IT IS ONE MINIGAME WITH TWO HALVES, not two minigames. The ascent and
// the landing share the craft record, the clock, the score and the events —
// what changes at orbit is which physics the step runs and which art the app
// draws, which is exactly a PHASE and not a second cabinet.

import type { Rng } from "@game/lib/rng.ts";

import type { Difficulty } from "../types/index.ts";
import type { FlightOutcome, FlightWreck } from "./config.ts";

/** Which half of the trip the sim is flying. */
export type FlightPhase = "ascent" | "landing";

/**
 * WHAT IS ADRIFT IN THE SKY — the field's whole vocabulary, and the three
 * different afternoons a collision with one buys: a BOUNCE (the garbage), a
 * BURST (anything alive) or a HOLE (anything built).
 *
 * WHICH OF THEM IS WHERE is `layers.ts` — every kind below flies in an
 * authored band of altitude, and one kind can carry two neighbourhoods through
 * its variants (a parcel quad and a solar-winged watchkeeper are both
 * `drone`). The engine does not know what any of them LOOK like: a `variant`
 * indexes the app's own art tables (`rocket-screen/`), the same fence every
 * drive remain is drawn along.
 */
export type OrbitKind =
  /** A piece of GOODCO's disposal business — thirty years of "recycling" fired
   * upward on a government contract. Never holes the ship: it BOUNCES off,
   * scuffs the paintwork, and shoves the balance by its own WEIGHT
   * (`JUNK_KG`) — a couch is a wallop, a crushed can is a tap. */
  | "junk"
  /** A GOODCO satellite — the internet constellation, sold as connectivity
   * for everybody and paid for by the people trapped under the shell. Holes
   * the ship. */
  | "satellite"
  /** A military bird, higher than the constellation and pointed the other
   * way. Bigger, heavier and nobody's product; holes more. */
  | "milsat"
  /** A rock that never asked anybody. Holes the ship for less. */
  | "rock"
  /** An aircraft crossing its own lane — a high-wing single down in the
   * light-traffic lanes, an airliner up at cruise. What it costs is the
   * VARIANT's (`PLANE_HULL_FRAC`); either way it goes up like the machine it
   * is. */
  | "plane"
  /** A drone: a parcel quad over the rooftops, or a solar-winged machine on
   * the watch deck at 20 km. A lithium firecracker. */
  | "drone"
  /** A bird, up where birds are. SOFT: bursts across the hull. */
  | "bird"
  /** A skydiver under canopy, off the corridor where jumping is still legal.
   * SOFT: the drive's crowd, met a thousand feet up. */
  | "skydiver"
  /** A paraglider having a hobby. SOFT. */
  | "paraglider";

/** The kinds that BURST rather than hole — one list, so the collision, the
 * fx and the gore gate can never disagree about who bleeds. */
export const SOFT_KINDS: readonly OrbitKind[] = [
  "bird",
  "skydiver",
  "paraglider",
];

/** One thing adrift — where it is, how it drifts, and which art it wears. */
export type OrbitObject = {
  /** Stable id — the app keys per-piece presentation off it. */
  id: number;
  kind: OrbitKind;
  /** Which of its kind's art variants this one wears — rolled at spawn off the
   * field's own stream, never re-rolled. */
  variant: number;
  /** Across the sky (world px, 0..`FLIGHT.fieldW`). */
  x: number;
  /** Up the sky (world px of altitude). */
  alt: number;
  /** Drift (px/s). Junk barely moves, satellites cross, rocks fall. */
  vx: number;
  vy: number;
  /** How it lies (rad) and how fast it turns over (rad/s) — floating garbage
   * tumbles slowly, which is most of what "floats in space" looks like. */
  angle: number;
  spin: number;
  /** Collision radius (px). */
  r: number;
};

/** The craft the player is holding — the ship on the way up, the module on the
 * way down. One record for both, because the physics reads the same fields. */
export type FlightCraft = {
  /** Across the sky (world px). */
  x: number;
  /** Altitude (world px above the ground of whichever half this is). */
  alt: number;
  /** Velocity (px/s; `vy` positive UP). */
  vx: number;
  vy: number;
  /** Lean off vertical (rad, positive starboard) and its rate. */
  tilt: number;
  tiltVel: number;
  /** What is left of the skin, 0–1. Trash never touches it and neither does
   * anything alive; anything BUILT does. */
  hull: number;
  /**
   * WHAT IS LEFT IN THE TANKS, 0–1 — the ascent's weight, spent as the burn
   * runs (`burnFuelPerS`). The engine never cuts when it hits zero (an empty
   * ship still flies on the base burn — running dry is not a fail state);
   * what the propellant buys while it lasts is MASS, and the thrust pushes
   * the ship that is actually left (`fuelMassMult`). The landing module's
   * gauge just reads full — its engine is a fixed authority.
   */
  fuel: number;
};

/** Everything the sky owes the app this tick — sounds, flashes and beats,
 * drained every tick exactly as a drive's are. */
export type FlightEvent =
  /** A bag met the hull and bounced off. `side` says which shoulder took it
   * (for the pan and the kick's direction), `along`/`across` where it landed
   * in the ship's own frame (the scuff rides the hull the way a splat does),
   * and `kg` its weight — the thud's size, and the shove's. */
  | {
      type: "trashHit";
      variant: number;
      side: 1 | -1;
      along: number;
      across: number;
      kg: number;
    }
  /** THE BOOSTER LET GO — the orbit beat's hinge: the settled ship drops its
   * spent stage and the upper half flies on. Raised exactly once per climb,
   * over the orbit hold. */
  | { type: "separation"; x: number; alt: number }
  /** Something hard went through the paintwork. */
  | {
      type: "strike";
      kind: "satellite" | "milsat" | "rock" | "plane" | "drone";
      variant: number;
      x: number;
      alt: number;
    }
  /** Something SOFT did not go through anything — it came apart across the
   * nose. `along`/`across` is where it landed in the ship's own frame (the
   * smear rides the hull the way the trash does); whether the smear is red is
   * the app's question to the gore gate (`FlightParams.gib`/`dust`). */
  | {
      type: "splat";
      kind: "bird" | "skydiver" | "paraglider";
      side: 1 | -1;
      along: number;
      across: number;
    }
  /** Something detonated — the ship, the module, or a satellite in the chain.
   * `seed` picks the app's whole picture of it. */
  | {
      type: "explosion";
      x: number;
      alt: number;
      size: "big" | "small";
      seed: number;
    }
  /** The ship (or the module) is gone. */
  | { type: "wrecked"; cause: FlightWreck; x: number; alt: number }
  /** The lean crossed the warning line (edge-triggered — the dashboard's beep,
   * never a hold). */
  | { type: "warning" }
  /** The planet let go: the climb is done. */
  | { type: "orbit" }
  /** The pads met the regolith slowly enough. `vy` is the impact speed (px/s,
   * positive down) and `onPad` whether it was the marked pad. */
  | { type: "touchdown"; vy: number; onPad: boolean };

/** A hit worth a burst — this tick's contacts and everything a blast took
 * apart, drained every tick. The app draws each one bursting in its own art. */
export type FlightStrike = {
  kind: OrbitKind;
  variant: number;
  x: number;
  alt: number;
};

/**
 * A PRESSURE FRONT STILL TRAVELLING — one entry per explosion, alive for
 * `maxMs`. Sim state for a thing that looks like presentation, for the drive's
 * shockwave reason: the front decides where every nearby bag ends up and which
 * satellite goes up next, and the renderer must not.
 *
 * `ms` may start NEGATIVE — that is a fuse, and the chain's whole rhythm: a
 * satellite caught in a blast is booked to explode before it has, and nothing
 * happens until its clock crosses zero.
 */
export type FlightBlast = {
  id: number;
  x: number;
  alt: number;
  /** Ms since (or until, negative) detonation. */
  ms: number;
  /** Which table of `FLIGHT.blast` this front reads. */
  size: "big" | "small";
  /** The seed the app rolls this explosion's whole look off — fireball count,
   * colours, debris — so two blasts never look alike and the same one always
   * looks like itself. */
  seed: number;
  /** Ids already shoved by this front — a front passes a bag once. */
  pushed: number[];
};

/** What the player's hands are doing. */
export type FlightInput = {
  /** The boosters, held: 0–1. There is no brake — the burn never stops. */
  throttle: number;
  /**
   * WHICH NOZZLE IS OPEN: −1 (the PORT poof, wide open) .. 1 (the STARBOARD
   * one). It names the THRUSTER, not a heading — this is a ship, and a ship is
   * steered by venting gas out of one side of it.
   *
   * SO A POOF PUSHES THE NOSE THE OTHER WAY, and both legs of the flight obey
   * it: `+1` vents to starboard, which swings the nose to port, which leans the
   * burn to port, which is how the craft ends up going left. That is one rule
   * for the whole trip, and it is why the ascent and the drop must never be
   * read as two conventions — a stick that means one thing on the way up and
   * the mirror of it on the way down is the fastest way to lose a landing.
   *
   * The poof FX is drawn on the side that FIRED (`voiceFlightControls`), so
   * what the player sees leaving the hull always agrees with which way the
   * ship then swings.
   */
  steer: number;
};

/** Nobody touching anything — the flight's own IDLE input. */
export const IDLE_FLIGHT_INPUT: FlightInput = Object.freeze({
  throttle: 0,
  steer: 0,
});

/** WHICH SLICE OF THE TRIP a flight is — the whole climb-and-drop, or the
 * drop alone (the arcade shelf's MOON LANDING cabinet and the workbench's
 * `phase=landing`). One sim either way; the leg decides where it starts and
 * what par it is measured against, and the board ranks each leg among its
 * own. */
export type FlightLeg = "trip" | "landing";

export type FlightParams = {
  /** The seed the whole sky is derived from. A RESTART reuses it, so the shell
   * of junk that killed you is the same shell you get to learn. */
  seed: number;
  /** Which slice is being flown. Absent means the whole trip. */
  leg?: FlightLeg;
  /**
   * THE RUNG THE SKY IS FLOWN ON — the run's own difficulty, carried in
   * because a flight is settled whole before its first tick and has no run
   * under it to ask afterwards. What it turns is the field's thickness, the
   * ship's tippiness and what a hit costs (`DifficultyDef.flight`).
   */
  difficulty: Difficulty;
  /** Where the module ends up: the level the flight hands on to when it is
   * down. */
  to: string;
  /** How high orbit is (world px), when it is not the whole sky. Omitted for
   * every flight a player takes; the attract loop brings the top down
   * (`FLIGHT.attractCoursePx`), for the drive's own reason. */
  coursePx?: number;
  /**
   * THE GORE GATE'S ANSWER, settled at the door (`rocket-screen/begin.ts`)
   * exactly as the road settles its own: may the sky's soft bodies burst red
   * (`gib`), and is this the SFW build's fairy-dust read (`dust`). Absent
   * means yes/no respectively — the gate FAILS OPEN, like everything under
   * the mature-content umbrella.
   */
  gib?: boolean;
  dust?: boolean;
};

/** The whole of a flight. */
export type FlightState = {
  /** The parameters it was built from — kept so a restart can rebuild it
   * exactly (`restartFlight`). Its own copy, like a drive's. */
  params: FlightParams;
  /** The sky's own seeded stream. Never `state.rng()`: a flight is not a run
   * and must never be able to shift one's rolls. */
  rng: Rng;
  /** Which half is being flown. */
  phase: FlightPhase;
  /** The thing in the player's hands. */
  craft: FlightCraft;
  /** Everything adrift within the live band of sky. */
  field: OrbitObject[];
  /** Wall-clock ms since the flight began (this phase's build — a restart
   * rewinds it with everything else). */
  ms: number;
  /**
   * THE STOPWATCH — ms the player has actually been flying, and the number par
   * is measured against. It runs from each half's hand-over and stops on the
   * terminal beats; unlike `ms` it SURVIVES the drop from orbit and every
   * landing restart, so a crashed descent costs time on the board instead of
   * quietly refunding it.
   */
  clockMs: number;
  /** Where the flight has got to. */
  outcome: FlightOutcome;
  /** Ms spent in a terminal outcome — the wreck's smoke, the orbit breath, the
   * landed module being looked at. */
  outcomeMs: number;
  /** Why the ship is wreckage, when it is. */
  wreck: FlightWreck | null;

  // ── THE FIELD'S RUNNING MARKS ──────────────────────────────────────────────
  /** How far up the next piece of the SHELL is due (world px of altitude) —
   * a running mark, so the garbage is laid down once as the climb unrolls
   * rather than re-rolled every tick. */
  nextJunkAt: number;
  /** …and the same for everything in ORBIT (`SKY_LAYERS`' orbital bands: the
   * constellation, the military's own, the rocks). On the SHELL's stream and
   * on a stride nothing the player does can move — a restart replays the same
   * sky, so the hardware that killed you has to be waiting in the same
   * place. */
  nextOrbitAt: number;
  /** …and the AIR TRAFFIC's mark, with its own stream beside it: what a sky
   * off the closed corridor feeds the climb must never shift the orbits
   * everybody learns (`field.ts` — the traffic stride reads how far off course
   * the ship is, so its draws are the flying's own). */
  nextTrafficAt: number;
  trafficRng: Rng;
  /**
   * EACH SKY LAYER'S RUNNING DEBT, in the order of `SKY_LAYERS` — how much of
   * its next arrival the climb so far has already paid for.
   *
   * It is what makes "you meet every neighbourhood on every trip" a fact
   * rather than a likelihood: a layer authored at three arrivals deals three,
   * where a per-step coin would deal none about one climb in twenty. See
   * `walkBand`.
   */
  layerDue: number[];

  // ── THE WANDER ─────────────────────────────────────────────────────────────
  /** Where this ship's bias torque started in its cycle (rad, seeded) — two
   * seeds lean on different shoulders at different times, and one seed always
   * leans the same way at the same altitude. */
  gustPhase: number;

  // ── THE ORBIT BEAT'S LATCH ─────────────────────────────────────────────────
  /** The booster has been dropped — the separation event is raised exactly
   * once per climb, over the orbit hold, and this is its edge memory. */
  boosterAway: boolean;

  // ── THE TALLIES THE SCORE READS ────────────────────────────────────────────
  /** Every bag that took a swing at the hull on the way up — the scorecard's
   * whole count, itemised and worth nothing. */
  trashCount: number;
  /** Hits that cost skin. */
  hullHits: number;
  /** Soft bodies met on the way up — birds, skydivers, paragliders. On the
   * scorecard beside the trash, and worth exactly as much. */
  softHits: number;
  /** The biggest figure the speed dial ever said (mph, `flightMph`) — the
   * dial's bragging rights, and the scorecard's speed line. */
  topSpeed: number;
  /** The skin the SHIP reached orbit with (0–1) — the score's hull bonus reads
   * the climb's answer, not the module's. */
  hullAtOrbit: number;
  /** How the module met the ground (px/s, positive down; 0 until it has). */
  touchdownVy: number;
  /** …and whether it was the marked pad. */
  touchdownPad: boolean;

  // ── THE LANDING'S OWN GROUND ───────────────────────────────────────────────
  /** Where the marked pad sits (world px across the field, seeded once per
   * flight — every attempt at the drop gets the same ground). */
  padX: number;

  /** The lean the warning has already been sounded for (edge memory). */
  warned: boolean;

  /** Pressure fronts still travelling (and fuses still burning) — see
   * `FlightBlast`. Empty on all but a second or two of a flight. */
  blasts: FlightBlast[];
  /** Hits worth a burst this tick. Drained every tick. */
  strikes: FlightStrike[];
  /** Sounds and beats owed to the app. Drained every tick. */
  events: FlightEvent[];
  /** The id counter for everything the sky mints. */
  nextId: number;
};
