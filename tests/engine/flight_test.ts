// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE FLIGHT — the rocket minigame's sim (engine/game/rocket/).
//
// The SHAPE is the feature, not the figures: the assertions are about the
// relationships the design must keep — the ship never tends upright, the
// throttle feeds the flip, the poofs can always catch what attention can, the
// shell has a top and nothing floats above it, a blast moves what is near it —
// so a tuning pass over `FLIGHT` is free and a pass that breaks the design
// fails.
//
// An ENGINE suite: a flight has no level and no catalog under it at all.

import { describe, expect, it } from "vitest";

import {
  FLIGHT,
  FLIGHT_OUTCOME,
  FLIGHT_WRECKS,
  IDLE_FLIGHT_INPUT,
  bandFrac,
  beginDescent,
  createFlight,
  detonate,
  flightCoursePx,
  flightHandsOff,
  flightPar,
  flightScore,
  flightShellClear,
  restartFlight,
  stepFlight,
  type FlightInput,
  type FlightParams,
  type FlightState,
  type OrbitObject,
} from "../../engine/game/rocket/index.ts";

const PARAMS: FlightParams = {
  seed: 4242,
  difficulty: "medium",
  to: "moon",
};

const STEP = 16;

/** Step the sim `n` ticks under one input (or a per-tick chooser). */
function fly(
  state: FlightState,
  n: number,
  input: FlightInput | ((state: FlightState) => FlightInput),
): void {
  for (let i = 0; i < n; i++) {
    stepFlight(state, STEP, typeof input === "function" ? input(state) : input);
  }
}

/** Run out the opening hold so the controls are live. */
function handOver(state: FlightState): void {
  fly(
    state,
    Math.ceil(FLIGHT.opening.handsOffMs / STEP) + 1,
    IDLE_FLIGHT_INPUT,
  );
}

/**
 * A COMPETENT THUMB — the proportional pilot the completion tests fly with:
 * full boost, steering against the lean and its rate. Deliberately simple; if
 * this cannot hold the ship, no player can.
 */
function pilot(state: FlightState): FlightInput {
  const { craft } = state;
  return {
    throttle: 1,
    steer: Math.max(-1, Math.min(1, craft.tilt * 6 + craft.tiltVel * 2)),
  };
}

/** Plant a thing in the ship's path — the collision tests' whole staging. */
function plant(
  state: FlightState,
  kind: OrbitObject["kind"],
  dx = 0,
  dAlt = 0,
): OrbitObject {
  const o: OrbitObject = {
    id: state.nextId++,
    kind,
    variant: 0,
    x: state.craft.x + dx,
    alt: state.craft.alt + dAlt,
    vx: 0,
    vy: 0,
    angle: 0,
    spin: 0,
    r: 6,
  };
  state.field.push(o);
  return o;
}

describe("the opening hold", () => {
  it("flies itself, climbing, until the hand-over", () => {
    const flight = createFlight(PARAMS);
    expect(flightHandsOff(flight)).toBe(true);
    const alt0 = flight.craft.alt;
    fly(flight, 40, { throttle: 1, steer: 1 });
    // Input ignored, ship climbing, lean held near flat by the trim.
    expect(flight.craft.alt).toBeGreaterThan(alt0);
    expect(Math.abs(flight.craft.tilt)).toBeLessThan(0.2);
    handOver(flight);
    expect(flightHandsOff(flight)).toBe(false);
  });

  it("keeps the clock off until the controls are live", () => {
    const flight = createFlight(PARAMS);
    fly(flight, 10, IDLE_FLIGHT_INPUT);
    expect(flight.clockMs).toBe(0);
    handOver(flight);
    fly(flight, 10, IDLE_FLIGHT_INPUT);
    expect(flight.clockMs).toBeGreaterThan(0);
  });
});

describe("the inverted pendulum", () => {
  it("never tends upright: an untouched ship leans further and further", () => {
    const flight = createFlight(PARAMS);
    handOver(flight);
    const lean0 = Math.abs(flight.craft.tilt);
    fly(flight, 90, IDLE_FLIGHT_INPUT);
    expect(Math.abs(flight.craft.tilt)).toBeGreaterThan(lean0);
  });

  it("flips and explodes if nobody catches it", () => {
    const flight = createFlight(PARAMS);
    handOver(flight);
    fly(flight, 1500, IDLE_FLIGHT_INPUT);
    expect(flight.outcome).toBe(FLIGHT_OUTCOME.wrecked);
    expect(flight.wreck).toBe(FLIGHT_WRECKS.flipped);
  });

  it("raises the tilt warning before the flip, once per excursion", () => {
    const flight = createFlight(PARAMS);
    handOver(flight);
    let warnings = 0;
    let warnedBeforeWreck = false;
    for (let i = 0; i < 1500 && flight.outcome === FLIGHT_OUTCOME.flying; i++) {
      stepFlight(flight, STEP, IDLE_FLIGHT_INPUT);
      if (flight.events.some((e) => e.type === "warning")) {
        warnings++;
        warnedBeforeWreck = true;
      }
    }
    expect(warnedBeforeWreck).toBe(true);
    expect(warnings).toBe(1);
  });

  it("the poofs out-muscle the instability: a caught lean at the warning line comes back", () => {
    const flight = createFlight(PARAMS);
    handOver(flight);
    flight.craft.tilt = FLIGHT.ascent.warnRad;
    flight.craft.tiltVel = 0;
    // Steer against the lean while there is one — a thumb, not a jammed stick.
    fly(flight, 120, (f) => ({
      throttle: 0,
      steer: Math.max(-1, Math.min(1, f.craft.tilt * 6 + f.craft.tiltVel * 2)),
    }));
    expect(Math.abs(flight.craft.tilt)).toBeLessThan(FLIGHT.ascent.warnRad / 2);
    expect(flight.outcome).toBe(FLIGHT_OUTCOME.flying);
  });

  it("…and a stick jammed hard over is its own flip", () => {
    const flight = createFlight(PARAMS);
    handOver(flight);
    fly(flight, 400, { throttle: 0, steer: 1 });
    expect(flight.outcome).toBe(FLIGHT_OUTCOME.wrecked);
    expect(flight.wreck).toBe(FLIGHT_WRECKS.flipped);
  });

  it("the throttle feeds the flip: the same neglect diverges faster under boost", () => {
    const coast = createFlight(PARAMS);
    const boost = createFlight(PARAMS);
    for (const f of [coast, boost]) {
      handOver(f);
      f.craft.tilt = 0.2;
      f.craft.tiltVel = 0;
    }
    fly(coast, 60, { throttle: 0, steer: 0 });
    fly(boost, 60, { throttle: 1, steer: 0 });
    expect(Math.abs(boost.craft.tilt)).toBeGreaterThan(
      Math.abs(coast.craft.tilt),
    );
  });

  it("a lean steers the climb sideways", () => {
    const flight = createFlight(PARAMS);
    handOver(flight);
    flight.craft.tilt = 0.3;
    const x0 = flight.craft.x;
    fly(flight, 30, { throttle: 1, steer: 0 });
    expect(flight.craft.x).toBeGreaterThan(x0);
  });
});

describe("the shell", () => {
  it("thickens with altitude and ends at the top", () => {
    const course = flightCoursePx(PARAMS);
    const low = bandFrac(FLIGHT.field.startAltPx, course);
    const high = bandFrac(course * FLIGHT.field.shellTopFrac * 0.98, course);
    expect(high).toBeGreaterThan(low);
    expect(bandFrac(course * FLIGHT.field.shellTopFrac, course)).toBe(0);
    expect(bandFrac(course, course)).toBe(0);
  });

  it("lays nothing above the shell's top, ever", () => {
    const flight = createFlight(PARAMS);
    const shellTop = flightCoursePx(PARAMS) * FLIGHT.field.shellTopFrac;
    let worst = 0;
    for (
      let i = 0;
      i < 20000 && flight.outcome === FLIGHT_OUTCOME.flying;
      i++
    ) {
      stepFlight(flight, STEP, pilot(flight));
      for (const o of flight.field) worst = Math.max(worst, o.alt);
    }
    // Spawned below the line; drift can carry a piece a whisker over it, never
    // a shelf of it.
    expect(worst).toBeLessThan(shellTop + 120);
  });

  it("clearing it is the finish: clear first, orbit after", () => {
    const flight = createFlight(PARAMS);
    let clearedAt = 0;
    for (
      let i = 0;
      i < 20000 && flight.outcome === FLIGHT_OUTCOME.flying;
      i++
    ) {
      stepFlight(flight, STEP, pilot(flight));
      if (clearedAt === 0 && flightShellClear(flight)) clearedAt = flight.ms;
    }
    expect(flight.outcome).toBe(FLIGHT_OUTCOME.toOrbit);
    expect(clearedAt).toBeGreaterThan(0);
    expect(clearedAt).toBeLessThan(flight.ms);
    expect(flight.events.length === 0 || flight.outcome === "toOrbit").toBe(
      true,
    );
    expect(flight.topSpeed).toBeGreaterThan(0);
    expect(flight.hullAtOrbit).toBeGreaterThan(0);
  });
});

describe("what the sky costs", () => {
  it("junk sticks: handling, not hull", () => {
    const flight = createFlight(PARAMS);
    handOver(flight);
    plant(flight, "junk", 2, 4);
    stepFlight(flight, STEP, IDLE_FLIGHT_INPUT);
    expect(flight.trash.length).toBe(1);
    expect(flight.trashCount).toBe(1);
    expect(flight.craft.hull).toBe(1);
    expect(flight.events.some((e) => e.type === "stuck")).toBe(true);
  });

  it("a trashy ship answers the poofs like a barge", () => {
    const clean = createFlight(PARAMS);
    const dirty = createFlight(PARAMS);
    for (const f of [clean, dirty]) {
      handOver(f);
      f.craft.tilt = 0.4;
      f.craft.tiltVel = 0;
    }
    for (let i = 0; i < 10; i++) {
      dirty.trash.push({
        id: 900 + i,
        variant: 0,
        along: 0,
        across: 8,
        angle: 0,
      });
    }
    fly(clean, 30, { throttle: 0, steer: 1 });
    fly(dirty, 30, { throttle: 0, steer: 1 });
    expect(Math.abs(dirty.craft.tilt)).toBeGreaterThan(
      Math.abs(clean.craft.tilt),
    );
  });

  it("a satellite holes the hull and goes up in its own blast", () => {
    const flight = createFlight(PARAMS);
    handOver(flight);
    plant(flight, "satellite", 3, 0);
    stepFlight(flight, STEP, IDLE_FLIGHT_INPUT);
    expect(flight.craft.hull).toBeLessThan(1);
    expect(flight.hullHits).toBe(1);
    expect(flight.events.some((e) => e.type === "strike")).toBe(true);
    expect(flight.events.some((e) => e.type === "explosion")).toBe(true);
    expect(flight.blasts.length).toBeGreaterThan(0);
  });

  it("enough hull gone is the end of the ship", () => {
    const flight = createFlight(PARAMS);
    handOver(flight);
    flight.craft.hull = 0.05;
    plant(flight, "satellite", 3, 0);
    stepFlight(flight, STEP, IDLE_FLIGHT_INPUT);
    expect(flight.outcome).toBe(FLIGHT_OUTCOME.wrecked);
    expect(flight.wreck).toBe(FLIGHT_WRECKS.holed);
  });
});

describe("the blasts", () => {
  it("shove what is near and leave what is far", () => {
    const flight = createFlight(PARAMS);
    handOver(flight);
    const cfg = FLIGHT.blast.big;
    const near = plant(flight, "junk", cfg.coreR + 20, 0);
    const far = plant(flight, "junk", cfg.pushR + 500, 0);
    detonate(flight, flight.craft.x, flight.craft.alt, "big");
    fly(flight, Math.ceil(cfg.maxMs / STEP), IDLE_FLIGHT_INPUT);
    expect(Math.abs(near.vx)).toBeGreaterThan(0);
    expect(far.vx).toBe(0);
  });

  it("take apart what is inside the core", () => {
    const flight = createFlight(PARAMS);
    handOver(flight);
    // Outside the hull's own reach (it would stick), inside the blast's core.
    plant(flight, "junk", 30, 0);
    detonate(flight, flight.craft.x, flight.craft.alt, "big");
    let burst = false;
    for (let i = 0; i < 20; i++) {
      stepFlight(flight, STEP, IDLE_FLIGHT_INPUT);
      if (flight.strikes.some((s) => s.kind === "junk")) burst = true;
    }
    expect(burst).toBe(true);
  });

  it("chain: a satellite caught in a blast goes up itself, later", () => {
    const flight = createFlight(PARAMS);
    handOver(flight);
    plant(flight, "satellite", FLIGHT.blast.big.coreR - 10, 0);
    detonate(flight, flight.craft.x, flight.craft.alt, "big");
    let explosions = 0;
    let lastAtMs = 0;
    let firstAtMs = 0;
    for (let i = 0; i < 200; i++) {
      stepFlight(flight, STEP, IDLE_FLIGHT_INPUT);
      for (const e of flight.events) {
        if (e.type === "explosion") {
          explosions++;
          if (firstAtMs === 0) firstAtMs = flight.ms;
          lastAtMs = flight.ms;
        }
      }
    }
    // The wreck's own blast plus the chained satellite — and the chain lands
    // on a fuse, not in the same frame.
    expect(explosions).toBeGreaterThanOrEqual(1);
    expect(lastAtMs).toBeGreaterThan(firstAtMs);
  });

  it("every explosion carries its own look", () => {
    const flight = createFlight(PARAMS);
    handOver(flight);
    detonate(flight, 100, flight.craft.alt, "small");
    detonate(flight, 300, flight.craft.alt, "small");
    const seeds = flight.events
      .filter((e) => e.type === "explosion")
      .map((e) => (e.type === "explosion" ? e.seed : 0));
    expect(seeds.length).toBe(2);
    expect(seeds[0]).not.toBe(seeds[1]);
  });
});

describe("the landing", () => {
  function drop(state: FlightState): void {
    beginDescent(state);
    fly(
      state,
      Math.ceil(FLIGHT.opening.landingHandsOffMs / STEP) + 1,
      IDLE_FLIGHT_INPUT,
    );
  }

  /** A patient thumb: aim the lean at the drift, feather the fall. */
  function landerPilot(state: FlightState): FlightInput {
    const { craft } = state;
    const wantVy = -Math.min(
      FLIGHT.landing.safeVyPx * 0.5,
      8 + craft.alt * 0.1,
    );
    // Lean INTO the drift so the burn cancels it, then hold upright for the
    // last stretch.
    const wantTilt =
      craft.alt > 60 ? Math.max(-0.3, Math.min(0.3, -craft.vx * 0.02)) : 0;
    return {
      throttle: craft.vy < wantVy ? 1 : 0,
      steer: Math.max(
        -1,
        Math.min(1, (wantTilt - craft.tilt) * 4 - craft.tiltVel * 1.5),
      ),
    };
  }

  it("a module nobody catches meets the moon too hard", () => {
    const flight = createFlight(PARAMS);
    drop(flight);
    fly(flight, 4000, IDLE_FLIGHT_INPUT);
    expect(flight.outcome).toBe(FLIGHT_OUTCOME.wrecked);
    expect(flight.wreck).toBe(FLIGHT_WRECKS.crashed);
    expect(flight.events.length === 0).toBe(true);
  });

  it("a patient burn puts it down intact", () => {
    const flight = createFlight(PARAMS);
    drop(flight);
    for (
      let i = 0;
      i < 20000 && flight.outcome === FLIGHT_OUTCOME.flying;
      i++
    ) {
      stepFlight(flight, STEP, landerPilot(flight));
    }
    expect(flight.outcome).toBe(FLIGHT_OUTCOME.landed);
    expect(flight.touchdownVy).toBeLessThanOrEqual(FLIGHT.landing.safeVyPx);
  });

  it("the drop has no field to hit", () => {
    const flight = createFlight(PARAMS);
    drop(flight);
    fly(flight, 200, landerPilot(flight));
    expect(flight.field.length).toBe(0);
  });
});

describe("restarts", () => {
  it("a wrecked climb restarts the whole trip, clock included", () => {
    const flight = createFlight(PARAMS);
    handOver(flight);
    fly(flight, 2000, IDLE_FLIGHT_INPUT);
    expect(flight.outcome).toBe(FLIGHT_OUTCOME.wrecked);
    const again = restartFlight(flight);
    expect(again.phase).toBe("ascent");
    expect(again.clockMs).toBe(0);
    expect(again.outcome).toBe(FLIGHT_OUTCOME.flying);
  });

  it("a crashed drop restarts the drop alone and keeps the trip", () => {
    const flight = createFlight(PARAMS);
    flight.clockMs = 45_000;
    flight.trashCount = 7;
    flight.topSpeed = 500;
    flight.hullAtOrbit = 0.6;
    beginDescent(flight);
    const pad = flight.padX;
    fly(flight, 4000, IDLE_FLIGHT_INPUT);
    expect(flight.outcome).toBe(FLIGHT_OUTCOME.wrecked);
    const again = restartFlight(flight);
    expect(again.phase).toBe("landing");
    // The clock keeps the crashed attempt's seconds — a drop you broke a
    // module on is a slower trip.
    expect(again.clockMs).toBe(flight.clockMs);
    expect(again.clockMs).toBeGreaterThanOrEqual(45_000);
    expect(again.trashCount).toBe(7);
    expect(again.hullAtOrbit).toBe(0.6);
    // The same ground: the pad has not moved between attempts.
    expect(again.padX).toBe(pad);
    expect(again.outcome).toBe(FLIGHT_OUTCOME.flying);
  });
});

describe("determinism", () => {
  it("one seed is one sky", () => {
    const a = createFlight(PARAMS);
    const b = createFlight(PARAMS);
    fly(a, 900, pilot);
    fly(b, 900, pilot);
    expect(a.craft).toEqual(b.craft);
    expect(a.field).toEqual(b.field);
    expect(a.field.length).toBeGreaterThan(0);
    expect(a.trashCount).toBe(b.trashCount);
  });

  it("two seeds are two skies", () => {
    const a = createFlight(PARAMS);
    const b = createFlight({ ...PARAMS, seed: 7 });
    fly(a, 900, pilot);
    fly(b, 900, pilot);
    expect(a.field.length).toBeGreaterThan(0);
    expect(a.field).not.toEqual(b.field);
  });
});

describe("the scorecard", () => {
  function landedState(over?: Partial<FlightState>): FlightState {
    const flight = createFlight(PARAMS);
    Object.assign(flight, {
      phase: "landing",
      outcome: FLIGHT_OUTCOME.landed,
      clockMs: 60_000,
      topSpeed: 500,
      hullAtOrbit: 1,
      touchdownVy: 10,
      touchdownPad: true,
      trashCount: 0,
      ...over,
    });
    return flight;
  }

  it("pays for arriving, hurrying, speed, skin and a soft touch", () => {
    const card = flightScore(landedState());
    expect(card.arrival).toBeGreaterThan(0);
    expect(card.time).toBeGreaterThan(0);
    expect(card.speed).toBeGreaterThan(0);
    expect(card.hull).toBeGreaterThan(0);
    expect(card.touchdown).toBeGreaterThan(0);
    expect(card.score).toBeGreaterThan(0);
  });

  it("quicker is worth more, and a slow trip's time bonus is zero", () => {
    const quick = flightScore(landedState({ clockMs: 40_000 }));
    const slow = flightScore(
      landedState({ clockMs: flightPar(PARAMS) + 60_000 }),
    );
    expect(quick.score).toBeGreaterThan(slow.score);
    expect(slow.time).toBe(0);
  });

  it("a holed ship is worth less, and a feather beats the legal limit", () => {
    const whole = flightScore(landedState());
    const holed = flightScore(landedState({ hullAtOrbit: 0.3 }));
    expect(holed.hull).toBeLessThan(whole.hull);
    const feather = flightScore(landedState({ touchdownVy: 1 }));
    const firm = flightScore(
      landedState({ touchdownVy: FLIGHT.landing.safeVyPx }),
    );
    expect(feather.touchdown).toBeGreaterThan(firm.touchdown);
  });

  it("prints the trash and pays nothing for it", () => {
    const clean = flightScore(landedState());
    const filthy = flightScore(landedState({ trashCount: 12 }));
    expect(filthy.trash).toBe(12);
    expect(filthy.score).toBe(clean.score);
  });

  it("rounds like a cabinet", () => {
    const card = flightScore(landedState({ clockMs: 61_234 }));
    expect(card.score % FLIGHT.score.round).toBe(0);
  });
});
