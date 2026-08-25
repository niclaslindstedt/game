// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// SOMEBODY AT THE STICK — the flight's auto-pilot, the drive's auto-driver at
// the second cabinet.
//
// IN THE ENGINE AND NOT THE SCREEN, for the driver's own reasons: everything
// that wants to WATCH this sky rather than fly it is headless or nearly so —
// the attract loop, a `?rocket&bot=1` workbench lap, the store-shot recipes,
// and any bench that ever measures the climb. It also has to REPLAY (a flight
// is deterministic, and a sky that flew differently on the second run would
// take the whole guarantee down with it), and determinism is a property of the
// sim, so the decision belongs beside the sim.
//
// WHAT IT IS FOR is the bar every bot here is held to: the decisions a decent
// human pilot makes, no artificial handicaps and no cheating either. It holds
// the ship upright first (on an inverted pendulum everything else is optional),
// leans INTO the wind the way a pilot crabs a crosswind, keeps the launch
// corridor (an off-course sky is a thicker sky — `layers.ts`), threads the gaps in
// the shell instead of praying through them, and only opens the boosters when
// the lean is caught and the next seconds look survivable.
//
// ── IT NEVER TOUCHES THE DICE ───────────────────────────────────────────────
// Not one draw of either of the sky's streams, ever — everything below is read
// off the state or the clock, so a flight flown by this is the same flight a
// person flies with the same inputs.
//
// ── AND IT IS A PARAMETER, NOT A MODE ───────────────────────────────────────
// `FlightState` knows nothing about this file. The driver is a small object
// the CALLER owns and hands back each tick (it holds only what hysteresis
// needs: the column it has committed to and when it took it), so a flight
// being flown by a person and one being flown by this are the same flight.

import {
  FLIGHT,
  airFrac,
  flightCoursePx,
  offCourseFrac,
  windAt,
} from "./config.ts";
import { landingGates } from "./field.ts";
import { flightHandsOff } from "./index.ts";
import type { FlightInput, FlightState, OrbitKind } from "./types.ts";

/** A place this pilot has been hit before — the sky's own coordinates, kept
 * across restarts. */
type FlightLesson = { alt: number; x: number };

/**
 * The pilot's whole memory: a committed column and when it was taken (the
 * drive driver's hysteresis, for the drive driver's reason — two gaps within
 * a hair of each other must not be traded between every tick), plus the
 * LESSONS. A restart rebuilds the same seeded sky on purpose ("the shell that
 * killed you is the shell you learn"), and a memoryless bot would fly the
 * same fatal line into the same satellite forever — so every hard strike is
 * remembered where it happened, and the next attempt gives that patch of sky
 * a wider berth. Reading the state it is handed, never the dice: a person
 * with a notepad, not a cheat.
 */
export type FlightDriver = {
  /** The world x he is steering the climb for, or null before the first
   * decision. */
  targetX: number | null;
  /** Flight-clock ms at which the current column was committed to. */
  committedMs: number;
  /** Where it has been hit, newest last (capped at `LESSON_CAP`). */
  lessons: FlightLesson[];
};

export function createFlightDriver(): FlightDriver {
  return { targetX: null, committedMs: 0, lessons: [] };
}

// ── THE PILOT'S OWN NUMBERS ─────────────────────────────────────────────────
// Plain constants rather than content knobs: nothing sweeps them yet, and a
// knob nobody turns is a schema row nobody needed.

/** How far up the sky he reads (px above the nose) — inside `field.aheadPx`,
 * because past it there is nothing laid down to read. */
const LOOKAHEAD_PX = 700;
/** Columns probed either side of the ship when picking a line (px, and the
 * probe pitch between them). */
const PROBE_SPAN_PX = 200;
const PROBE_PITCH_PX = 20;
/** Berth asked around anything drifting (px, added to both radii). */
const CLEARANCE_PX = 16;
/** How long a picked column is held before a better one may take over, and
 * how much better it has to be (the drive's two-part fix for line churn). */
const COMMIT_MS = 700;
const SWITCH_MARGIN = 0.35;
/** What a column costs per px of lateral travel to reach it — the tie-breaker
 * that keeps him from crabbing across the sky for a marginal gap. */
const HOLD_COST = 0.004;
/** …and per unit of off-course at that column: the corridor is part of the
 * line, not an afterthought (`offCourseFrac`). */
const COURSE_COST = 1.4;
/** The lean the column chase may ask for (rad) — well under the warning line,
 * because the lean IS the lateral engine and the flip is the price. */
const MAX_LEAN_RAD = 0.3;
/** PD gains: the column chase (per px, per px/s of drift)… */
const CHASE_X = 0.0032;
const CHASE_VX = 0.0075;
/** …and the lean's own servo (per rad, per rad/s). */
const STEER_TILT = 5.2;
const STEER_RATE = 1.8;
/** Boost is closed past this lean (rad) — a caught ship first, a fast ship
 * second — and while anything sits inside this many seconds of the nose. */
const BOOST_LEAN_RAD = 0.24;
const BOOST_THREAT_S = 1.1;
/** The notepad: how many strikes are remembered, how far below one its
 * caution starts (px of altitude), how wide the berth is (px), and what
 * flying back into it costs. */
const LESSON_CAP = 14;
const LESSON_REACH_PX = 850;
const LESSON_BERTH_PX = 60;
const LESSON_COST = 2.2;

/** What crossing paths with each kind is worth avoiding, relative to a bag of
 * trash. A person swerves hardest for the things that end the flight — and
 * still swerves for a skydiver, because he is a person. */
function kindCost(kind: OrbitKind): number {
  switch (kind) {
    case "plane":
      return 3.2;
    case "milsat":
      return 2.8;
    case "satellite":
      return 2.4;
    case "rock":
      return 1.6;
    case "drone":
      return 1.2;
    case "junk":
      return 0.8;
    // The soft bodies cost the ship almost nothing; the pilot dodges them
    // anyway, at bystander priority.
    default:
      return 0.5;
  }
}

/** How much a thing this far off a column matters: 1 dead on it, 0 at twice
 * the berth, squared between — the drive's `proximity`, so the middle of a
 * gap genuinely wins. */
function proximity(offset: number, need: number): number {
  const reach = need * 2;
  const gap = Math.abs(offset);
  if (gap >= reach) return 0;
  const near = 1 - gap / reach;
  return near * near;
}

/** What flying THIS column costs over the next stretch of sky. */
function columnCost(
  driver: FlightDriver,
  state: FlightState,
  x: number,
  lookAheadPx: number,
): number {
  const { craft } = state;
  const vy = Math.max(60, craft.vy);
  let cost = COURSE_COST * offCourseFrac(x);
  cost += HOLD_COST * Math.abs(x - craft.x);
  const need = FLIGHT.ascent.shipHalfW + CLEARANCE_PX;
  for (const o of state.field) {
    const up = o.alt - craft.alt;
    if (up <= 0 || up > lookAheadPx) continue;
    // Where it will BE when the nose is level with it, not where it floats.
    const eta = up / vy;
    const predX = o.x + o.vx * eta;
    const urgency = 1 - up / lookAheadPx;
    cost += kindCost(o.kind) * proximity(predX - x, need + o.r) * urgency;
  }
  // The notepad: sky that has already hit this pilot gets a wide berth on the
  // next pass — which is what turns a replayed shell into a learned one.
  for (const lesson of driver.lessons) {
    const up = lesson.alt - craft.alt;
    if (up <= 0 || up > LESSON_REACH_PX) continue;
    cost +=
      LESSON_COST *
      proximity(lesson.x - x, LESSON_BERTH_PX) *
      (1 - up / LESSON_REACH_PX);
  }
  return cost;
}

/** Anything on a crossing course inside `BOOST_THREAT_S` of the nose — the
 * moment a pilot's thumb comes OFF the boosters. */
function threatClose(state: FlightState): boolean {
  const { craft } = state;
  const vy = Math.max(60, craft.vy);
  const need = FLIGHT.ascent.shipHalfW + CLEARANCE_PX;
  for (const o of state.field) {
    const up = o.alt - craft.alt;
    if (up <= 0) continue;
    const eta = up / vy;
    if (eta > BOOST_THREAT_S) continue;
    const predX = o.x + o.vx * eta;
    if (Math.abs(predX - craft.x) < need + o.r + 10) return true;
  }
  return false;
}

/** One tick of the ASCENT: hold it upright, hold the corridor, thread the
 * shell, boost what is left. */
function flyAscent(driver: FlightDriver, state: FlightState): FlightInput {
  const a = FLIGHT.ascent;
  const { craft } = state;
  const coursePx = flightCoursePx(state.params);

  // ── PICK THE COLUMN ───────────────────────────────────────────────────────
  let bestX = craft.x;
  let bestCost = Infinity;
  for (let dx = -PROBE_SPAN_PX; dx <= PROBE_SPAN_PX; dx += PROBE_PITCH_PX) {
    const cost = columnCost(driver, state, craft.x + dx, LOOKAHEAD_PX);
    if (cost < bestCost) {
      bestCost = cost;
      bestX = craft.x + dx;
    }
  }
  const held = driver.targetX;
  const heldCost =
    held === null ? Infinity : columnCost(driver, state, held, LOOKAHEAD_PX);
  const mayChange = state.ms - driver.committedMs >= COMMIT_MS;
  if (held === null || (mayChange && bestCost < heldCost - SWITCH_MARGIN)) {
    driver.targetX = bestX;
    driver.committedMs = state.ms;
  }
  const targetX = driver.targetX ?? bestX;

  // ── THE LEAN THE COLUMN WANTS ─────────────────────────────────────────────
  // A PD chase on the column, PLUS the crosswind's feed-forward: the wind's
  // pull is `pullPerS · air · wind` and the lean's engine is `thrust · sin`,
  // so the crab angle that parks the drift is their ratio — a pilot leaning
  // into the weather instead of discovering it downwind.
  const air = airFrac(craft.alt, coursePx);
  const wind = windAt(state.params.seed, craft.alt);
  const thrust = a.burnPx + a.boostPx * 0.5;
  const crab = Math.asin(
    Math.max(
      -0.5,
      Math.min(0.5, (-FLIGHT.wind.pullPerS * air * wind) / thrust),
    ),
  );
  const wantTilt = Math.max(
    -MAX_LEAN_RAD,
    Math.min(
      MAX_LEAN_RAD,
      CHASE_X * (targetX - craft.x) - CHASE_VX * craft.vx + crab,
    ),
  );

  // ── THE STICK ─────────────────────────────────────────────────────────────
  // Positive steer pushes the tilt negative (`FlightInput`), so the servo's
  // sign reads "how far past the wanted lean is it".
  const steer = Math.max(
    -1,
    Math.min(
      1,
      STEER_TILT * (craft.tilt - wantTilt) + STEER_RATE * craft.tiltVel,
    ),
  );

  // ── THE THUMB ─────────────────────────────────────────────────────────────
  // Boost is what the trip is for; it is surrendered the moment the lean is
  // not caught or something is about to cross the nose — which is exactly the
  // trade the minigame prices for a person.
  const upright = Math.abs(craft.tilt) < BOOST_LEAN_RAD;
  const throttle = upright && !threatClose(state) ? 1 : 0;
  return { throttle, steer };
}

/** One tick of the DROP: kill the drift toward the pad, feather the fall. */
function flyLanding(state: FlightState): FlightInput {
  const { craft } = state;
  // Chase the marked pad while there is height to spend; hold level for the
  // last stretch — the gates are speed, drift and lean, and a lean spent on
  // the pad at 40 ft is a lean the touchdown pays for.
  const chase =
    craft.alt > 70
      ? Math.max(
          -0.28,
          Math.min(0.28, (state.padX - craft.x) * 0.004 - craft.vx * 0.02),
        )
      : Math.max(-0.06, Math.min(0.06, -craft.vx * 0.01));
  // Positive steer pushes the tilt negative (`FlightInput`), the ascent's
  // servo and this one reading the same way round: "how far PAST the wanted
  // lean is it".
  const steer = Math.max(
    -1,
    Math.min(1, (craft.tilt - chase) * 4 + craft.tiltVel * 1.5),
  );
  // The descent profile: quicker high up, a feather at the ground, never past
  // the legal limit's comfortable half — the RUNG's limit (`landingGates`), so
  // a tight rung is flown to its own gate rather than to the shipped one.
  const wantVy = -Math.min(
    landingGates(state.params.difficulty).vyPx * 0.55,
    6 + craft.alt * 0.11,
  );
  return { throttle: craft.vy < wantVy ? 1 : 0, steer };
}

/**
 * ONE TICK'S WORTH OF FLYING — hand the result straight to `stepFlight`.
 * Pure but for the driver's own two fields, exactly as the road's is.
 */
export function flightDriverInput(
  driver: FlightDriver,
  state: FlightState,
): FlightInput {
  // A restart rewinds the clock; a clock that went backwards is a new sky and
  // the committed column belongs to the old one. The LESSONS survive it — the
  // rewound sky is the same sky, and re-learning it was the point of keeping
  // the seed.
  if (state.ms < driver.committedMs) {
    driver.targetX = null;
    driver.committedMs = state.ms;
  }
  // Take the notes: every hard strike still sitting in last tick's events is
  // a place this sky has hit this pilot (`FlightDriver.lessons`).
  if (state.phase === "ascent") {
    for (const event of state.events) {
      if (event.type !== "strike") continue;
      driver.lessons.push({ alt: event.alt, x: event.x });
      if (driver.lessons.length > LESSON_CAP) driver.lessons.shift();
    }
  }
  // A finished flight wants nothing, and the opening flies itself.
  if (state.outcome !== "flying" || flightHandsOff(state)) {
    return { throttle: 0, steer: 0 };
  }
  return state.phase === "ascent"
    ? flyAscent(driver, state)
    : flyLanding(state);
}
