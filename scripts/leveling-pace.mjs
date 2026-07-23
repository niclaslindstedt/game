#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// LEVELING-PACE GRAPH (see the `leveling-balance` skill): turns campaign
// simulator dumps into the per-level pacing read — how many MINUTES and KILLS
// each hero level actually took, per difficulty, against the authored
// kills-per-level curve (`content/leveling.yaml`, whose `~N kills` annotations
// are the in-play design target). Prints a console table and writes a
// self-contained HTML graph (two log-scale charts: minutes/level and
// kills/level, smoothed curves over the raw dings, the authored target as a
// grey dashed reference).
//
//   node scripts/simulate-run.mjs --difficulty medium --json medium.json
//   node scripts/leveling-pace.mjs medium.json [more.json …] --html pace.html
//
//   node scripts/leveling-pace.mjs --run            # run the standard battery
//                                                   # first (see BATTERY below)
//   node scripts/leveling-pace.mjs --run --no-arrow-xp   # pure kill grind
//
// Each dump is a single-campaign `simulate-run --json` report; several dumps
// for the same difficulty (a lane run + arrival samplers) merge, averaging
// levels both measured. Levels no run dinged inside are interpolated between
// measured neighbours and marked `~` (drawn dashed / listed in italics).
import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const htmlPath = opt("html", "leveling-pace.html");
const maxLevel = Number(opt("to", "75"));

// The STANDARD BATTERY (`--run`): the critical-path sweep that measured the
// shipped curve — a medium lane from L1, a nightmare farm from the ladder's
// L40 arrival, and two JESUS clear-chains (short per-map budgets keep the
// chains at clear-pace instead of dead farming). Dumps land in --out-dir
// (default a `leveling-pace-runs/` folder beside the html) and then feed the
// normal graph path. ~15–25 min wall; runs in parallel.
const BATTERY = (extra) => [
  ["--difficulty", "medium", "--max-minutes", "15", ...extra],
  [
    ...["--difficulty", "nightmare", "--start-level", "40"],
    ...["--farm", "--max-minutes", "45"],
    ...extra,
  ],
  [
    ...["--difficulty", "jesus", "--level", "moon", "--start-level", "58"],
    ...["--farm", "--rerun", "30", "--max-minutes", "8"],
    ...extra,
  ],
  [
    ...["--difficulty", "jesus", "--level", "moon", "--start-level", "65"],
    ...["--farm", "--rerun", "30", "--max-minutes", "8"],
    ...extra,
  ],
];

let files = args.filter((a) => !a.startsWith("--") && a.endsWith(".json"));
// Filter out values consumed by --opt value pairs.
files = files.filter((f) => {
  const idx = args.indexOf(f);
  return idx === 0 || !args[idx - 1]?.startsWith("--");
});

if (args.includes("--run")) {
  const outDir = opt(
    "out-dir",
    path.join(path.dirname(htmlPath) || ".", "leveling-pace-runs"),
  );
  mkdirSync(outDir, { recursive: true });
  const extra = args.includes("--no-arrow-xp") ? ["--no-arrow-xp"] : [];
  const battery = BATTERY(extra);
  console.log(
    `running the standard battery (${battery.length} sweeps) → ${outDir} …`,
  );
  const run = promisify(execFile);
  await Promise.all(
    battery.map(async (sweep, i) => {
      const dump = path.join(outDir, `battery-${i + 1}.json`);
      await run(
        process.execPath,
        [path.join(here, "simulate-run.mjs"), ...sweep, "--json", dump],
        { maxBuffer: 64 * 1024 * 1024 },
      );
      console.log(
        `  sweep ${i + 1}/${battery.length} done (${sweep.join(" ")})`,
      );
      files.push(dump);
    }),
  );
}

if (!files.length) {
  console.error(
    "usage: node scripts/leveling-pace.mjs <simulate-run --json dump>… " +
      "[--html out.html] [--to L] | --run [--no-arrow-xp] [--out-dir dir]",
  );
  process.exit(1);
}

// ---- Per-level rows from a campaign report --------------------------------
// Dings carry campaign-cumulative time and kills; consecutive dings diff into
// "the minutes/kills spent inside level L".
const rowsFromReport = (report) => {
  let tOff = 0;
  let kOff = 0;
  const dings = [];
  for (const run of report.runs) {
    for (const lu of run.levelUps)
      dings.push({
        level: lu.level,
        atMin: (tOff + lu.atMs) / 60000,
        atKills: kOff + lu.kills,
      });
    tOff += run.timeMs;
    kOff += run.combat.kills;
  }
  dings.sort((a, b) => a.level - b.level);
  const rows = [];
  let prev = {
    level: report.runs[0]?.hero.levelStart ?? 1,
    atMin: 0,
    atKills: 0,
  };
  for (const d of dings) {
    if (d.level <= prev.level) continue;
    // A ding that skipped levels spreads its cost evenly over the gap.
    const span = d.level - prev.level;
    for (let i = 1; i <= span; i++)
      rows.push({
        to: prev.level + i,
        minutes: (d.atMin - prev.atMin) / span,
        kills: (d.atKills - prev.atKills) / span,
      });
    prev = d;
  }
  return rows;
};

// ---- Load + merge ---------------------------------------------------------
const byDiff = new Map(); // difficulty -> Map(to -> rows[])
for (const f of files) {
  const report = JSON.parse(readFileSync(f, "utf8"));
  if (!Array.isArray(report.runs)) {
    console.error(`${f}: not a single-campaign simulate-run dump — skipped`);
    continue;
  }
  const diff = report.runs[0]?.difficulty;
  if (!diff) continue;
  if (!byDiff.has(diff)) byDiff.set(diff, new Map());
  const acc = byDiff.get(diff);
  for (const r of rowsFromReport(report)) {
    if (!acc.has(r.to)) acc.set(r.to, []);
    acc.get(r.to).push(r);
  }
}

const DIFF_ORDER = ["easy", "medium", "hard", "nightmare", "jesus"];
const series = {}; // diff -> [{x, minutes, kills, interp}]
for (const diff of DIFF_ORDER) {
  const acc = byDiff.get(diff);
  if (!acc) continue;
  const pts = [...acc.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([to, rs]) => ({
      x: to,
      minutes: +(rs.reduce((s, r) => s + r.minutes, 0) / rs.length).toFixed(2),
      kills: Math.round(rs.reduce((s, r) => s + r.kills, 0) / rs.length),
      interp: false,
    }))
    .filter((p) => p.x <= maxLevel);
  // Interpolate single holes between measured neighbours, marked `interp`.
  for (let i = pts.length - 1; i > 0; i--) {
    const a = pts[i - 1];
    const b = pts[i];
    for (let g = b.x - a.x - 1; g >= 1; g--) {
      const t = g / (b.x - a.x);
      pts.splice(i, 0, {
        x: a.x + g,
        minutes: +(a.minutes + t * (b.minutes - a.minutes)).toFixed(2),
        kills: Math.round(a.kills + t * (b.kills - a.kills)),
        interp: true,
      });
    }
  }
  if (pts.length) series[diff] = pts;
}

if (!Object.keys(series).length) {
  console.error("no level-up data found in the given dumps");
  process.exit(1);
}

// The authored target: the yaml rows' `~N kills` annotations — the IN-PLAY
// design curve on the critical path (the raw XP behind each row embeds the
// measured band factor: level-diff premiums, elite/arrow drip, tier steps —
// so xp ÷ referenceMobXp is NOT the annotation; read the comments).
const annotated = {};
const yaml = readFileSync(path.join(root, "content/leveling.yaml"), "utf8");
for (const m of yaml.matchAll(/^\s+(\d+):\s*\d+\s*#\s*~(\d+) kills/gm))
  annotated[Number(m[1])] = Number(m[2]);

// ---- Console table --------------------------------------------------------
for (const [diff, pts] of Object.entries(series)) {
  console.log(`\n=== ${diff.toUpperCase()} ===`);
  console.log("  to-level  minutes  kills  target");
  for (const p of pts)
    console.log(
      `  ${String(p.x - 1).padStart(2)}->${String(p.x).padEnd(3)}` +
        `${String(p.minutes).padStart(8)}${String(p.kills).padStart(7)}` +
        `${p.interp ? "~" : " "}  ~${annotated[p.x - 1] ?? "?"}`,
    );
  const measured = pts.filter((p) => !p.interp);
  const ratio =
    measured.reduce((s, p) => s + p.kills / (annotated[p.x - 1] || 1), 0) /
    Math.max(1, measured.length);
  console.log(`  measured/target kills ratio: ${ratio.toFixed(2)}×`);
}

// ---- HTML graph -----------------------------------------------------------
const smooth = (pts, key) =>
  pts.map((p) => {
    let num = 0;
    let den = 0;
    for (const q of pts) {
      if (Math.abs(q.x - p.x) > 3) continue;
      const w = Math.exp(-((q.x - p.x) ** 2) / (2 * 1.2 * 1.2));
      num += w * q[key];
      den += w;
    }
    return { x: p.x, y: num / den, interp: p.interp };
  });

const payload = {
  series,
  smoothed: Object.fromEntries(
    Object.entries(series).map(([d, pts]) => [
      d,
      { minutes: smooth(pts, "minutes"), kills: smooth(pts, "kills") },
    ]),
  ),
  annotated,
  maxLevel,
};

writeFileSync(
  htmlPath,
  readFileSync(path.join(here, "leveling-pace-template.html"), "utf8").replace(
    "/*__DATA__*/",
    `const DATA = ${JSON.stringify(payload)};`,
  ),
);
console.log(`\nwrote ${htmlPath}`);
