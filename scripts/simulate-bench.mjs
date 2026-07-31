#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// SIMULATION BENCHMARK — how fast does the headless simulator actually run?
//
// The campaign simulator is the balance team's inner loop: it is driven
// thousands of times a day, so its wall-clock cost is a first-class number.
// Timing `simulate-run.mjs` with `time` is far too noisy to optimize against
// (process start, catalog loading, and the report tables swamp a few hundred
// ms of engine work, and the container's own jitter is ±3s). This harness
// measures the ENGINE instead: it warms the JIT, replays the same fixed-seed
// levels in-process, and reports the BEST per-iteration CPU time plus the
// simulated-ticks-per-second throughput that a change should actually move.
// Best, not median: interference on a shared box only ever ADDS time, so the
// fastest sample is the closest read on the code's own cost — the median
// wandered several percent between runs of identical code, which is wider
// than most of the wins worth having. The median is printed beside it as a
// noise gauge: a big gap between the two says the box was busy, not that the
// code got slower.
//
//   node scripts/simulate-bench.mjs                    # the default suite
//   node scripts/simulate-bench.mjs --iterations 7     # more samples
//   node scripts/simulate-bench.mjs --json before.json # machine-readable
//   node scripts/simulate-bench.mjs --compare before.json
//
// Determinism is part of the measurement: every iteration must produce the
// identical report digest, and `--compare` fails loudly when a digest moved
// between two runs — an optimization that changes what the simulator reports
// is a behavior change, not a speedup.

import { readFileSync, writeFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

register("./game-alias-loader.mjs", import.meta.url);

const { runLevel } = await import(path.join(root, "src/sim/simulate.ts"));

// ---- The suite ---------------------------------------------------------------
// Three rungs of the same campaign: an early map with a low-level hero, a
// mid-campaign map, and a late one with a big horde and a full bag — so a
// change that only helps one horde size still shows up honestly.

const CASES = [
  { levelId: "goodco_hq", difficulty: "easy", maxMinutes: 4 },
  { levelId: "moon", difficulty: "hard", maxMinutes: 4 },
  { levelId: "boot_hill", difficulty: "nightmare", maxMinutes: 4 },
];

const args = process.argv.slice(2);
function flag(name, fallback) {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : args[at + 1];
}
const iterations = Number(flag("iterations", 7));
const warmups = Number(flag("warmups", 1));
const jsonOut = flag("json", null);
const compareTo = flag("compare", null);

/** A cheap digest of everything a run produced — the determinism guard. */
function digest(report) {
  const c = report.combat ?? {};
  return [
    report.outcome,
    report.kills,
    report.deaths,
    report.finalLevel,
    report.timeMs,
    Math.round(c.damageDealt ?? 0),
    Math.round(c.damageTaken ?? 0),
    report.drops?.length ?? 0,
  ].join("|");
}

/** Simulated ticks a report covers — the throughput denominator. */
function ticks(report, dtMs) {
  return Math.round((report.timeMs ?? 0) / dtMs);
}

const DT = 16;

function runCase(spec) {
  const { report } = runLevel({
    levelId: spec.levelId,
    difficulty: spec.difficulty,
    seed: 12345,
    dtMs: DT,
    maxMinutes: spec.maxMinutes,
    unstick: true,
  });
  return report;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const results = [];
let failed = false;

for (const spec of CASES) {
  const label = `${spec.difficulty} ${spec.levelId}`;
  for (let w = 0; w < warmups; w++) runCase(spec);

  const samples = [];
  const digests = new Set();
  let simTicks = 0;
  for (let i = 0; i < iterations; i++) {
    const start = process.cpuUsage();
    const report = runCase(spec);
    const spent = process.cpuUsage(start);
    samples.push((spent.user + spent.system) / 1000);
    digests.add(digest(report));
    simTicks = ticks(report, DT);
  }

  if (digests.size > 1) {
    console.error(`  ✗ ${label}: NON-DETERMINISTIC across iterations`);
    failed = true;
  }

  // The MINIMUM is the headline: on a shared box every sample carries some
  // unrelated interference, and interference only ever ADDS time — so the
  // fastest sample is the closest thing to the code's true cost, while the
  // median wanders by several percent between otherwise identical runs.
  const ms = Math.min(...samples);
  results.push({
    label,
    ms,
    median: median(samples),
    ticks: simTicks,
    tps: Math.round(simTicks / (ms / 1000)),
    digest: [...digests][0],
  });
}

const totalMs = results.reduce((sum, r) => sum + r.ms, 0);
const totalTicks = results.reduce((sum, r) => sum + r.ticks, 0);

console.log(
  `\nSIMULATION BENCHMARK — best of ${iterations} iterations (${warmups} warmup)\n`,
);
console.log(
  "case                          best    median     ticks     ticks/s",
);
console.log(
  "----------------------------------------------------------------------",
);
for (const r of results) {
  console.log(
    `${r.label.padEnd(26)} ${`${r.ms.toFixed(0)}ms`.padStart(8)} ${`${r.median.toFixed(0)}ms`.padStart(9)} ${String(r.ticks).padStart(9)} ${String(r.tps).padStart(11)}`,
  );
}
console.log(
  "----------------------------------------------------------------------",
);
console.log(
  `${"TOTAL".padEnd(26)} ${`${totalMs.toFixed(0)}ms`.padStart(8)} ${"".padStart(9)} ${String(totalTicks).padStart(9)} ${String(Math.round(totalTicks / (totalMs / 1000))).padStart(11)}`,
);

const payload = { totalMs, totalTicks, results };

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify(payload, null, 2));
  console.log(`\nwrote ${jsonOut}`);
}

if (compareTo) {
  const before = JSON.parse(readFileSync(compareTo, "utf8"));
  console.log(`\nCOMPARE vs ${compareTo}\n`);
  console.log("case                          before       after     change");
  console.log(
    "----------------------------------------------------------------",
  );
  for (const after of results) {
    const prior = before.results.find((r) => r.label === after.label);
    if (!prior) continue;
    const delta = ((after.ms - prior.ms) / prior.ms) * 100;
    console.log(
      `${after.label.padEnd(26)} ${`${prior.ms.toFixed(0)}ms`.padStart(9)} ${`${after.ms.toFixed(0)}ms`.padStart(11)} ${`${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`.padStart(10)}`,
    );
    if (prior.digest !== after.digest) {
      console.error(
        `  ✗ ${after.label}: report digest CHANGED (${prior.digest} → ${after.digest})`,
      );
      failed = true;
    }
  }
  const delta = ((totalMs - before.totalMs) / before.totalMs) * 100;
  console.log(
    "----------------------------------------------------------------",
  );
  console.log(
    `${"TOTAL".padEnd(26)} ${`${before.totalMs.toFixed(0)}ms`.padStart(9)} ${`${totalMs.toFixed(0)}ms`.padStart(11)} ${`${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`.padStart(10)}`,
  );
  const speedup = before.totalMs / totalMs;
  console.log(`\n${speedup.toFixed(2)}× ${speedup >= 1 ? "faster" : "SLOWER"}`);
}

if (failed) process.exitCode = 1;
