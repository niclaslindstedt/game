#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// AoE TARGET CALIBRATION CLI — measures how many targets a melee cone actually
// reaches, as a function of its angle, by arming the REAL autopilot with probe
// weapons of varying `sweepDeg` and recording the uncapped in-cone count on
// every swing (see src/sim/aoe-calibration.ts). It answers the question the
// damage-budget model guesses at (config `WEAPON.assumedTargets`, cone 4 /
// full 5): "given X degrees of cone, how many foes does one swing hit?"
//
//   node scripts/aoe-calibration.mjs                       # default sweep
//   node scripts/aoe-calibration.mjs --degs 40,90,120,180  # custom angles
//   node scripts/aoe-calibration.mjs --levels spacez_hq,moon --difficulty medium
//   node scripts/aoe-calibration.mjs --minutes 4 --seeds 1,2,3,4
//   node scripts/aoe-calibration.mjs --json out.json
//
// Density tracks real play (the bot clears at a normal rate), so the numbers
// are what to price weapons against — not a frozen best-case crowd.

import { writeFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

register("./game-alias-loader.mjs", import.meta.url);

const { calibrateAoe, calibrateRangedAoe, calibrateMeleeReach } = await import(
  path.join(root, "src/sim/aoe-calibration.ts")
);

// ---- flag parsing --------------------------------------------------------------
const args = process.argv.slice(2);
const opts = {};
let jsonOut = null;
let ranged = false;
let reach = false;
let reachRanges = null;
const nums = (s) =>
  s
    .split(",")
    .map((x) => Number(x.trim()))
    .filter((n) => !Number.isNaN(n));
const list = (s) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  const next = () => args[++i];
  switch (a) {
    case "--degs":
    case "--sweep":
      opts.probeDegs = nums(next());
      break;
    case "--seeds":
      opts.seeds = nums(next());
      break;
    case "--levels":
    case "--level":
      opts.levels = list(next());
      break;
    case "--difficulty":
    case "--difficulties":
      opts.difficulties = list(next());
      break;
    case "--damage":
      opts.probeDamage = Number(next());
      break;
    case "--range":
      opts.probeRange = Number(next());
      break;
    case "--minutes":
    case "--max-minutes":
      opts.maxMinutes = Number(next());
      break;
    case "--bucket":
      opts.bucketDeg = Number(next());
      break;
    case "--json":
      jsonOut = next();
      break;
    case "--ranged":
      ranged = true;
      break;
    case "--reach":
      reach = true;
      break;
    case "--ranges":
      reachRanges = nums(next());
      break;
    case "--help":
    case "-h":
      console.log(
        "usage: aoe-calibration [--degs a,b,c] [--levels ids] [--difficulty rungs] [--seeds ns] [--minutes n] [--bucket deg] [--json out]",
      );
      process.exit(0);
      break;
    default:
      console.error(`unknown flag: ${a}`);
      process.exit(1);
  }
}

// ---- REACH mode (arc × reach grid) ---------------------------------------------
if (reach) {
  const started = Date.now();
  const gOpts = {};
  if (opts.probeDegs) gOpts.degs = opts.probeDegs;
  if (reachRanges) gOpts.ranges = reachRanges;
  if (opts.seeds) gOpts.seeds = opts.seeds;
  if (opts.levels) gOpts.levels = opts.levels;
  if (opts.difficulties) gOpts.difficulties = opts.difficulties;
  if (opts.maxMinutes) gOpts.maxMinutes = opts.maxMinutes;
  if (opts.probeDamage) gOpts.probeDamage = opts.probeDamage;
  const rep = calibrateMeleeReach(gOpts);
  const wall = ((Date.now() - started) / 1000).toFixed(1);
  const o = rep.options;
  console.log(
    `MELEE REACH CALIBRATION — probe dmg ${o.probeDamage} · ${o.levels.join(",")} × ${o.difficulties.join(",")} × seeds ${o.seeds.join(",")} · ${o.maxMinutes} min/run · ${rep.totalSwings} swings · ${wall}s wall`,
  );
  console.log(
    "\nUNCAPPED targets per swing across the (cone° × reach px) grid — reach is the dominant lever (swept area ∝ reach²):\n",
  );
  const rpad = (s, n) => String(s).padStart(n);
  // Matrix: rows = arc, cols = reach.
  console.log("  arc\\reach  " + o.ranges.map((r) => rpad(r, 8)).join(""));
  console.log("  " + "-".repeat(11 + o.ranges.length * 8));
  for (const deg of o.degs) {
    const cols = o.ranges.map((r) => {
      const c = rep.cells.find((x) => x.deg === deg && x.range === r);
      return rpad(c ? c.meanTargets.toFixed(2) : "—", 8);
    });
    console.log("  " + rpad(deg + "°", 9) + "  " + cols.join(""));
  }
  console.log(
    "\nBy swept area (½·arc·reach²) — the model var; targets ≈ 1 + gain·(1 − e^(−area/scale)):\n",
  );
  console.log("  arc°  reach   sweptArea   meanTgt   medTgt   crowd");
  console.log("  " + "-".repeat(52));
  for (const c of [...rep.cells].sort((a, b) => a.sweptArea - b.sweptArea)) {
    console.log(
      "  " +
        rpad(c.deg, 4) +
        rpad(c.range, 7) +
        rpad(c.sweptArea.toFixed(0), 12) +
        rpad(c.meanTargets.toFixed(2), 10) +
        rpad(c.medianTargets, 9) +
        rpad(c.meanCrowd.toFixed(2), 8),
    );
  }
  if (jsonOut) {
    writeFileSync(jsonOut, JSON.stringify(rep, null, 2));
    console.log(`\nwrote ${jsonOut}`);
  }
  process.exit(0);
}

// ---- RANGED mode ---------------------------------------------------------------
if (ranged) {
  const started = Date.now();
  // Melee-only knobs (--degs/--bucket/--range/--damage) don't apply; pass the
  // shared ones through.
  const rOpts = {};
  if (opts.seeds) rOpts.seeds = opts.seeds;
  if (opts.levels) rOpts.levels = opts.levels;
  if (opts.difficulties) rOpts.difficulties = opts.difficulties;
  if (opts.maxMinutes) rOpts.maxMinutes = opts.maxMinutes;
  const rep = calibrateRangedAoe(rOpts);
  const wall = ((Date.now() - started) / 1000).toFixed(1);
  const o = rep.options;
  console.log(
    `RANGED AoE CALIBRATION — probe dmg ${o.probeDamage}, range ${o.probeRange}px, spread ${o.spreadDeg}° · ${o.levels.join(",")} × ${o.difficulties.join(",")} × seeds ${o.seeds.join(",")} · ${o.maxMinutes} min/run · ${rep.totalVolleys} volleys · ${wall}s wall`,
  );
  console.log(
    "\nThe budget credits a spread its `count`, a pierce `1+pierce`, a chain `1+chain·frac`. The DISTINCT foes one connecting trigger pull actually reaches:\n",
  );
  const rpad = (s, n) => String(s).padStart(n);
  console.log(
    "  probe      assumed   volleys   meanFoes   medFoes   realized%",
  );
  console.log("  " + "-".repeat(60));
  for (const p of rep.probes) {
    const realized =
      p.assumed > 0 ? ((p.meanFoes / p.assumed) * 100).toFixed(0) : "—";
    console.log(
      "  " +
        String(p.label).padEnd(10) +
        rpad(p.assumed, 8) +
        rpad(p.volleys, 10) +
        rpad(p.meanFoes.toFixed(2), 11) +
        rpad(p.medianFoes, 10) +
        rpad(realized + "%", 11),
    );
  }
  console.log(
    "\nReading it: meanFoes is the distinct foes a CONNECTING volley hit. realized% = meanFoes ÷ the budget's assumed credit — under 100% means the shape over-delivers on paper (a spread's pellets overlap on one body in the open field); pierce/chain that stay near their credit are the RELIABLE ranged AoE.",
  );
  if (jsonOut) {
    writeFileSync(jsonOut, JSON.stringify(rep, null, 2));
    console.log(`\nwrote ${jsonOut}`);
  }
  process.exit(0);
}

// ---- run -----------------------------------------------------------------------
const started = Date.now();
const report = calibrateAoe(opts);
const wall = ((Date.now() - started) / 1000).toFixed(1);

const o = report.options;
console.log(
  `AoE CALIBRATION — probe dmg ${o.probeDamage}, range ${o.probeRange}px · ${o.levels.join(",")} × ${o.difficulties.join(",")} × seeds ${o.seeds.join(",")} · ${o.maxMinutes} min/run · ${report.totalSwings} swings · ${wall}s wall`,
);
console.log(
  "\nThe budget model (config WEAPON.assumedTargets) prices a cone at 4 targets, a full sweep at 5. The measured reality per probe angle:\n",
);

// ---- per-probe table -----------------------------------------------------------
const pad = (s, n) => String(s).padStart(n);
console.log("  rawDeg  effArc°  swings   meanTgt  medTgt   crowd   caught%");
console.log("  " + "-".repeat(58));
for (const p of report.probes) {
  const caught =
    p.meanCrowd > 0 ? ((p.meanTargets / p.meanCrowd) * 100).toFixed(0) : "  0";
  console.log(
    "  " +
      pad(p.deg, 6) +
      pad(p.meanEffArcDeg, 9) +
      pad(p.swings, 8) +
      pad(p.meanTargets.toFixed(2), 10) +
      pad(p.medianTargets, 8) +
      pad(p.meanCrowd.toFixed(2), 8) +
      pad(caught + "%", 9),
  );
}

// ---- arc-bucket table ----------------------------------------------------------
console.log("\nBy EFFECTIVE arc (INT widening folded in), bucketed:\n");
console.log("  arc°band   swings   meanTgt   crowd");
console.log("  " + "-".repeat(40));
for (const b of report.buckets) {
  if (b.swings < 5) continue; // skip thin buckets (noisy)
  console.log(
    "  " +
      pad(`${b.arcLoDeg}-${b.arcHiDeg}`, 9) +
      pad(b.swings, 9) +
      pad(b.meanTargets.toFixed(2), 10) +
      pad(b.meanCrowd.toFixed(2), 8),
  );
}

console.log(
  "\nReading it: meanTgt is the UNCAPPED foes in the cone per swing (realized = min(that, maxMeleeTargets(INT) = 2+INT)). caught% is the share of the in-reach crowd the cone swept — a pure-geometry read that should climb with the angle.",
);

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify(report, null, 2));
  console.log(`\nwrote ${jsonOut}`);
}
