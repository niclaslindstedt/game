#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// CAMPAIGN SIMULATOR CLI (see the `simulate-run` skill): runs the REAL engine
// headlessly — createGame, step, the autopilot, auto-equip, loadout carry —
// through levels and whole campaigns (easy → JESUS across every map) and
// prints extensive balance reporting: hero level/hp/dps progression, damage
// per hit dealt and taken, per-mob hp / monster level / contact damage /
// blows-to-kill / kill counts, every drop, the weapons the auto-equip
// stepped through, deaths, and the XP the per-map caps withheld. The engine
// side is src/sim/simulate.ts; this front-end parses flags (see
// simulate-run/flags.mjs), dispatches the campaigns, and renders the tables
// (simulate-run/reports.mjs).
//
//   node scripts/simulate-run.mjs                            # full campaign, easy → JESUS
//   node scripts/simulate-run.mjs --difficulty easy          # one rung
//   node scripts/simulate-run.mjs --difficulty easy --level spacez_hq
//   node scripts/simulate-run.mjs --rerun 3                  # replay each map ×3 (XP-cap probe)
//   node scripts/simulate-run.mjs --strategy kite --seed 42
//   node scripts/simulate-run.mjs --full                     # per-run mob/drop detail
//   node scripts/simulate-run.mjs --json report.json         # machine-readable dump
//
// This is a CALIBRATION tool by default: the hero cannot die. A defeat
// revives the hero at the spawn with everything kept, books the death as a
// pressure gauge, and the measurement marches on — so pacing, loot, and
// damage-exchange reads are never capped by the autopilot's survival skill.
// Every death also lands in the DEATH ledger with its cause and coordinates
// (the DEATHS table below, drawable on the map). --mortal flips to the
// survival read (a death restarts the level), and --max-deaths N aborts a
// run that keeps dying (outcome `dead`) — the "too hard HERE, go fix it"
// signal.

import { writeFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseFlags } from "./simulate-run/flags.mjs";
import {
  pad,
  padE,
  renderDeathAreas,
  renderMenace,
  renderSingleCampaign,
  renderStuckAreas,
} from "./simulate-run/reports.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

// The engine uses the @game/lib alias at runtime — map it before importing.
register("./game-alias-loader.mjs", import.meta.url);

const { simulateCampaign } = await import(
  path.join(root, "src/sim/simulate.ts")
);
const { synthesizeArrival } = await import(
  path.join(root, "src/sim/arrival.ts")
);
const { DIFFICULTY_ORDER } = await import(
  path.join(root, "src/game/defs/difficulties.ts")
);
const { LEVEL_ORDER, levelDef } = await import(
  path.join(root, "src/game/defs/levels/index.ts")
);
const { BALANCE_TUNING_DEFAULTS } = await import(
  path.join(root, "src/game/tuning.ts")
);
const { BOT_STRATEGIES, BOT_PROFILES, BOT_POSTURES } = await import(
  path.join(root, "src/game/bot/index.ts")
);
const { STAT_BUILDS, metaLane } = await import(
  path.join(root, "src/game/builds.ts")
);

// ---- Flags ---------------------------------------------------------------------

// The whole flag surface — parsing, --help, validation, and the resolved run
// configuration — lives in simulate-run/flags.mjs; the engine catalogs it
// validates against are threaded in (they can only be imported after the
// alias register above).
const {
  difficulties,
  levels,
  rerun,
  seed,
  strategies,
  profiles,
  combos,
  maxMinutes,
  carryLoadout,
  full,
  verdict,
  balance,
  comparePath,
  jsonPath,
  realisticPacing,
  autoShop,
  gearTier,
  stuckLimit,
  mortal,
  maxDeaths,
  view,
  startLevelDefaulted,
  startLoadoutFor,
} = parseFlags(process.argv.slice(2), {
  synthesizeArrival,
  DIFFICULTY_ORDER,
  LEVEL_ORDER,
  levelDef,
  BALANCE_TUNING_DEFAULTS,
  BOT_STRATEGIES,
  BOT_PROFILES,
  BOT_POSTURES,
  STAT_BUILDS,
  metaLane,
});

// ---- Run ------------------------------------------------------------------------

const startedAt = Date.now();
const balanceLabel = balance
  ? Object.entries(balance)
      .map(([k, v]) => `${k}=${v}×`)
      .join(" ")
  : "shipped 1×";

const campaignOptions = (strategy, profile) => ({
  difficulties,
  levels,
  seed,
  strategy,
  profile,
  maxMinutes,
  carryLoadout,
  balance,
  realisticPacing,
  autoShop,
  mortal,
  maxDeaths,
  startLoadout: startLoadoutFor(profile),
  stuckLimit,
  view,
});

// MATRIX MODE: more than one spec (strategy × profile) → run a campaign per
// combo and compare them side by side, then exit. A single spec falls through
// to the detailed single-campaign render below (unchanged).
if (combos.length > 1) {
  console.log(
    `Simulating a MATRIX of ${combos.length} specs ` +
      `(${strategies.length} strategy × ${profiles.length} class) — ` +
      `${difficulties.length} difficulty(ies) × ${levels.length} level(s) each, ` +
      `seed=${seed} maxMinutes=${maxMinutes} · balance: ${balanceLabel}`,
  );
  const matrix = combos.map(({ strategy, profile }) => ({
    strategy,
    profile,
    report: simulateCampaign(campaignOptions(strategy, profile)),
  }));

  // Per-run rows, tagged with their spec — the full grid.
  console.log("");
  console.log("MATRIX — one row per run, grouped by spec");
  const mh =
    padE("strategy", 10) +
    padE("class", 9) +
    padE("difficulty", 11) +
    padE("level", 13) +
    padE("outcome", 9) +
    pad("hero", 8) +
    pad("deaths", 7) +
    pad("kills", 7) +
    pad("k/min", 7) +
    pad("dpsOut", 8) +
    "  weapon";
  console.log(mh);
  console.log("-".repeat(mh.length + 18));
  for (const { strategy, profile, report } of matrix) {
    for (const run of report.runs) {
      console.log(
        padE(strategy, 10) +
          padE(profile, 9) +
          padE(run.difficulty, 11) +
          padE(run.levelId, 13) +
          padE(run.outcome, 9) +
          pad(`${run.hero.levelStart}→${run.hero.levelEnd}`, 8) +
          pad(run.deaths, 7) +
          pad(run.combat.kills, 7) +
          pad(run.combat.killsPerMinute, 7) +
          pad(run.combat.dpsOut, 8) +
          `  ${run.hero.weapon.name} (${run.hero.weapon.dps} dps)`,
      );
    }
  }

  // One aggregate row per spec — the head-to-head read.
  console.log("");
  console.log("SPEC TOTALS — aggregate per spec (all runs summed)");
  const sh =
    padE("strategy", 10) +
    padE("class", 9) +
    pad("kills", 7) +
    pad("deaths", 7) +
    pad("avgDps", 8) +
    pad("finalL", 8) +
    pad("finalHp", 8) +
    "  finalWeapon";
  console.log(sh);
  console.log("-".repeat(sh.length + 12));
  for (const { strategy, profile, report } of matrix) {
    const avgDps = (
      report.runs.reduce((s, r) => s + r.combat.dpsOut, 0) /
      Math.max(1, report.runs.length)
    ).toFixed(1);
    console.log(
      padE(strategy, 10) +
        padE(profile, 9) +
        pad(report.totalKills, 7) +
        pad(report.totalDeaths, 7) +
        pad(avgDps, 8) +
        pad(report.finalLevel, 8) +
        pad(report.finalMaxHp, 8) +
        `  ${report.finalWeapon}`,
    );
  }
  renderStuckAreas(
    matrix.flatMap(({ strategy, profile, report }) =>
      report.runs.map((run) => ({ tag: `${strategy}/${profile} `, run })),
    ),
  );
  renderMenace(
    matrix.flatMap(({ strategy, profile, report }) =>
      report.runs.map((run) => ({ tag: `${strategy}/${profile} `, run })),
    ),
  );
  renderDeathAreas(
    matrix.flatMap(({ strategy, profile, report }) =>
      report.runs.map((run) => ({ tag: `${strategy}/${profile} `, run })),
    ),
  );

  console.log("");
  console.log(
    `Matrix done in ${((Date.now() - startedAt) / 1000).toFixed(1)}s wall.`,
  );
  if (jsonPath) {
    writeFileSync(jsonPath, JSON.stringify(matrix, null, 2));
    console.log(`Wrote ${jsonPath}`);
  }
  process.exit(0);
}

const { strategy, profile } = combos[0];
const startLoadout = startLoadoutFor(profile);
console.log(
  `Simulating ${difficulties.length} difficulty(ies) × ${levels.length} level run(s)` +
    ` — strategy=${strategy} class=${profile} seed=${seed} maxMinutes=${maxMinutes}` +
    ` carry=${carryLoadout}${rerun > 1 ? ` rerun=${rerun}` : ""}` +
    ` view=${view ? `${view.width}x${view.height}` : "off"} · balance: ${balanceLabel}` +
    (realisticPacing
      ? " · pacing: clear to the map's level & move on (realistic)"
      : " · pacing: FARM to the cap (endgame / L99 chase — over-levels on purpose)") +
    (autoShop
      ? " · shopping: ON (merchant recovery)"
      : " · shopping: OFF (--no-shop, bot never shops)") +
    (mortal
      ? ` · MORTAL: a death restarts the level${maxDeaths > 0 ? `, abort at ${maxDeaths} deaths` : ""}`
      : maxDeaths > 0
        ? ` · immortal, abort at ${maxDeaths} deaths`
        : "") +
    (startLoadout
      ? ` · arrival: L${startLoadout.level}${
          startLevelDefaulted ? " (ladder default)" : ""
        } ${gearTier}-geared (${startLoadout.equipment.weapon.defId})`
      : ""),
);

const report = simulateCampaign(campaignOptions(strategy, profile));

// The whole post-run report — the summary and analysis tables plus the opt-in
// --verdict/--compare/--full blocks — renders in simulate-run/reports.mjs.
renderSingleCampaign(report, {
  autoShop,
  startedAt,
  verdict,
  comparePath,
  full,
});

if (jsonPath) {
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log(`\nFull report written to ${jsonPath}`);
}
