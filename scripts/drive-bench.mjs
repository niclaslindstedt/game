#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// DRIVE BENCH — what a minute of the road actually costs, measured by something
// that steers.
//
// The table in `DRIVE.coursePx`'s comment was measured by driving in a dead
// straight line at a fixed throttle, because until the drive had an auto-driver
// that was the only thing a script could do. It is the PESSIMAL case and it was
// always labelled as one, but a pessimal case is a floor rather than a reading:
// it cannot say whether the ladder's rungs are far enough apart, whether a leg
// is winnable on JESUS, or whether a tune to the crowd moved the trip time or
// only moved the body count. This plays the real road with the shipped
// auto-driver (`engine/game/drive/driver.ts`) over N seeds a rung and reports the
// four numbers that answer those:
//
//   ARRIVED   what share of legs got there at all (the rest broke down)
//   TRIP      how long an arriving leg took
//   BODIES    how many people it cost
//   WEAR      how much car was left at the end
//
//   node scripts/drive-bench.mjs                     # every rung, 24 seeds
//   node scripts/drive-bench.mjs --seeds 100         # a real reading
//   node scripts/drive-bench.mjs --difficulty jesus  # one rung
//   node scripts/drive-bench.mjs --home              # the leg back
//   node scripts/drive-bench.mjs --straight 0.8      # NOBODY steering, 80% pedal
//   node scripts/drive-bench.mjs --knob cruiseFrac=0.75,floorFrac=0.3
//   node scripts/drive-bench.mjs --lanes             # HOW BUSY EACH LANE LOOKS
//
// `--lanes` answers the one question about traffic that cannot be read off a
// density: how many other vehicles are actually IN THE PICTURE, per lane, at an
// average moment. `DRIVE.laneTraffic.gapPx` is authored against exactly this
// reading (one per lane on screen), and it is not a number that can be checked
// by looking at the constant — the spacing the player sees is the spawn pitch
// worked through the closing speed, which differs by a factor of eight between
// the hero's own side and the oncoming one.
//
// `--straight` is the old measurement, kept and driven by the same harness so
// the two columns can be compared without one of them being folklore. Note what
// its number MEANS: the pedal is a RATE rather than a speed to settle at
// (`applyCarPedal`), so `--straight 0.8` is a car that gathers speed at four
// fifths of the wagon's acceleration and then sits at the top end — not one that
// cruises at four fifths of it. Only `--straight 0` and a negative are cruises,
// and the auto-driver holds every other one bang-bang, as a person does.
//
// IT IS FAST, unlike the run simulator beside it: a drive is one car and a few
// dozen bodies, so a hundred legs a rung is a few seconds rather than a coffee
// break. Sweep freely.

import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

register("./game-alias-loader.mjs", import.meta.url);

const {
  cityStartPx,
  courseLength,
  createDrive,
  createDriveDriver,
  driveDriverInput,
  laneAt,
  stepDrive,
  vehicleDef,
  DRIVE,
  DRIVE_BOT_DEFAULTS,
  DRIVE_OUTCOME,
} = await import(path.join(root, "engine/game/drive/index.ts"));
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
const home = args.includes("--home");
const straight = args.includes("--straight")
  ? Number(opt("straight", "1"))
  : null;
const course = Number(opt("course", String(DRIVE.coursePx)));
// A leg that never ends is a bug rather than a slow driver, so the harness
// carries its own wall — generously past the slowest honest trip.
const capMs = Number(opt("cap", "180000"));

/** `--knob a=1,b=2` — a candidate tuning, probed without a rebuild. */
const knobs = {};
for (const pair of (opt("knob", "") || "").split(",").filter(Boolean)) {
  const [key, value] = pair.split("=");
  if (!(key in DRIVE_BOT_DEFAULTS)) {
    console.error(
      `unknown driver knob "${key}" (valid: ${Object.keys(DRIVE_BOT_DEFAULTS).join(", ")})`,
    );
    process.exit(2);
  }
  knobs[key] = Number(value);
}

const rungs = only ? [only] : [...DIFFICULTY_ORDER];
for (const rung of rungs) {
  if (!DIFFICULTY_ORDER.includes(rung)) {
    console.error(`unknown difficulty "${rung}"`);
    process.exit(2);
  }
}

/** The engine's own fixed step — the same one the screen ticks at, so a bench
 * leg and a played leg are the same leg. */
const STEP_MS = 16;

const lanes = args.includes("--lanes");
/**
 * WHAT THE PLAYER CAN SEE, in world px along the road: from a little behind the
 * bumper to the far edge of the frame.
 *
 * Taken off the shipped camera rather than picked — it holds the car in the
 * trailing quarter of a ~420 px frame and shows about 308 px past the nose
 * (`CAMERA_LEAD_FRAC`, pwa/src/game/drive-screen/render.ts). A vehicle inside
 * this band is one the player is looking at.
 */
const VIEW_AHEAD_PX = 308;
const VIEW_BEHIND_PX = 112;

/** Add this tick's in-shot vehicles to the per-lane tally. The footway's own
 * riders are left out: they are not in a lane, and `laneAt` clamps — so counted
 * they would be booked against whichever outside lane they are nearest and read
 * as traffic that is not there. */
function laneOccupancy(drive, into) {
  const dir = drive.params.direction;
  for (const other of drive.traffic) {
    if (vehicleDef(other.variant).pavement) continue;
    const ahead = (other.pos.x - drive.car.pos.x) * dir;
    if (ahead > VIEW_AHEAD_PX || ahead < -VIEW_BEHIND_PX) continue;
    into[laneAt(other.pos.y)] += 1;
  }
}

/** Play one whole leg and hand back what it cost. */
function driveOne(difficulty, seed) {
  const params = {
    seed,
    direction: home ? -1 : 1,
    to: home ? "garage" : "goodco_hq",
    difficulty,
    gib: true,
    split: true,
    ...(course === DRIVE.coursePx ? {} : { coursePx: course }),
  };
  const drive = createDrive(params);
  const driver = straight === null ? createDriveDriver(knobs) : null;
  const seen = new Array(DRIVE.laneCount).fill(0);
  let ticks = 0;
  while (drive.outcome === DRIVE_OUTCOME.driving && drive.ms < capMs) {
    const input = driver
      ? driveDriverInput(driver, drive)
      : { pedal: straight, wheel: 0 };
    stepDrive(drive, STEP_MS, input);
    // Only once the road is peopled — the OUTSKIRTS are deliberately empty (no
    // town, no crowd, no lane traffic at all) and averaging them in would report
    // a road a third quieter than the one the player spends the trip on.
    if (lanes && drive.distance > cityStartPx(drive.params)) {
      laneOccupancy(drive, seen);
      ticks += 1;
    }
  }
  return {
    lanes: seen.map((n) => (ticks === 0 ? 0 : n / ticks)),
    arrived: drive.outcome === DRIVE_OUTCOME.arrived,
    seconds: drive.ms / 1000,
    bodies: drive.bodies,
    shunts: drive.shunts,
    wear: drive.car.wear,
    topMph: (drive.topSpeed / DRIVE.topSpeedPx) * DRIVE.topSpeedMph,
    // How far a broken leg got, which is the only thing that separates a car
    // that died on the last corner from one that died at the first crossing.
    reached: drive.distance / courseLength(params),
  };
}

const mean = (xs) =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);

const who =
  straight === null
    ? "the auto-driver"
    : `a straight line at ${straight} throttle`;
const knobNote = Object.keys(knobs).length
  ? `, knobs ${Object.entries(knobs)
      .map(([k, v]) => `${k}=${v}`)
      .join(" ")}`
  : "";
console.log(
  `\nDRIVE BENCH — ${seeds} seed(s) a rung, ${home ? "the leg HOME" : "the leg OUT"}, ` +
    `${(course / 1000).toFixed(1)}k px of road, driven by ${who}${knobNote}\n`,
);
const laneCols = lanes
  ? [...Array(DRIVE.laneCount).keys()].map((i) => padL(`LANE ${i}`, 9)).join("")
  : "";
console.log(
  `${pad("RUNG", 10)}${padL("ARRIVED", 9)}${padL("TRIP", 9)}${padL("BODIES", 9)}` +
    `${padL("SHUNTS", 9)}${padL("END WEAR", 10)}${padL("TOP MPH", 9)}${padL("BROKE AT", 10)}` +
    laneCols,
);

for (const difficulty of rungs) {
  const legs = [];
  for (let i = 0; i < seeds; i++)
    legs.push(driveOne(difficulty, firstSeed + i));
  const arrived = legs.filter((l) => l.arrived);
  const broke = legs.filter((l) => !l.arrived);
  console.log(
    pad(difficulty, 10) +
      padL(`${arrived.length}/${legs.length}`, 9) +
      padL(
        arrived.length
          ? `${mean(arrived.map((l) => l.seconds)).toFixed(1)}s`
          : "-",
        9,
      ) +
      padL(mean(legs.map((l) => l.bodies)).toFixed(1), 9) +
      padL(mean(legs.map((l) => l.shunts)).toFixed(1), 9) +
      padL(
        arrived.length
          ? `${(100 * mean(arrived.map((l) => l.wear))).toFixed(0)}%`
          : "-",
        10,
      ) +
      padL(mean(legs.map((l) => l.topMph)).toFixed(0), 9) +
      padL(
        broke.length
          ? `${(100 * mean(broke.map((l) => l.reached))).toFixed(0)}%`
          : "-",
        10,
      ) +
      [...Array(lanes ? DRIVE.laneCount : 0).keys()]
        .map((i) => padL(mean(legs.map((l) => l.lanes[i])).toFixed(2), 9))
        .join(""),
  );
}

console.log(
  "\nARRIVED is the number that matters: a rung nobody finishes is a rung that\n" +
    "restarts the leg forever, and a rung everybody finishes on a clean car has\n" +
    "stopped being a rung. BODIES cannot reach zero by design — the crowd is\n" +
    "tuned so a good driver still arrives with a count (DRIVE.pedestriansPerKPx).\n",
);

if (lanes)
  console.log(
    "LANE n is how many other vehicles are IN SHOT in that lane at an average\n" +
      "moment, once the road is peopled. About 1.0 across all four is what\n" +
      "DRIVE.laneTraffic.gapPx is authored for: every lane occupied somewhere,\n" +
      "none of them shut. A lane near 0 is a lane the player never has to read;\n" +
      "much past 1.5 and there is no gap left to move into.\n",
  );
