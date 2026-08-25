// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE FLIGHT — the climb through GOODCO's orbital landfill and the drop onto
// the moon, between the launch on the lawn and the regolith.
//
// TWO HALVES, ONE INSTABILITY. The ascent is an inverted pendulum on a column
// of thrust: the ship never tends upright, the throttle feeds the flip, and
// the steering poofs are the player's whole grip on it. The landing is the
// same controls on a craft with no instability at all — tilt goes where it is
// put — which is what makes the second half read as relief instead of repeat.
// Everything else (the field, the weighted trash, the score) hangs off those
// two facts.

import { createRng } from "@game/lib/rng.ts";

import { difficultyDef } from "../defs/difficulties.ts";
import {
  FLIGHT,
  FLIGHT_OUTCOME,
  FLIGHT_WRECKS,
  airFrac,
  climbMph,
  downrangeMph,
  flightCoursePx,
  fuelMassMult,
  gravityAt,
  offCourseFrac,
  windAt,
  type FlightWreck,
} from "./config.ts";
import { detonate, stepBlasts } from "./blast.ts";
import {
  bandFrac,
  firstLayerDue,
  firstMarks,
  junkKg,
  landingGates,
  planeHullFrac,
  stepField,
} from "./field.ts";
import type {
  FlightCraft,
  FlightInput,
  FlightParams,
  FlightState,
  OrbitObject,
} from "./types.ts";

/**
 * Build a flight — the ascent, already climbing. The launch itself is the
 * cutscene's beat (the lawn, the soot, the trees), so the minigame opens in
 * the air with the controls held (`flightHandsOff`) and GET READY over it.
 * A LANDING leg skips the climb whole: the same state, already dropped
 * (`beginDescent`), which is also what makes its restarts free.
 */
export function createFlight(params: FlightParams): FlightState {
  const rng = createRng(params.seed);
  // The air traffic's own stream, derived from the same seed — see
  // `FlightState.trafficRng` for why it is not the shell's.
  const trafficRng = createRng((params.seed ^ 0x2545f491) >>> 0);
  const marks = firstMarks();
  const state: FlightState = {
    params: { ...params },
    rng,
    phase: "ascent",
    craft: {
      x: FLIGHT.fieldW / 2,
      // Barely off the lawn — see `launchAltPx`: the climb starts LOW, over
      // the launch site itself, never in the stratosphere.
      alt: FLIGHT.ascent.launchAltPx,
      vx: 0,
      vy: 60,
      // The pad never sent anybody up straight: the first thing the hand-over
      // hands over is a lean to catch, and which shoulder it is on is the
      // seed's.
      tilt: (rng() < 0.5 ? -1 : 1) * FLIGHT.ascent.launchTiltRad,
      tiltVel: 0,
      hull: 1,
      fuel: 1,
    },
    field: [],
    ms: 0,
    clockMs: 0,
    outcome: FLIGHT_OUTCOME.flying,
    outcomeMs: 0,
    wreck: null,
    nextJunkAt: marks.junk,
    nextOrbitAt: marks.orbit,
    nextTrafficAt: marks.traffic,
    trafficRng,
    layerDue: firstLayerDue(rng),
    gustPhase: rng() * Math.PI * 2,
    boosterAway: false,
    trashCount: 0,
    hullHits: 0,
    softHits: 0,
    topSpeed: 0,
    hullAtOrbit: 1,
    touchdownVy: 0,
    touchdownPad: false,
    padX: 0,
    warned: false,
    blasts: [],
    strikes: [],
    events: [],
    nextId: 1,
  };
  if (params.leg === "landing") beginDescent(state);
  return state;
}

/**
 * SWAP THE SHIP FOR THE MODULE — the drop begins. Called by the app when the
 * orbit beat has been held long enough, and again (via `restartFlight`) after
 * every crashed landing; both build the SAME drop, because the descent's rolls
 * come off their own stream derived from the seed rather than off wherever the
 * ascent left the sky's.
 *
 * What survives the swap is the TRIP: the clock, the tallies and the hull the
 * ship reached orbit with — the module is a fresh craft, the flight is not a
 * fresh flight.
 */
export function beginDescent(state: FlightState): void {
  const l = FLIGHT.landing;
  // HOW HARD THE HAND-OVER IS is the rung's (`DifficultyDef.flight.dropMult`):
  // the module is always released off-pad and always crooked, and what the
  // ladder decides is how much of both there is — and how little sky there is
  // to fix them in. The pull and the engine are the moon's and do not move.
  const drop = difficultyDef(state.params.difficulty).flight.dropMult;
  const rng = createRng((state.params.seed ^ 0x9e3779b9) >>> 0);
  state.phase = "landing";
  state.padX = 60 + rng() * (FLIGHT.fieldW - 120);
  state.craft = {
    // Dropped off-pad on purpose: a module released over its own mark would be
    // a game about waiting, and the drift to kill is the game.
    x: 60 + rng() * (FLIGHT.fieldW - 120),
    alt: l.startAltPx / drop,
    vx: (rng() * 2 - 1) * l.startVxPx * drop,
    vy: -l.startVyPx,
    tilt: (rng() * 2 - 1) * l.startTiltRad * drop,
    tiltVel: 0,
    hull: 1,
    // The module's own tank never enters the physics — its descent engine is
    // a fixed authority (`landing.mainPx`) — so the gauge just reads full.
    fuel: 1,
  };
  state.field = [];
  state.ms = 0;
  state.outcome = FLIGHT_OUTCOME.flying;
  state.outcomeMs = 0;
  state.wreck = null;
  state.warned = false;
  state.blasts.length = 0;
  state.strikes.length = 0;
  state.events.length = 0;
}

/**
 * A WRECK puts the player back at the top of the half that killed them — the
 * whole climb for a flipped ship, the drop alone for a crashed module ("start
 * over the landing", never the trip). The seed is kept, so the shell that got
 * you is the shell you learn.
 */
export function restartFlight(previous: FlightState): FlightState {
  const next = createFlight(previous.params);
  if (previous.phase === "landing") {
    beginDescent(next);
    // The trip's half survives its own restarts: the climb is banked, and the
    // clock keeps the crashes — a drop you broke two modules on is a slower
    // trip, which is the only honest reading of it.
    next.clockMs = previous.clockMs;
    next.trashCount = previous.trashCount;
    next.hullHits = previous.hullHits;
    next.softHits = previous.softHits;
    next.topSpeed = previous.topSpeed;
    next.hullAtOrbit = previous.hullAtOrbit;
  }
  return next;
}

/** IS THE SHIP STILL FLYING ITSELF — the opening's hold, during which every
 * input is ignored and the trim keeps the lean parked. The whole hand-over
 * test, exactly as the drive's `driveHandsOff` is. */
export function flightHandsOff(state: FlightState): boolean {
  if (state.outcome !== FLIGHT_OUTCOME.flying) return false;
  const hold =
    state.phase === "ascent"
      ? FLIGHT.opening.handsOffMs
      : FLIGHT.opening.landingHandsOffMs;
  return state.ms < hold;
}

/**
 * The dial's number — the webcast's telemetry (`FLIGHT.orbitalMph`): the climb
 * the player is flying plus the gravity turn's downrange speed, in quadrature,
 * PEGGED at orbital speed because that is where the figure stops meaning
 * anything a dial face could add to. The drop reads its own descent speed
 * alone — there is no orbit under a module easing onto the regolith.
 */
export function flightMph(state: FlightState): number {
  const climb = climbMph(state.craft.vy);
  if (state.phase === "landing") return Math.round(climb);
  const across = downrangeMph(flightAltFrac(state));
  return Math.min(FLIGHT.orbitalMph, Math.round(Math.hypot(climb, across)));
}

/** How far up the sky the climb has got, 0–1 — the altitude tape, and the
 * background's whole palette. */
export function flightAltFrac(state: FlightState): number {
  if (state.phase === "landing") return 1;
  return Math.min(1, state.craft.alt / flightCoursePx(state.params));
}

/** THE WIND THE SHIP CAN FEEL right now (px/s, signed) — the layer's wind
 * bought down by the air, which is also what a vane on the hull would read:
 * a jet stream's worth in the soup, nothing in vacuum. The landing has no
 * weather at all (the moon keeps none). */
export function flightWindPx(state: FlightState): number {
  if (state.phase === "landing") return 0;
  const coursePx = flightCoursePx(state.params);
  return (
    windAt(state.params.seed, state.craft.alt) *
    airFrac(state.craft.alt, coursePx)
  );
}

/** How far off the launch corridor the ship has wandered, 0–1 — the stray
 * spawner's throttle and the dashboard's lamp, off one ramp
 * (`offCourseFrac`). */
export function flightOffCourse(state: FlightState): number {
  if (state.phase === "landing") return 0;
  return offCourseFrac(state.craft.x);
}

/** HAS THE SHIP PUNCHED OUT OF THE SHELL — the sky above is clean, nothing is
 * left to hit, and the last stretch is a victory lap. The dashboard's CLEAR
 * beat and the voice's one line of relief both hang off this edge. */
export function flightShellClear(state: FlightState): boolean {
  if (state.phase === "landing") return true;
  return (
    state.craft.alt >= flightCoursePx(state.params) * FLIGHT.field.shellTopFrac
  );
}

function wreckOut(state: FlightState, cause: FlightWreck): void {
  state.outcome = FLIGHT_OUTCOME.wrecked;
  state.wreck = cause;
  state.events.push({
    type: "wrecked",
    cause,
    x: state.craft.x,
    alt: state.craft.alt,
  });
  // The ship going up is the flight's biggest front — it scatters the shelf
  // of garbage that killed it, and any satellite close enough joins the
  // chain over the wreck hold.
  detonate(state, state.craft.x, state.craft.alt, "big");
}

/**
 * Does this drifting thing touch the craft? The hull is a capsule along the
 * ship's own axis — nose to tail through the tilt — so a lean presents the
 * flank it actually presents.
 */
function touches(
  craft: FlightCraft,
  o: OrbitObject,
  halfW: number,
  halfH: number,
): boolean {
  // The axis unit vector, tilted off vertical.
  const ax = Math.sin(craft.tilt);
  const ay = Math.cos(craft.tilt);
  const dx = o.x - craft.x;
  const dy = o.alt - craft.alt;
  // Project the object onto the axis, clamp to the hull's length, and measure
  // the miss from that nearest point.
  const along = Math.max(-halfH, Math.min(halfH, dx * ax + dy * ay));
  const nx = craft.x + ax * along;
  const ny = craft.alt + ay * along;
  const mx = o.x - nx;
  const my = o.alt - ny;
  return mx * mx + my * my <= (halfW + o.r) * (halfW + o.r);
}

/**
 * WHAT A HARD HAZARD TAKES OFF THE SKIN (fraction of the ship). Most kinds are
 * one figure; an AIRCRAFT is priced per VARIANT (`PLANE_HULL_FRAC`), because a
 * high-wing single and an airliner are the same kind and not remotely the same
 * afternoon.
 */
function hazardHullFrac(
  kind: "satellite" | "milsat" | "rock" | "plane" | "drone",
  variant: number,
): number {
  const h = FLIGHT.hazard;
  if (kind === "satellite") return h.satelliteHullFrac;
  if (kind === "milsat") return h.milsatHullFrac;
  if (kind === "plane") return planeHullFrac(variant);
  if (kind === "drone") return h.droneHullFrac;
  return h.rockHullFrac;
}

/** The ascent's contacts: bags bounce off by their weight, soft bodies burst
 * across the nose, hardware holes — and everything knocks the balance. */
function collideAscent(state: FlightState): void {
  const a = FLIGHT.ascent;
  const rung = difficultyDef(state.params.difficulty).flight;
  const { craft } = state;
  for (let i = state.field.length - 1; i >= 0; i--) {
    const o = state.field[i]!;
    if (Math.abs(o.alt - craft.alt) > a.shipHalfH + o.r + 4) continue;
    if (!touches(craft, o, a.shipHalfW, a.shipHalfH)) continue;
    const side: 1 | -1 = o.x >= craft.x ? 1 : -1;
    // Where it met the hull, in the ship's own frame — the trash rides there,
    // and so does what is left of a bird.
    const ax = Math.sin(craft.tilt);
    const ay = Math.cos(craft.tilt);
    const dx = o.x - craft.x;
    const dy = o.alt - craft.alt;
    const along = Math.max(
      -a.shipHalfH,
      Math.min(a.shipHalfH, dx * ax + dy * ay),
    );
    if (o.kind === "junk") {
      // THE WEIGHTED BOUNCE. Nothing sticks and nothing holes: the piece
      // comes apart against the paintwork (the strike below is its burst),
      // leaves a scuff where it landed (the event's `along`/`across`), and
      // bills the ship an impulse priced by its own mass — a shove away from
      // the side it hit, a twist through the LEVER of where it landed (a bag
      // off the nose wrenches, the same bag amidships only shoves), and a
      // bite out of the climb.
      const t = FLIGHT.trash;
      const kg = junkKg(o.variant);
      const w = Math.min(t.maxKgFrac, kg / t.refKg);
      const lever = along / a.shipHalfH;
      craft.vx += -side * t.pushPx * w;
      craft.vy *= 1 - t.speedLossFrac * w;
      craft.tiltVel += -side * lever * t.kickPerS * w;
      craft.tiltVel += side * t.baseKickPerS * w;
      state.trashCount++;
      state.strikes.push({
        kind: o.kind,
        variant: o.variant,
        x: o.x,
        alt: o.alt,
      });
      state.events.push({
        type: "trashHit",
        variant: o.variant,
        side,
        along,
        across: side * (a.shipHalfW - 1),
        kg,
      });
    } else if (
      o.kind === "bird" ||
      o.kind === "skydiver" ||
      o.kind === "paraglider"
    ) {
      // SOFT: nothing here holes a rocket — it comes apart across it. The
      // burst and whatever it leaves on the paintwork are the app's
      // (`FlightEvent.splat` + the gore gate); the sim's bill is a thud.
      const soft = FLIGHT.soft;
      craft.vy *= soft.speedKeep;
      craft.tiltVel += side * soft.kickPerS;
      state.softHits++;
      state.strikes.push({
        kind: o.kind,
        variant: o.variant,
        x: o.x,
        alt: o.alt,
      });
      state.events.push({
        type: "splat",
        kind: o.kind,
        side,
        along,
        across: side * (a.shipHalfW - 1),
      });
    } else {
      const h = FLIGHT.hazard;
      craft.hull -= hazardHullFrac(o.kind, o.variant) * rung.damageMult;
      craft.vy *= h.speedKeep;
      craft.tiltVel += side * h.kickPerS;
      state.hullHits++;
      state.strikes.push({
        kind: o.kind,
        variant: o.variant,
        x: o.x,
        alt: o.alt,
      });
      state.events.push({
        type: "strike",
        kind: o.kind,
        variant: o.variant,
        x: o.x,
        alt: o.alt,
      });
      // Struck machinery is an explosion at arm's length: its own front
      // shoves the nearby garbage, knocks the ship's balance (`stepBlasts`),
      // and can light the chain. A rock just comes apart.
      if (o.kind !== "rock") detonate(state, o.x, o.alt, "small");
      if (craft.hull <= 0 && state.outcome === FLIGHT_OUTCOME.flying) {
        wreckOut(state, FLIGHT_WRECKS.holed);
      }
    }
    state.field.splice(i, 1);
  }
}

/** One tick of the climb. */
function stepAscent(state: FlightState, dt: number, input: FlightInput): void {
  const a = FLIGHT.ascent;
  const rung = difficultyDef(state.params.difficulty).flight;
  const { craft } = state;
  const coursePx = flightCoursePx(state.params);
  const handsOff = flightHandsOff(state);
  const throttle = handsOff ? 0 : Math.min(1, Math.max(0, input.throttle));
  const steer = handsOff ? 0 : Math.min(1, Math.max(-1, input.steer));
  const air = airFrac(craft.alt, coursePx);

  // ── THE LEAN ──────────────────────────────────────────────────────────────
  if (handsOff) {
    // The trim flies the opening: lean and rate both worked toward zero, hard
    // enough that GET READY is never interrupted by physics.
    craft.tiltVel += (-3 * craft.tilt - 2 * craft.tiltVel) * dt;
  } else {
    // THE INSTABILITY THIS TICK — the pendulum's own spring, plus what the
    // throttle adds, plus the AIR's overturning moment (`aeroTipPerS`): a lean
    // held at speed in thick air is fed by the square of that speed, which is
    // max-Q and is why easing off low down is a real decision rather than
    // timidity.
    const speed = Math.hypot(craft.vx, craft.vy);
    const q = Math.min(a.aeroCap, air * (speed / a.aeroRefPx) ** 2);
    const tip =
      a.tipPerS * rung.tipMult * (1 + a.boostTipFrac * throttle) +
      a.aeroTipPerS * q;
    // The wandering bias — off-axis thrust from a garage build, so it only
    // PARTLY dies with the air: the ship is never done being corrected.
    const gust =
      a.gustPerS *
      (0.35 + 0.65 * air) *
      Math.sin((state.ms / a.gustPeriodMs) * Math.PI * 2 + state.gustPhase);
    // THE WEATHER'S TORQUE — the tail catching the crosswind (`windAt`),
    // bought with air like everything the wind does: full weathervane in the
    // soup, nothing in vacuum.
    const wind = windAt(state.params.seed, craft.alt);
    const vane = FLIGHT.wind.tipPerS * air * (wind / FLIGHT.wind.maxPx);
    craft.tiltVel +=
      (tip * Math.sin(craft.tilt) +
        gust +
        vane -
        a.steerPerS * steer -
        a.tiltDampPerS * craft.tiltVel) *
      dt;
  }
  craft.tilt += craft.tiltVel * dt;

  // ── THE CLIMB ─────────────────────────────────────────────────────────────
  // THE TANKS DRAIN AND THE SHIP GETS LIGHTER — the trip's real physics: the
  // thrust never changes, the mass it pushes does, so the same burn that
  // barely beat gravity off the pad is throwing an empty shell by the top.
  // Boost spends propellant faster, which is its second, slower price.
  craft.fuel = Math.max(
    0,
    craft.fuel - (a.burnFuelPerS + a.boostFuelPerS * throttle) * dt,
  );
  const mass = fuelMassMult(craft.fuel);
  const thrust = (a.burnPx + a.boostPx * throttle) * mass;
  const g = gravityAt(craft.alt);
  // The medium the hull pushes through: the thinning air plus the shell's own
  // dust (see `dragK`) — gone above the shell, which is what lets the clear
  // stretch run away.
  const medium = air + a.dustK * bandFrac(craft.alt, coursePx);
  const drag = a.dragK * medium * craft.vy * Math.abs(craft.vy);
  craft.vy += (thrust * Math.cos(craft.tilt) - g - drag) * dt;
  craft.vx += thrust * Math.sin(craft.tilt) * dt;
  // THE WIND'S PUSH — the air dragging the hull toward its own speed. It is
  // the same term that bleeds a leaning burn (`lateralDragPerS` is the
  // still-air case), so a crosswind is fought the only way a rocket can: by
  // leaning into it. There is no wall to lean on instead — the sky has no
  // edges, and a lean held too long is a ship over somebody else's airspace
  // (`offCourseFrac`), which the strays price.
  const wind = windAt(state.params.seed, craft.alt);
  craft.vx += FLIGHT.wind.pullPerS * air * (wind - craft.vx) * dt;
  craft.vx -= craft.vx * a.lateralDragPerS * dt;
  craft.alt += craft.vy * dt;
  craft.x += craft.vx * dt;
  // The dial's own record — mph, not px/s, because the scorecard prints what
  // the dashboard said.
  state.topSpeed = Math.max(state.topSpeed, flightMph(state));

  // ── THE WARNING, ON THE EDGE ──────────────────────────────────────────────
  if (Math.abs(craft.tilt) > a.warnRad) {
    if (!state.warned) {
      state.warned = true;
      state.events.push({ type: "warning" });
    }
  } else if (Math.abs(craft.tilt) < a.warnRad * 0.7) {
    state.warned = false;
  }

  // ── THE TWO WAYS DOWN, AND THE ONE WAY OUT ────────────────────────────────
  if (Math.abs(craft.tilt) > a.flipRad) {
    wreckOut(state, FLIGHT_WRECKS.flipped);
    return;
  }
  if (craft.vy < -a.fallLimitPx) {
    wreckOut(state, FLIGHT_WRECKS.fell);
    return;
  }

  stepField(state, dt);
  collideAscent(state);
  if (state.outcome !== FLIGHT_OUTCOME.flying) return;

  if (craft.alt >= coursePx) {
    state.outcome = FLIGHT_OUTCOME.toOrbit;
    state.hullAtOrbit = Math.max(0, craft.hull);
    state.events.push({ type: "orbit" });
  }
}

/** One tick of the drop. */
function stepLanding(state: FlightState, dt: number, input: FlightInput): void {
  const l = FLIGHT.landing;
  const { craft } = state;
  const handsOff = flightHandsOff(state);
  const throttle = handsOff ? 0 : Math.min(1, Math.max(0, input.throttle));
  const steer = handsOff ? 0 : Math.min(1, Math.max(-1, input.steer));

  // A craft with no instability: tilt goes where the poofs put it and the
  // trim slowly walks it back upright — patience is the whole game down here.
  // The poof pushes the nose AWAY from the nozzle that fired (`FlightInput`),
  // which is the same sign the climb reads it with — one stick, one meaning,
  // all the way from the lawn to the regolith.
  craft.tiltVel += (-l.steerPerS * steer - l.tiltDampPerS * craft.tiltVel) * dt;
  craft.tilt += craft.tiltVel * dt;
  craft.tilt -= craft.tilt * 0.4 * dt;

  const thrust = l.mainPx * throttle;
  craft.vy += (thrust * Math.cos(craft.tilt) - l.gravityPx) * dt;
  craft.vx += thrust * Math.sin(craft.tilt) * dt;
  craft.alt += craft.vy * dt;
  craft.x += craft.vx * dt;
  if (craft.x < l.shipHalfW) {
    craft.x = l.shipHalfW;
    craft.vx = Math.max(0, craft.vx);
  } else if (craft.x > FLIGHT.fieldW - l.shipHalfW) {
    craft.x = FLIGHT.fieldW - l.shipHalfW;
    craft.vx = Math.min(0, craft.vx);
  }

  if (craft.alt > 0) return;

  // ── TOUCHDOWN, OR NOT ─────────────────────────────────────────────────────
  const impact = -craft.vy;
  craft.alt = 0;
  // HOW GOOD IT HAD TO BE is the rung's — one resolver, so the sim, the
  // auto-pilot's descent profile and the score's gentle bonus can never
  // disagree about what a legal touchdown is (`landingGates`).
  const gate = landingGates(state.params.difficulty);
  const safe =
    impact <= gate.vyPx &&
    Math.abs(craft.vx) <= gate.vxPx &&
    Math.abs(craft.tilt) <= gate.tiltRad;
  if (!safe) {
    wreckOut(state, FLIGHT_WRECKS.crashed);
    return;
  }
  craft.vy = 0;
  craft.vx = 0;
  craft.tiltVel = 0;
  state.touchdownVy = Math.max(0, impact);
  state.touchdownPad = Math.abs(craft.x - state.padX) <= l.padHalfW;
  state.outcome = FLIGHT_OUTCOME.landed;
  state.events.push({
    type: "touchdown",
    vy: state.touchdownVy,
    onPad: state.touchdownPad,
  });
}

/**
 * ONE TICK OF THE SKY.
 *
 * A finished flight still has a picture to show — a wrecked ship tumbles and
 * falls, a ship that made orbit keeps climbing out of frame, a landed module
 * sits on its legs — so the terminal outcomes keep integrating the craft while
 * the app holds the beat.
 */
export function stepFlight(
  state: FlightState,
  dtMs: number,
  input: FlightInput,
): void {
  const dt = dtMs / 1000;
  state.ms += dtMs;
  state.strikes.length = 0;
  state.events.length = 0;
  const { craft } = state;

  if (state.outcome !== FLIGHT_OUTCOME.flying) {
    state.outcomeMs += dtMs;
    // The chain the ending lit keeps going over the hold — most of what the
    // hold is for looking at.
    stepBlasts(state, dtMs);
    if (state.outcome === FLIGHT_OUTCOME.wrecked) {
      if (state.phase === "ascent") {
        // The wreck falls out of the sky the way it was always going to:
        // burning, turning over, planet winning.
        craft.vy -= gravityAt(craft.alt) * 0.6 * dt;
        craft.alt += craft.vy * dt;
        craft.x += craft.vx * dt;
        craft.tilt += craft.tiltVel * dt;
        stepField(state, dt);
      }
      // A crashed module just lies there, which is the whole point of it.
    } else if (state.outcome === FLIGHT_OUTCOME.toOrbit) {
      // THE ORBIT SEQUENCE (`FLIGHT.orbit`): the planet has let go, and the
      // hold is a little film the sim still integrates — SETTLE (lean and
      // climb worked off), FLOAT (adrift, the trip's first stillness), the
      // SEPARATION (the spent booster dropped, raised once), and the upper
      // stage lighting and pulling away.
      const seq = FLIGHT.orbit;
      craft.tilt -= craft.tilt * 3 * dt;
      craft.tiltVel -= craft.tiltVel * 3 * dt;
      if (state.outcomeMs < seq.settleMs + seq.floatMs) {
        craft.vy += (seq.floatVy - craft.vy) * 1.8 * dt;
        craft.vx -= craft.vx * 1.4 * dt;
      } else {
        if (!state.boosterAway) {
          state.boosterAway = true;
          state.events.push({
            type: "separation",
            x: craft.x,
            alt: craft.alt,
          });
        }
        craft.vy += seq.awayPx * dt;
      }
      craft.alt += craft.vy * dt;
      craft.x += craft.vx * dt;
      stepField(state, dt);
    }
    return;
  }

  if (!flightHandsOff(state)) state.clockMs += dtMs;
  if (state.phase === "ascent") stepAscent(state, dt, input);
  else stepLanding(state, dt, input);
  stepBlasts(state, dtMs);
}

export {
  FLIGHT,
  FLIGHT_OUTCOME,
  FLIGHT_WRECKS,
  airFrac,
  climbMph,
  downrangeMph,
  flightCoursePx,
  fuelMassMult,
  gravityAt,
  kphPx,
  offCourseFrac,
  windAt,
} from "./config.ts";
export type { FlightOutcome, FlightWreck } from "./config.ts";
export { blastHash, blastRoll, detonate } from "./blast.ts";
export {
  JUNK_KG,
  ORBIT_VARIANTS,
  PLANE_HULL_FRAC,
  bandFrac,
  junkKg,
  landingGates,
  planeHullFrac,
} from "./field.ts";
export {
  SKY_LAYERS,
  layerFrac,
  layerPerKPx,
  skyZoneLabel,
  type SkyBand,
  type SkyLayer,
} from "./layers.ts";
export { flightPar, flightScore, flightTripMs } from "./score.ts";
export type { FlightScorecard } from "./score.ts";
export { IDLE_FLIGHT_INPUT, SOFT_KINDS } from "./types.ts";
export {
  createFlightDriver,
  flightDriverInput,
  type FlightDriver,
} from "./driver.ts";
export type {
  FlightBlast,
  FlightCraft,
  FlightEvent,
  FlightInput,
  FlightLeg,
  FlightParams,
  FlightPhase,
  FlightState,
  FlightStrike,
  OrbitKind,
  OrbitObject,
} from "./types.ts";
