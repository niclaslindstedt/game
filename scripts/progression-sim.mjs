#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// ANALYTIC PROGRESSION SIMULATOR CLI. A paper playthrough of the WHOLE game
// that uses the REAL engine rules for every kill (no renderer, no autopilot):
// it farms every mob a level can field — the horde, its elites, its rolled
// rare/unique visitors, and its boss — and tracks how XP, loot, and the
// hero's full stat block move, rung by rung, all the way to the level cap and
// on through JESUS to level 99. Snapshots the hero every N kills (default 25).
// The engine side is src/sim/analytic.ts.
//
//   node scripts/progression-sim.mjs                              # full game → L99
//   node scripts/progression-sim.mjs --difficulty easy --level spacez_hq
//   node scripts/progression-sim.mjs --stats strength=3,stamina=1 # a STR build
//   node scripts/progression-sim.mjs --batch 25 --full            # every checkpoint
//   node scripts/progression-sim.mjs --json out.json --html out.html
//
// The default writes a self-contained HTML graph (level, hp, damage, armor,
// crit over the run) next to a JSON dump; open the HTML in a browser.
//
// This is a CALIBRATION tool, not a playthrough: every kill lands cleanly
// (overkill efficiency 1 — the XP/loot ceiling) and mobs die in a fixed
// roster order, which is exactly what makes the numbers a stable balance
// read instead of a chaotic run.

import { writeFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

// The engine uses the @game/lib alias at runtime — map it before importing.
register("./game-alias-loader.mjs", import.meta.url);

const { simulateProgression } = await import(
  pathToFileURL(path.join(root, "src/sim/analytic.ts")).href
);
const { DIFFICULTY_ORDER } = await import(
  pathToFileURL(path.join(root, "src/game/defs/difficulties.ts")).href
);
const { LEVEL_ORDER } = await import(
  pathToFileURL(path.join(root, "src/game/defs/levels/index.ts")).href
);
const { STAT_NAMES } = await import(
  pathToFileURL(path.join(root, "src/game/defs/equipment.ts")).href
);
const { buildChartHtml } = await import(
  pathToFileURL(path.join(here, "progression-chart.mjs")).href
);
const { setAutoStatGainsEnabled } = await import(
  pathToFileURL(path.join(root, "src/game/leveling.ts")).href
);

// ---- Flags ---------------------------------------------------------------------

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const flag = (name) => argv.includes(`--${name}`);

if (flag("help")) {
  console.log(
    "usage: node scripts/progression-sim.mjs " +
      "[--difficulty all|easy[,medium,…]] [--level all|spacez_hq[,…]] " +
      "[--seed N] [--stats str=2,sta=1,dex=1] [--batch 25] " +
      "[--target-level 99] [--fresh] [--no-rares] [--auto] [--full] " +
      "[--json out.json] [--html out.html]",
  );
  process.exit(0);
}

const parseList = (value, all) =>
  !value || value === "all" ? [...all] : value.split(",").map((s) => s.trim());

const difficulties = parseList(opt("difficulty"), DIFFICULTY_ORDER);
const levels = parseList(opt("level"), LEVEL_ORDER);
const seed = Number(opt("seed", "1"));
const batchSize = Math.max(1, Number(opt("batch", "25")));
const targetLevel = Number(opt("target-level", "99"));
const carryLoadout = !flag("fresh");
const includeRares = !flag("no-rares");
const full = flag("full");
// The AUTO-STAT experimental feature (off in the shipped app, and now off by
// engine default). `--auto` turns it on so a run can be read in either regime —
// it drives `autoPowerScale`, which the mob-hp ramp and `heroDamageLevel` bar
// both ride, so toggling it is the cleanest way to see that mechanism's effect.
setAutoStatGainsEnabled(flag("auto"));

// --stats str=2,sta=1,dex=1 → { strength: 2, stamina: 1, dexterity: 1 }.
// Names match a stat by 3-letter prefix (STR/STA disambiguate at 3 chars).
function parseStatWeights(spec) {
  if (!spec) return undefined;
  const weights = {};
  for (const pair of spec.split(",")) {
    const [rawName, rawVal] = pair.split("=");
    const key = (rawName ?? "").trim().toLowerCase();
    const match = STAT_NAMES.find((s) => s.startsWith(key)) ?? null;
    if (!match) {
      console.error(
        `unknown stat "${rawName}" — expected one of ${STAT_NAMES.join(", ")}`,
      );
      process.exit(1);
    }
    weights[match] = Math.max(0, Number(rawVal ?? "1"));
  }
  return weights;
}
const statWeights = parseStatWeights(opt("stats"));

// ---- Run ------------------------------------------------------------------------

const startedAt = Date.now();
console.log(
  `Simulating ${difficulties.length} difficulty(ies) × ${levels.length} level(s)` +
    ` — seed=${seed} batch=${batchSize} target=L${targetLevel} carry=${carryLoadout}` +
    ` rares=${includeRares}` +
    (statWeights
      ? ` stats=${Object.entries(statWeights)
          .map(([k, v]) => `${k.slice(0, 3)}${v}`)
          .join(",")}`
      : " stats=default(str2,sta1,dex1)"),
);

const report = simulateProgression({
  difficulties,
  levels,
  seed,
  statWeights,
  batchSize,
  carryLoadout,
  targetLevel,
  includeRares,
});

// ---- Render — per-level-pass summary --------------------------------------------

const pad = (v, w) => String(v).padStart(w);
const padE = (v, w) => String(v).padEnd(w);
const pct = (x) => `${Math.round(x * 100)}%`;
const dropDigest = (byTier) =>
  Object.entries(byTier)
    .sort(([, a], [, b]) => b - a)
    .map(([t, n]) => `${t}×${n}`)
    .join(" ") || "(none)";

console.log("");
console.log(
  "PROGRESSION — one row per level pass (stats read at the pass's end)",
);
const header =
  padE("difficulty", 10) +
  padE("level", 12) +
  pad("v", 3) +
  pad("mobs", 6) +
  pad("hero", 9) +
  pad("maxHp", 7) +
  pad("perHit", 7) +
  pad("dps", 7) +
  pad("crit", 6) +
  pad("armor", 6) +
  pad("red", 5) +
  pad("cap", 5) +
  "  loot";
console.log(header);
console.log("-".repeat(header.length + 10));
for (const lr of report.levels) {
  const end = lr.checkpoints[lr.checkpoints.length - 1];
  console.log(
    padE(lr.difficulty, 10) +
      padE(lr.levelId, 12) +
      pad(lr.visit, 3) +
      pad(lr.mobsKilled, 6) +
      pad(`${lr.heroLevelStart}→${lr.heroLevelEnd}`, 9) +
      pad(end.maxHp, 7) +
      pad(end.perHit, 7) +
      pad(end.dps, 7) +
      pad(pct(end.critChance), 6) +
      pad(end.armor, 6) +
      pad(pct(end.armorReduction), 5) +
      pad(end.xpCap, 5) +
      `  ${dropDigest(lr.dropsByTier)}` +
      (lr.named.length ? ` · ${lr.named.join(", ")}` : ""),
  );
}

console.log("");
console.log(
  `Hero after the sweep: L${report.heroLevelEnd} — ${report.totalKills} kills across ` +
    `${report.levels.length} passes (target L${report.targetLevel} ` +
    `${report.reachedTarget ? "reached" : "NOT reached"}), ` +
    `${((Date.now() - startedAt) / 1000).toFixed(1)}s wall.`,
);

// ---- Render — the MOB & MENACE read (the balance instrument) ---------------------
// The horde the hero actually faces at each rung's end, the fight's shape
// (blows-to-kill, seconds-to-kill, blows-survived), and the sustained RAMPAGE
// (menace) stage the build settles at — the endgame's real score.
console.log("");
console.log(
  "MOB & MENACE — the horde the hero faces, the fight's shape, and the RAMPAGE stage it sustains",
);
const mmHeader =
  padE("difficulty", 10) +
  padE("level", 12) +
  pad("hero", 9) +
  pad("gear/dmg", 10) +
  pad("mobHp", 7) +
  pad("mobDmg", 7) +
  pad("blows", 6) +
  pad("ttk(s)", 7) +
  pad("survive", 8) +
  pad("okill×", 7) +
  pad("menace", 7);
console.log(mmHeader);
console.log("-".repeat(mmHeader.length + 2));
for (const lr of report.levels) {
  const end = lr.checkpoints[lr.checkpoints.length - 1];
  console.log(
    padE(lr.difficulty, 10) +
      padE(lr.levelId, 12) +
      pad(`${lr.heroLevelStart}→${lr.heroLevelEnd}`, 9) +
      pad(`${end.gearLevel}/${end.damageLevel}`, 10) +
      pad(end.mobHp, 7) +
      pad(end.mobDamage, 7) +
      pad(end.blowsToKill, 6) +
      pad(end.ttkSec, 7) +
      pad(end.hitsToDie, 8) +
      pad(`${end.overkillRatio}×`, 7) +
      pad(end.menaceStageEq, 7),
  );
}

// ---- Render — every checkpoint (the 25-kill batches) with --full ----------------

if (full) {
  const statHead = STAT_NAMES.map((s) =>
    pad(s.slice(0, 3).toUpperCase(), 4),
  ).join("");
  console.log("");
  console.log("CHECKPOINTS — the hero's full stat block every batch of kills");
  const cpHeader =
    padE("difficulty", 10) +
    padE("level", 12) +
    pad("kills", 6) +
    pad("hero", 5) +
    pad("hp", 6) +
    pad("perHit", 7) +
    pad("dps", 7) +
    pad("crit", 6) +
    pad("armor", 6) +
    pad("red", 5) +
    statHead +
    "  weapon";
  console.log(cpHeader);
  console.log("-".repeat(cpHeader.length + 12));
  for (const cp of report.checkpoints) {
    console.log(
      padE(cp.difficulty, 10) +
        padE(cp.levelId, 12) +
        pad(cp.killsInLevel, 6) +
        pad(cp.heroLevel, 5) +
        pad(cp.maxHp, 6) +
        pad(cp.perHit, 7) +
        pad(cp.dps, 7) +
        pad(pct(cp.critChance), 6) +
        pad(cp.armor, 6) +
        pad(pct(cp.armorReduction), 5) +
        STAT_NAMES.map((s) => pad(cp.stats[s], 4)).join("") +
        `  ${cp.weapon} (${cp.weaponTier})`,
    );
  }
}

// ---- Outputs — JSON + a self-contained HTML graph -------------------------------

const jsonPath = opt("json");
if (jsonPath) {
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log(`\nJSON report written to ${jsonPath}`);
}

// The headline deliverable is the picture of progression. Write it wherever
// --html points; on a bare run (no --html, no --json) drop it in the CWD so
// the graph always lands somewhere.
const htmlPath =
  opt("html") ??
  (jsonPath ? undefined : path.join(process.cwd(), "progression.html"));
if (htmlPath) {
  writeFileSync(htmlPath, buildChartHtml(report));
  console.log(`Graph written to ${htmlPath} — open it in a browser.`);
}
