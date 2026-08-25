#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// FLIGHT BENCH — what the sky between the lawn and the moon actually costs,
// measured by something that flies it.
//
// The drive has had this since the road got an auto-driver (`drive-bench.mjs`);
// the flight has had an auto-pilot for as long (`engine/game/rocket/driver.ts`)
// and nothing that pointed it at every rung and read the numbers back. So the
// ladder's four multipliers (`DifficultyDef.flight`) were authored blind: they
// LOOK like a ladder in the table and nothing had ever asked whether the rungs
// are far enough apart to be different games, or whether the top one is
// survivable at all.
//
// This plays the real sky with the shipped pilot over N seeds a rung and
// reports the five numbers that answer it:
//
//   ORBIT     what share of climbs punched out of the shell at all
//   CLIMB     how long one that did took
//   HULL      the skin it arrived in orbit with (1 = untouched)
//   HITS      how many satellites and rocks cost it some of that
//   TRASH     bags met — free, and the measure of how thick the shell is
//
// …and for the drop, which is a different game with different gates:
//
//   LANDED    what share of drops touched down inside the limits
//   ON PAD    …and of those, how many were on the marked pad
//   TOUCH     the vertical speed they met the regolith at
//
//   node scripts/flight-bench.mjs                     # every rung, 24 seeds
//   node scripts/flight-bench.mjs --seeds 200         # a real reading
//   node scripts/flight-bench.mjs --difficulty jesus  # one rung
//   node scripts/flight-bench.mjs --leg landing       # the drop on its own
//   node scripts/flight-bench.mjs --idle              # NOBODY at the stick
//
// `--idle` is the floor beside the pilot's column: the same sky with the
// controls untouched, which on an inverted pendulum is a flip every time. It is
// there to prove a rung's ORBIT share is the pilot's doing and not the sky
// being harmless.
//
// IT IS FAST. A climb is one ship and a few dozen bags, so two hundred flights
// a rung is a couple of seconds. Sweep freely.

import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

register("./game-alias-loader.mjs", import.meta.url);

const {
  FLIGHT,
  FLIGHT_OUTCOME,
  IDLE_FLIGHT_INPUT,
  beginDescent,
  createFlight,
  createFlightDriver,
  flightDriverInput,
  stepFlight,
} = await import(path.join(root, "engine/game/rocket/index.ts"));
const { DIFFICULTY_ORDER } = await import(
  path.join(root, "engine/game/defs/difficulties.ts")
);

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

const only = opt("difficulty");
const seeds = Number(opt("seeds", "24"));
const firstSeed = Number(opt("seed", "1"));
const leg = opt("leg", "trip");
const idle = args.includes("--idle");

if (leg !== "trip" && leg !== "landing") {
  console.error(`unknown leg "${leg}" (trip | landing)`);
  process.exit(2);
}
const rungs = only ? [only] : [...DIFFICULTY_ORDER];
for (const rung of rungs) {
  if (!DIFFICULTY_ORDER.includes(rung)) {
    console.error(`unknown difficulty "${rung}"`);
    process.exit(2);
  }
}

/** The engine's own fixed step — the screen's, so a bench flight and a played
 * flight are the same flight. */
const STEP_MS = 16;
/** A flight that never resolves is a bug rather than a slow pilot, so the
 * harness carries its own wall, generously past the longest honest climb. */
const CAP_MS = Number(opt("cap", "240000"));

/** Fly one sky to its end and hand back what it cost. */
function flyOne(difficulty, seed) {
  const params = {
    seed,
    difficulty,
    to: "moon",
    gib: true,
    dust: false,
    ...(leg === "landing" ? { leg: "landing" } : {}),
  };
  const state = createFlight(params);
  const driver = idle ? null : createFlightDriver();
  const run = () => {
    while (state.outcome === FLIGHT_OUTCOME.flying && state.ms < CAP_MS) {
      stepFlight(
        state,
        STEP_MS,
        driver ? flightDriverInput(driver, state) : IDLE_FLIGHT_INPUT,
      );
    }
  };
  run();
  const climb = {
    orbit: state.outcome === FLIGHT_OUTCOME.toOrbit,
    climbMs: state.clockMs,
    hull: state.hullAtOrbit || state.craft.hull,
    hits: state.hullHits,
    trash: state.trashCount,
  };
  // A whole TRIP is two halves and the second only exists once the first is
  // won. The hold between them is the screen's business, not the sky's — the
  // bench hands over the moment orbit is made, exactly as `endFlight` does.
  if (leg === "trip" && !climb.orbit) return { ...climb, dropped: false };
  if (leg === "trip") {
    beginDescent(state);
    run();
  }
  return {
    ...climb,
    dropped: true,
    landed: state.outcome === FLIGHT_OUTCOME.landed,
    onPad: state.touchdownPad,
    touchVy: state.touchdownVy,
  };
}

const mean = (xs) =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);
const share = (n, of) => (of === 0 ? "-" : `${n}/${of}`);

const who = idle ? "NOBODY at the stick" : "the shipped auto-pilot";
console.log(
  `\nFLIGHT BENCH — ${seeds} seed(s) a rung, ${
    leg === "landing" ? "the DROP alone" : "the whole TRIP"
  }, flown by ${who}\n`,
);
const climbCols =
  leg === "landing"
    ? ""
    : `${padL("ORBIT", 9)}${padL("CLIMB", 9)}${padL("HULL", 8)}` +
      `${padL("HITS", 7)}${padL("TRASH", 8)}`;
console.log(
  pad("RUNG", 10) +
    climbCols +
    padL("LANDED", 9) +
    padL("ON PAD", 9) +
    padL("TOUCH", 9),
);

for (const difficulty of rungs) {
  const flights = [];
  for (let i = 0; i < seeds; i++)
    flights.push(flyOne(difficulty, firstSeed + i));
  const made = flights.filter((f) => f.orbit);
  const dropped = flights.filter((f) => f.dropped);
  const down = dropped.filter((f) => f.landed);
  console.log(
    pad(difficulty, 10) +
      (leg === "landing"
        ? ""
        : padL(share(made.length, flights.length), 9) +
          padL(
            made.length
              ? `${mean(made.map((f) => f.climbMs / 1000)).toFixed(1)}s`
              : "-",
            9,
          ) +
          padL(
            made.length ? mean(made.map((f) => f.hull)).toFixed(2) : "-",
            8,
          ) +
          padL(mean(flights.map((f) => f.hits)).toFixed(1), 7) +
          padL(mean(flights.map((f) => f.trash)).toFixed(1), 8)) +
      padL(share(down.length, dropped.length), 9) +
      padL(share(down.filter((f) => f.onPad).length, down.length), 9) +
      padL(down.length ? mean(down.map((f) => f.touchVy)).toFixed(1) : "-", 9),
  );
}

console.log(
  `\nThe drop's gates: ${FLIGHT.landing.safeVyPx} px/s down, ` +
    `${FLIGHT.landing.safeVxPx} px/s across, ` +
    `${FLIGHT.landing.safeTiltRad.toFixed(2)} rad of lean.\n`,
);
