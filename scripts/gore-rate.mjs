#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// GORE RATE — what share of deaths come APART, measured over real simulated
// play rather than guessed at from a diorama.
//
// A body is cut in two or burst by how far past zero the killing blow drove it
// (`pwa/src/game/game-screen/overkill.ts` — QuakeWorld's `health < -40`, carried
// in the victim's own healthbars). That rule is deliberately NOT tuned to a
// target percentage: the rate is a readout of how far the hero's damage has
// outgrown the horde's health, so it should sit near nothing while the fight is
// even and climb toward everything once he is deleting the fodder. This script
// is how that claim is checked — it plays whole campaigns with the autopilot,
// replays every kill through the SHIPPED ladder (imported, never re-typed), and
// prints the rate per rung alongside the overkill distribution that produced it.
//
//   node scripts/gore-rate.mjs                        # easy → JESUS, every map
//   node scripts/gore-rate.mjs --difficulty easy      # one rung
//   node scripts/gore-rate.mjs --difficulty hard --level goodco_hq
//   node scripts/gore-rate.mjs --sweep                # candidate thresholds A/B
//
// THIS IS A LONG JOB, like every other tool here that plays the game rather than
// modelling it (see the `simulate-run` skill): the autopilot is stepped at 16 ms
// a tick through a real horde, so a single map's run is minutes of wall clock
// and the full sweep is a coffee break. `--minutes` caps the simulated time per
// map — a couple of minutes of a live fight is already thousands of kills, which
// is plenty for a rate — and `--level` narrows it to one venue.
//
// Read the SPREAD across the rungs, never the single campaign-wide average: a
// flat rate at every difficulty would mean the ladder had stopped tracking the
// power curve, which is the one way this rule can be wrong while still looking
// reasonable.

import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

register("./game-alias-loader.mjs", import.meta.url);

const { simulateCampaign } = await import(
  path.join(root, "engine/sim/simulate.ts")
);
const { DIFFICULTY_ORDER } = await import(
  path.join(root, "engine/game/defs/difficulties.ts")
);
// THE SHIPPED LADDER, imported rather than mirrored: a probe that carried its
// own copy of the thresholds would go on reporting the old rate after a tune.
const { CLEAVE_BARS, GIB_BARS, goreKind, overkillBars } = await import(
  path.join(root, "pwa/src/game/game-screen/overkill.ts")
);

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

const only = opt("difficulty");
const levelId = opt("level");
const seed = Number(opt("seed", "7"));
// A per-run wall. The default sim budget is 15 minutes of simulated play per
// map, which is a measurement of the AUTOPILOT's patience rather than of the
// gore ladder — a few minutes of a live fight is already thousands of kills.
const maxMinutes = Number(opt("minutes", "4"));
const rungs = only ? [only] : [...DIFFICULTY_ORDER];
const sweep = args.includes("--sweep");

/** Every kill of every run, as the ladder needs to judge it. */
const samples = [];

for (const difficulty of rungs) {
  process.stderr.write(`simulating ${difficulty}…\n`);
  simulateCampaign({
    difficulties: [difficulty],
    ...(levelId ? { levels: [levelId] } : {}),
    seed,
    maxMinutes,
    onKill: (s) => samples.push({ ...s }),
  });
}

if (samples.length === 0) {
  console.error("no kills recorded — nothing to measure");
  process.exit(1);
}

// ---- The report ------------------------------------------------------------------

/** A blow's outcome under a given ladder, with the shipped one as the default. */
function outcome(s, cleave = CLEAVE_BARS, gib = GIB_BARS) {
  const bars = overkillBars(s.damage, s.hpBefore, s.maxHp);
  if (cleave === CLEAVE_BARS && gib === GIB_BARS) {
    return { bars, kind: goreKind(bars, s.role, s.edged) };
  }
  // The sweep asks the same question of candidate numbers. The role cost and
  // the boss exemption are the ladder's, so route through it by rescaling the
  // measured overkill instead of restating either rule here.
  const scaled = { cleave: CLEAVE_BARS / cleave, gib: GIB_BARS / gib };
  return {
    bars,
    kind: goreKind(
      bars * (s.edged ? scaled.cleave : scaled.gib),
      s.role,
      s.edged,
    ),
  };
}

const pct = (n, of) => (of === 0 ? "  -  " : `${((100 * n) / of).toFixed(1)}%`);
const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);

function tally(rows, cleave, gib) {
  const t = { kills: 0, cleave: 0, gib: 0, apart: 0, barsSum: 0 };
  for (const s of rows) {
    const { bars, kind } = outcome(s, cleave, gib);
    t.kills++;
    t.barsSum += bars;
    if (kind === "cleave") t.cleave++;
    if (kind === "gib") t.gib++;
    if (kind) t.apart++;
  }
  return t;
}

const byRung = new Map();
for (const s of samples) {
  if (!byRung.has(s.difficulty)) byRung.set(s.difficulty, []);
  byRung.get(s.difficulty).push(s);
}

console.log(
  `\nGORE RATE — ${samples.length} kills, ladder: cleave ≥ ${CLEAVE_BARS} bars of overkill, gib ≥ ${GIB_BARS}\n`,
);
console.log(
  `${pad("RUNG", 11)}${padL("KILLS", 8)}${padL("CLEAVED", 10)}${padL("GIBBED", 10)}${padL("APART", 9)}${padL("MEAN OVERKILL", 15)}`,
);
for (const [rung, rows] of byRung) {
  const t = tally(rows);
  console.log(
    pad(rung, 11) +
      padL(t.kills, 8) +
      padL(pct(t.cleave, t.kills), 10) +
      padL(pct(t.gib, t.kills), 10) +
      padL(pct(t.apart, t.kills), 9) +
      padL(`${(t.barsSum / t.kills).toFixed(2)} bars`, 15),
  );
}
const all = tally(samples);
console.log(
  pad("ALL", 11) +
    padL(all.kills, 8) +
    padL(pct(all.cleave, all.kills), 10) +
    padL(pct(all.gib, all.kills), 10) +
    padL(pct(all.apart, all.kills), 9) +
    padL(`${(all.barsSum / all.kills).toFixed(2)} bars`, 15),
);

// WHERE THE OVERKILL ACTUALLY SITS. The rate above is one point on this curve,
// so a threshold that looks wrong is usually a distribution that moved.
console.log(`\nOVERKILL DISTRIBUTION (bars past zero, all kills)`);
const BUCKETS = [0, 0.1, 0.25, 0.4, 0.75, 1.5, 3, 10];
const counts = BUCKETS.map(() => 0);
for (const s of samples) {
  const bars = overkillBars(s.damage, s.hpBefore, s.maxHp);
  let i = 0;
  while (i + 1 < BUCKETS.length && bars >= BUCKETS[i + 1]) i++;
  counts[i]++;
}
for (let i = 0; i < BUCKETS.length; i++) {
  const hi = i + 1 < BUCKETS.length ? `< ${BUCKETS[i + 1]}` : "+";
  const share = (100 * counts[i]) / samples.length;
  console.log(
    `  ${padL(BUCKETS[i], 5)} ${pad(hi, 7)}${padL(counts[i], 8)}  ${padL(share.toFixed(1) + "%", 7)}  ${"#".repeat(Math.round(share / 2))}`,
  );
}

if (sweep) {
  console.log(`\nCANDIDATE LADDERS (share of all kills that come apart)`);
  console.log(
    `${pad("CLEAVE", 9)}${pad("GIB", 8)}${padL("CLEAVED", 10)}${padL("GIBBED", 10)}${padL("APART", 9)}`,
  );
  for (const [cleave, gib] of [
    [0.1, 0.2],
    [0.15, 0.3],
    [0.25, 0.4],
    [0.4, 0.75],
    [0.75, 1.5],
    [1.35, 2.2],
  ]) {
    const t = tally(samples, cleave, gib);
    console.log(
      pad(cleave, 9) +
        pad(gib, 8) +
        padL(pct(t.cleave, t.kills), 10) +
        padL(pct(t.gib, t.kills), 10) +
        padL(pct(t.apart, t.kills), 9),
    );
  }
}
console.log();
