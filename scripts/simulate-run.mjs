#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// oss-spec:allow-large-file: CLI report layer over the simulator — one cohesive flag surface and report format
// CAMPAIGN SIMULATOR CLI (see the `simulate-run` skill): runs the REAL engine
// headlessly — createGame, step, the autopilot, auto-equip, loadout carry —
// through levels and whole campaigns (easy → JESUS across every map) and
// prints extensive balance reporting: hero level/hp/dps progression, damage
// per hit dealt and taken, per-mob hp / monster level / contact damage /
// blows-to-kill / kill counts, every drop, the weapons the auto-equip
// stepped through, deaths, and the XP the per-map caps withheld. The engine
// side is src/sim/simulate.ts; this front-end parses flags and renders
// tables.
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

import { readFileSync, writeFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const flag = (name) => args.includes(`--${name}`);

if (flag("help")) {
  console.log(
    "usage: node scripts/simulate-run.mjs [--difficulty all|easy[,medium,…]] " +
      "[--level all|spacez_hq[,…]] [--rerun N] [--seed N] " +
      "[--strategy all|aggro,balanced,flee|survivor|rush|kite|boss] " +
      "[--class all|melee,ranged,magic,balanced|auto] " +
      "[--max-minutes N] [--fresh] [--full] [--verdict] [--farm] [--no-shop] " +
      "[--start-level N] [--gear-tier regular|magic|rare|legendary] " +
      "[--stuck-limit N] [--view WxH|off] [--mortal] [--max-deaths N] " +
      "[--balance xpGain=0.8,mobHp=1.5] [--compare baseline.json] [--json out.json]\n\n" +
      "camera (--view WxH, default 422x195 — the horizontal-phone baseline in world px):\n" +
      "                 every run watches through a real camera rect (player-centred,\n" +
      "                 clamped to the level) stamped into the input each tick, so the\n" +
      "                 view-aware rules — enemy targeting, spawner summon-in, the bot's\n" +
      "                 wall-end sense — run exactly as on a device screen. Override with\n" +
      "                 e.g. --view 195x422 (portrait phone) or --view off (no camera,\n" +
      "                 the legacy blind-headless read).\n\n" +
      "stuck cancellation (--stuck-limit N, default 20; 0 = off): every no-progress\n" +
      "                 moment (a wedge on geometry, or loitering in one small patch without\n" +
      "                 landing damage) books a penalty at the bot's coordinates — repeats in\n" +
      "                 the same area weigh double. A run whose penalty reaches the limit is\n" +
      "                 CANCELLED (outcome `stuck`) and the STUCK AREAS table prints the\n" +
      "                 clustered coordinates plus a ready map-layout --highlight command, so\n" +
      "                 the failure spots can be SEEN on the map and iterated on.\n\n" +
      "mortality (--mortal, --max-deaths N): the hero is IMMORTAL by default (a death\n" +
      "                 revives him in place — the calibration read); every death is still\n" +
      "                 booked with its CAUSE (killer defId / hazard) and WORLD COORDINATES,\n" +
      "                 printed in the DEATHS table with a ready map-layout command. --mortal\n" +
      "                 makes a death START THE LEVEL OVER (fresh map, new attempt seed, the\n" +
      "                 walk-in loadout) — the survival read. --max-deaths N aborts a run\n" +
      "                 (outcome `dead`) once it books N deaths (default 10 under --mortal,\n" +
      "                 0 = never otherwise): if the bot keeps dying at the same place to the\n" +
      "                 same cause, the spot is too hard — stop measuring and go fix it.\n\n" +
      "specs (--strategy × --class): STRATEGY is the positioning posture — `aggro` (close\n" +
      "                 and hold tight, tolerate a denser ring), `balanced`/`survivor` (the\n" +
      "                 adaptive edge-hug), `flee` (hold far, disengage early). CLASS is the\n" +
      "                 stat-distribution build — how the hero spends level-up points, which\n" +
      "                 through the stat-aware auto-equip also picks the weapon and gear:\n" +
      "                 `melee`/`ranged`/`magic` focus a weapon lane, `balanced` spreads across\n" +
      "                 every stat, `auto` = the emergent lane. (`--profile` is the historical\n" +
      "                 alias for --class.) Either flag takes a comma list or `all` (class `all`\n" +
      "                 = melee,ranged,magic,balanced); more than one spec runs a MATRIX (one\n" +
      "                 campaign per strategy×class) and compares — the read for whether one\n" +
      "                 build is overpowered, and where each is strongest.\n\n" +
      "arrival (--start-level N): drop a REALISTIC leveled + geared hero into the first swept\n" +
      "                 rung instead of a fresh level-1 rookie — the campaign's intended entry\n" +
      "                 state, since the game scales to hero level. e.g. `--difficulty jesus\n" +
      "                 --start-level 50` measures a nightmare-geared L50 hero on JESUS. Pair\n" +
      "                 with --gear-tier (default rare) to set the rolled kit's tier. On\n" +
      "                 NIGHTMARE and JESUS --start-level DEFAULTS to the first swept level's\n" +
      "                 ladder hero level (nightmare ~40+; those rungs are never played from\n" +
      "                 L1) — pass --start-level 1 to force a fresh rookie there anyway.\n\n" +
      "shopping (DEFAULT on): a weapon-starved hero is walked to the merchant to sell →\n" +
      "                 repair → buy → equip, the way a real player recovers a broken weapon.\n" +
      "                 --no-shop turns it off (the bot-never-shops read) to A/B how much a\n" +
      "                 high-difficulty stall is the bot vs real balance.\n\n" +
      "pacing (DEFAULT realistic): each run ends when the hero reaches the map's intended\n" +
      "                 exit level (arrowCapByDifficulty), so he carries a real-player level\n" +
      "                 forward. --farm turns that off and farms to the cap (the endgame /\n" +
      "                 L99 / artifact-chase read; pair with a big --max-minutes / --rerun).\n\n" +
      `--balance knobs (same ten as the DEVELOPER → BALANCE page, 0..100, 1 = shipped):\n  ${Object.keys(
        BALANCE_TUNING_DEFAULTS,
      ).join(", ")}`,
  );
  process.exit(0);
}

// --balance xpGain=0.8,mobHp=1.5 → { xpGain: 0.8, mobHp: 1.5 }. Keys must match
// the shipped BalanceTuning knobs exactly; values are the ×multipliers the
// BALANCE subpage's sliders set (0 = system off, 1 = baseline).
function parseBalance(spec) {
  if (!spec) return undefined;
  const out = {};
  for (const pair of spec.split(",")) {
    const [rawKey, rawVal] = pair.split("=");
    const key = (rawKey ?? "").trim();
    if (!(key in BALANCE_TUNING_DEFAULTS)) {
      console.error(
        `unknown balance knob "${rawKey}" — expected one of ${Object.keys(
          BALANCE_TUNING_DEFAULTS,
        ).join(", ")}`,
      );
      process.exit(1);
    }
    const value = Number(rawVal);
    if (!Number.isFinite(value) || value < 0) {
      console.error(
        `balance knob "${key}" needs a number ≥ 0, got "${rawVal}"`,
      );
      process.exit(1);
    }
    out[key] = value;
  }
  return out;
}

const parseList = (value, all) =>
  !value || value === "all" ? [...all] : value.split(",").map((s) => s.trim());

const difficulties = parseList(opt("difficulty"), DIFFICULTY_ORDER);
const levelsOnce = parseList(opt("level"), LEVEL_ORDER);
// --rerun N: repeat each map N times per rung — the XP-cap / farm probe.
const rerun = Math.max(1, Number(opt("rerun", "1")));
const levels = levelsOnce.flatMap((id) => Array(rerun).fill(id));
const seed = Number(opt("seed", "1"));
// SPECS: the positioning strategy × the weapon-lane profile. Either flag takes a
// comma list or `all` (strategy `all` = the three postures aggro/balanced/flee;
// profile `all` = melee/ranged/magic). More than one combo runs a MATRIX.
const strategies = parseList(opt("strategy", "survivor"), BOT_POSTURES);
// --class is the primary name for the stat-distribution BUILD (melee/ranged/
// magic/balanced — how the hero spends level-up points, which through the
// stat-aware auto-equip also picks the weapon and gear). `--profile` is the
// historical alias for the same axis (and also takes `auto`, the emergent lane,
// and `meta`, the DEFAULT level-band melee → magic → melee strategy). `--class
// all` sweeps the four real builds; `--profile all` also includes `auto`/`meta`.
const classArg = opt("class");
const profiles =
  classArg !== undefined
    ? parseList(classArg, STAT_BUILDS)
    : parseList(opt("profile", "meta"), BOT_PROFILES);
const validate = (names, allowed, what) => {
  for (const n of names) {
    if (!allowed.includes(n)) {
      console.error(
        `unknown ${what} "${n}" — expected one of ${allowed.join(", ")}` +
          ` (or "all")`,
      );
      process.exit(1);
    }
  }
};
validate(strategies, BOT_STRATEGIES, "strategy");
validate(profiles, BOT_PROFILES, "profile");
const combos = strategies.flatMap((strategy) =>
  profiles.map((profile) => ({ strategy, profile })),
);
const maxMinutes = Number(opt("max-minutes", "15"));
const carryLoadout = !flag("fresh");
const full = flag("full");
const verdict = flag("verdict");
const balance = parseBalance(opt("balance"));
const comparePath = opt("compare");
const jsonPath = opt("json");
// PACING. The DEFAULT is realistic: each run ends the moment the hero reaches
// the map's intended exit level (its arrowCapByDifficulty), so he moves on with
// a real-player level and every level-relative read stays trustworthy. `--farm`
// opts OUT — the bot farms to the cap for the whole run, the endgame read (farm
// toward L99 / full artifact gear); pair it with a big `--max-minutes`/`--rerun`
// to farm deeper.
const realisticPacing = !flag("farm");
// SHOPPING is ON by default, because a real player shops: when the hero is
// weapon-starved (a broken weapon, empty bag → the sidearm), the sim runs him
// to the merchant to sell → repair → buy → equip. Without it a stranded hero
// death-spirals on the sidearm, overstating high-difficulty pressure. `--no-shop`
// turns it off — the bot-never-shops read, to A/B how much a stall is the bot
// vs real balance.
const autoShop = !flag("no-shop");
// ARRIVAL. --start-level N drops a REALISTIC leveled + geared hero into the
// first swept rung instead of a fresh level-1 rookie — the campaign's intended
// entry state (a hero who cleared the rungs below and carried his kit forward).
// The whole game scales to hero level, so this is the ONLY way a top rung reads
// as it's actually played: e.g. `--difficulty jesus --start-level 50` measures a
// nightmare-geared L50 hero on JESUS, not a naked rookie. --gear-tier sets the
// rolled kit's tier (default rare — a solid nightmare-cleared loadout).
const startLevel = opt("start-level");
const gearTier = opt("gear-tier", "rare");
// STUCK CANCELLATION. Every no-progress moment books a penalty at the bot's
// world position (see SimulateLevelOptions.stuckLimit); a run whose penalty
// reaches the limit is cancelled (outcome `stuck`) instead of grinding out the
// clock — a stuck run's numbers are garbage data anyway, and the cancelled
// run's STUCK AREAS coordinates are the actual deliverable: feed them to
// `map-layout.mjs --highlight` to SEE where navigation failed. 0 disables
// cancellation (penalties are still recorded and reported).
const stuckLimit = Math.max(0, Number(opt("stuck-limit", "20")));
// MORTALITY. --mortal makes a death START THE LEVEL OVER (fresh map, new
// attempt seed, the walk-in loadout) instead of the immortal in-place revive —
// the survival read. --max-deaths N aborts a run (outcome `dead`) once it
// books N deaths; it defaults to 10 under --mortal (a bot that dies ten times
// on one map has answered the question) and to 0 (never) otherwise. Every
// death — mortal or not — lands in the DEATHS table with its cause and
// coordinates, ready for map-layout's death overlay.
const mortal = flag("mortal");
const maxDeaths = Math.max(0, Number(opt("max-deaths", mortal ? "10" : "0")));
// THE CAMERA. Every run watches through a real view rect by default — the
// horizontal-phone baseline (422×195 world px, the reference device) — so the
// view-aware rules (enemy targeting, spawner summon-in, the bot's wall-end
// sense) run exactly as on a device screen. `--view WxH` overrides the size
// (e.g. 195x422 for a portrait phone); `--view off` removes the camera
// entirely (the legacy blind-headless read).
const viewSpec = opt("view", "422x195");
const view = (() => {
  if (["off", "none", "0"].includes(String(viewSpec).toLowerCase())) {
    return null;
  }
  const m = /^(\d+)x(\d+)$/i.exec(String(viewSpec));
  if (!m) {
    console.error(`--view must be WxH (world px) or "off", got '${viewSpec}'`);
    process.exit(1);
  }
  return { width: Number(m[1]), height: Number(m[2]) };
})();
// NIGHTMARE and JESUS are NEVER played from level 1 — the campaign ladder
// (content/ladder.yaml, stamped onto each level as `intendedLevel`) puts
// the hero at ~40+ by the time those rungs' mobs appear. So when --start-level is
// omitted on those difficulties, DEFAULT the arrival to the first swept level's
// intended hero level, so the run reproduces where the map is actually reached
// instead of a naked L1 rookie death-spiralling on the starter weapon. easy/
// medium/hard keep the fresh-L1 default (their realistic entry — you DO climb
// them from a rookie). JESUS has no authored ladder level (it is player-relative,
// so `intendedLevel` omits it) — it borrows nightmare's as the entry-from-
// nightmare proxy. An explicit --start-level always wins.
function defaultStartLevel(difficulty, levelId) {
  if (difficulty !== "nightmare" && difficulty !== "jesus") return undefined;
  const intended = levelDef(levelId).intendedLevel ?? [];
  const nightmareIdx = DIFFICULTY_ORDER.indexOf("nightmare");
  const idx =
    difficulty === "jesus"
      ? nightmareIdx
      : DIFFICULTY_ORDER.indexOf(difficulty);
  return intended[idx] ?? intended[nightmareIdx];
}
// The arrival level actually used: an explicit --start-level, else the nightmare/
// jesus ladder default (undefined on easy/medium/hard → a fresh L1 rookie).
const startLevelDefaulted = startLevel === undefined;
const resolvedStartLevel =
  startLevel !== undefined
    ? Number(startLevel)
    : defaultStartLevel(difficulties[0], levels[0]);
// The arrival hero is minted per BUILD, so a class matrix with --start-level
// drops each spec in as its OWN leveled + geared hero (a melee arrival wields a
// melee weapon, etc.) rather than sharing one generalist loadout. `auto` has no
// fixed build, so it arrives as the neutral generalist.
const startLoadoutFor = (profile) =>
  resolvedStartLevel === undefined
    ? null
    : synthesizeArrival({
        difficulty: difficulties[0],
        level: resolvedStartLevel,
        seed,
        weaponTier: gearTier,
        gearTier,
        // The fixed stat-BUILDS synthesize a biased starting kit; the level-band
        // `meta` resolves its lane from the level it's SPUN UP at (magic in the
        // nightmare mid-game, melee at the artifact cap) so its starting kit
        // matches the lane it will commit to. The emergent `auto` has no lane to
        // pre-load for, so it arrives as the neutral generalist.
        build:
          profile === "meta"
            ? metaLane(resolvedStartLevel)
            : profile === "auto"
              ? undefined
              : profile,
      });

// ---- Run ------------------------------------------------------------------------

// Formatting helpers (shared by the matrix render and the single-campaign render).
const min = (ms) => (ms / 60000).toFixed(1);
const pct = (x) => `${Math.round(x * 100)}%`;
const pad = (v, w) => String(v).padStart(w);
const padE = (v, w) => String(v).padEnd(w);

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

// ---- Render ----------------------------------------------------------------------

console.log("");
console.log("CAMPAIGN SUMMARY — one row per run");
const header =
  padE("difficulty", 11) +
  padE("level", 13) +
  padE("outcome", 9) +
  pad("hero", 8) +
  pad("deaths", 7) +
  pad("kills", 7) +
  pad("k/min", 7) +
  pad("dpsOut", 8) +
  pad("hitOut", 8) +
  pad("dmgIn", 8) +
  pad("hitIn", 7) +
  pad("jumps", 7) +
  pad("j/min", 7) +
  pad("cap", 5) +
  pad("xpLost", 9) +
  "  weapon";
console.log(header);
console.log("-".repeat(header.length + 18));
for (const run of report.runs) {
  console.log(
    padE(run.difficulty, 11) +
      padE(run.levelId, 13) +
      padE(run.outcome, 9) +
      pad(`${run.hero.levelStart}→${run.hero.levelEnd}`, 8) +
      pad(run.deaths, 7) +
      pad(run.combat.kills, 7) +
      pad(run.combat.killsPerMinute, 7) +
      pad(run.combat.dpsOut, 8) +
      pad(run.combat.damagePerHit, 8) +
      pad(run.combat.damageTaken, 8) +
      pad(run.combat.damagePerHitTaken, 7) +
      pad(run.combat.jumps ?? 0, 7) +
      pad(run.combat.jumpsPerMinute ?? 0, 7) +
      pad(run.xpCap.cap, 5) +
      pad(run.xpCap.forfeited, 9) +
      `  ${run.hero.weapon.name} (${run.hero.weapon.tier}, ${run.hero.weapon.dps} dps)`,
  );
}

console.log("");
const totalShopVisits = report.runs.reduce(
  (sum, run) => sum + (run.combat.shopVisits ?? 0),
  0,
);
console.log(
  `Hero after the sweep: level ${report.finalLevel}, ${report.finalMaxHp} hp, ` +
    `${report.finalWeapon} — ${report.totalKills} kills, ${report.totalDeaths} deaths, ` +
    (autoShop ? `${totalShopVisits} merchant recoveries, ` : "") +
    `${min(report.totalTimeMs)} simulated minutes (${((Date.now() - startedAt) / 1000).toFixed(1)}s wall).`,
);

// ---- Content reach — did the runner crack every off-path chest? -----------------
const chestRuns = report.runs.filter(
  (run) => (run.combat.chestsTotal ?? 0) > 0,
);
if (chestRuns.length > 0) {
  console.log("");
  console.log("CONTENT REACH — off-path chests the runner cracked open");
  for (const run of chestRuns) {
    const { chestsLooted, chestsTotal } = run.combat;
    const flag = chestsLooted < chestsTotal ? "  ⚠ a cache went unreached" : "";
    console.log(
      `  ${run.difficulty} ${run.levelId}: ${chestsLooted}/${chestsTotal} chests${flag}`,
    );
  }
}

renderStuckAreas(report.runs.map((run) => ({ tag: "", run })));
renderMenace(report.runs.map((run) => ({ tag: "", run })));
renderDeathAreas(report.runs.map((run) => ({ tag: "", run })));

// ---- Boss encounters — where, at what level, and what dropped -------------------

const allBosses = report.runs.flatMap((run) =>
  run.bosses.map((b) => ({ run, boss: b })),
);
if (allBosses.length > 0) {
  console.log("");
  console.log("BOSS ENCOUNTERS — where the hero meets each elite/boss");
  const bh =
    padE("difficulty", 11) +
    padE("level", 13) +
    padE("boss", 20) +
    padE("role", 6) +
    pad("met", 6) +
    pad("heroL", 12) +
    pad("bossL", 6) +
    pad("bossHp", 8) +
    pad("hit", 5) +
    pad("toKill", 7) +
    pad("hp%", 5) +
    "  drop";
  console.log(bh);
  console.log("-".repeat(bh.length + 12));
  for (const { run, boss } of allBosses) {
    const heroL = !boss.engaged
      ? "—"
      : boss.intendedHeroLevel === null
        ? `${boss.heroLevel}`
        : `${boss.heroLevel}/${boss.intendedHeroLevel}`;
    const outcome = !boss.engaged
      ? "not reached"
      : !boss.killed
        ? "ENGAGED, not killed"
        : (boss.drop ?? "(no named drop)");
    console.log(
      padE(run.difficulty, 11) +
        padE(run.levelId, 13) +
        padE(boss.name.slice(0, 19), 20) +
        padE(boss.role, 6) +
        pad(boss.engaged ? min(boss.metAtMs) : "—", 6) +
        pad(heroL, 12) +
        pad(boss.bossLevel, 6) +
        pad(boss.bossMaxHp, 8) +
        pad(boss.bossContactDamage, 5) +
        pad(boss.killed ? boss.hitsToKill : "—", 7) +
        pad(boss.engaged ? pct(boss.heroHpFrac) : "—", 5) +
        `  ${outcome}`,
    );
  }
}

// ---- Loot vs level — do the drops fit the hero's level? ------------------------

const runsWithDrops = report.runs.filter(
  (run) => run.drops.equipment.total > 0,
);
if (runsWithDrops.length > 0) {
  console.log("");
  console.log("LOOT VS LEVEL — do the equipment drops fit the hero's level?");
  const lh =
    padE("difficulty", 11) +
    padE("level", 13) +
    pad("hero", 8) +
    pad("drops", 7) +
    pad("wear", 6) +
    pad("gated", 7) +
    pad("trash", 7) +
    pad("onLvl", 7) +
    pad("above", 7) +
    pad("Δilvl", 7);
  console.log(lh);
  console.log("-".repeat(lh.length));
  for (const run of runsWithDrops) {
    const e = run.drops.equipment;
    const delta =
      e.avgIlvlDelta > 0 ? `+${e.avgIlvlDelta}` : `${e.avgIlvlDelta}`;
    console.log(
      padE(run.difficulty, 11) +
        padE(run.levelId, 13) +
        pad(`${run.hero.levelStart}→${run.hero.levelEnd}`, 8) +
        pad(e.total, 7) +
        pad(e.equippableNow, 6) +
        pad(e.levelGated, 7) +
        pad(e.belowLevel, 7) +
        pad(e.onLevel, 7) +
        pad(e.aboveLevel, 7) +
        pad(delta, 7),
    );
  }
  console.log(
    "  wear = equippable on the spot · gated = too high-level to wear · " +
      "trash/above = ilvl >" +
      "3 below/above hero · Δilvl = mean drop ilvl − hero level",
  );
}

if (verdict) renderVerdict(report);
if (comparePath) renderCompare(report, comparePath);

if (full) {
  for (const run of report.runs) {
    console.log("");
    console.log(
      `=== ${run.difficulty.toUpperCase()} · ${run.levelName} (${run.levelId}) — ` +
        `${run.outcome} in ${min(run.timeMs)} min, seed ${run.seed} ===`,
    );
    const h = run.hero;
    console.log(
      `hero: L${h.levelStart}→L${h.levelEnd} · ${h.maxHp} hp · armor ${h.armor} ` +
        `(${pct(h.armorReduction)} vs current horde) · ${h.coins} coins · ` +
        `stats ${Object.entries(h.stats)
          .map(([k, v]) => `${k.slice(0, 3).toUpperCase()}${v}`)
          .join(" ")}`,
    );
    console.log(
      `combat: ${run.combat.kills}/${run.combat.totalEnemies} kills · ` +
        `${run.combat.dpsOut} dps out · ${run.combat.hitsLanded} hits landed ` +
        `(${run.combat.damagePerHit}/hit, ${pct(run.combat.critRate)} crit) · ` +
        `${run.combat.damageTaken} damage taken over ${run.combat.hitsTaken} hits ` +
        `(${run.combat.damagePerHitTaken}/hit before armor) · ` +
        `${run.combat.shotsFired} shots · xp ${h.xpGained}` +
        (run.xpCap.forfeited > 0
          ? ` (+${run.xpCap.forfeited} withheld by the map cap ${run.xpCap.cap}` +
            (run.xpCap.reachedAtMs !== null
              ? `, hit at ${min(run.xpCap.reachedAtMs)} min)`
              : `)`)
          : ` (map cap ${run.xpCap.cap} never neared)`),
    );

    // The spell economy — only meaningful for a caster who actually casts.
    if (run.combat.spellsCast > 0) {
      console.log(
        `spells: ${run.combat.spellsCast} cast ` +
          `(${run.combat.spellsPerMinute}/min) · ` +
          `${run.combat.manaSpent} mana spent`,
      );
    }

    if (run.weaponTimeline.length > 0) {
      console.log("weapon timeline (auto-equip swaps):");
      for (const swap of run.weaponTimeline) {
        console.log(
          `  ${pad(min(swap.atMs), 5)} min  ${swap.from} (${swap.fromDps} dps) → ` +
            `${swap.to} (${swap.toDps} dps, ${swap.tier})`,
        );
      }
    }

    console.log("mobs:");
    console.log(
      "  " +
        padE("mob", 22) +
        padE("role", 8) +
        pad("spawned", 8) +
        pad("killed", 8) +
        pad("avgHp", 8) +
        pad("mlvl", 6) +
        pad("hit", 6) +
        pad("heroHit", 9) +
        pad("toKill", 7) +
        pad("xpPaid", 9),
    );
    for (const mob of run.mobs) {
      console.log(
        "  " +
          padE(mob.name, 22) +
          padE(mob.role, 8) +
          pad(mob.spawned, 8) +
          pad(mob.killed, 8) +
          pad(mob.avgMaxHp, 8) +
          pad(mob.avgMlvl, 6) +
          pad(mob.contactDamage, 6) +
          pad(mob.avgHitFromHero, 9) +
          pad(mob.hitsToKill, 7) +
          pad(mob.xpPaid, 9),
      );
    }

    const dropLine = (byKind) =>
      Object.entries(byKind)
        .sort(([, a], [, b]) => b - a)
        .map(([k, n]) => `${k}×${n}`)
        .join(" ") || "(none)";
    console.log(`drops on the ground: ${dropLine(run.drops.spawnedByKind)}`);
    console.log(
      `collected: ${dropLine(run.drops.collectedByKind)} · equipment by tier: ` +
        `${dropLine(run.drops.equipmentByTier)} · auto-equipped ${run.drops.autoEquipped}` +
        (run.drops.named.length > 0
          ? ` · named finds: ${run.drops.named.join(", ")}`
          : ""),
    );

    console.log("snapshots (every simulated minute bucket):");
    console.log(
      "  " +
        pad("min", 5) +
        pad("level", 6) +
        pad("hp", 10) +
        pad("dps", 8) +
        pad("armor", 7) +
        pad("reduc", 7) +
        pad("kills", 7) +
        pad("menace", 7),
    );
    for (const s of run.snapshots) {
      console.log(
        "  " +
          pad(min(s.atMs), 5) +
          pad(s.level, 6) +
          pad(`${s.hp}/${s.maxHp}`, 10) +
          pad(s.dps, 8) +
          pad(s.armor, 7) +
          pad(pct(s.armorReduction), 7) +
          pad(s.kills, 7) +
          pad(s.menaceStage, 7),
      );
    }
  }
}

if (jsonPath) {
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log(`\nFull report written to ${jsonPath}`);
}

// ---- STUCK AREAS — where the bot stopped making progress ------------------------

// The structured no-progress report (see SimulateLevelOptions.stuckLimit): one
// block per run that booked penalties, its clustered world coordinates, and a
// ready-to-paste map-layout --highlight command — so a navigation failure can
// be SEEN on the rendered map immediately and iterated on. Runs the sim
// CANCELLED (penalty ≥ limit) are flagged; a clean sweep prints nothing.
function renderStuckAreas(taggedRuns) {
  const offenders = taggedRuns.filter(
    ({ run }) => (run.stuck?.events.length ?? 0) > 0,
  );
  if (offenders.length === 0) return;
  console.log("");
  console.log(
    "STUCK AREAS — where the bot stopped making progress " +
      "(wedge = frozen on geometry, loiter = circling without landing damage)",
  );
  for (const { tag, run } of offenders) {
    const s = run.stuck;
    const status = s.cancelled
      ? `RUN CANCELLED at ${min(run.timeMs)} min — penalty ${s.penalty}/${s.limit}`
      : `penalty ${s.penalty}${s.limit > 0 ? `/${s.limit}` : ""} over ${min(run.timeMs)} min`;
    console.log(`  ${tag}${run.difficulty}/${run.levelId} — ${status}`);
    const byPenalty = [...s.areas].sort((a, b) => b.penalty - a.penalty);
    for (const area of byPenalty) {
      const kinds = [
        area.wedges ? `${area.wedges} wedge` : "",
        area.loiters ? `${area.loiters} loiter` : "",
      ]
        .filter(Boolean)
        .join(", ");
      console.log(
        `    (${pad(area.x, 5)}, ${pad(area.y, 5)})  ×${area.count} event(s), penalty ${area.penalty}  [${kinds}]`,
      );
    }
    const coords = byPenalty.map((a) => `${a.x},${a.y}`).join(";");
    // --seed matters: stuck spots often sit on the run's seed-SCATTERED rocks,
    // which only draw on the layout when the same seed is passed.
    console.log(
      `    visualize: node scripts/map-layout.mjs ${run.levelId} --seed ${run.seed} --highlight "${coords}"`,
    );
  }
}

// ---- MENACE ESCALATIONS — when and where the horde evolved ----------------------

// The escalation ledger (report.menace): every menace stage rise the engine
// emitted, timestamped and located, clustered into map areas — so a "malice is
// off the scale" run answers WHEN it blew up (sim-minute), WHERE (coordinates
// for map-layout --highlight), and WHY (overkill jolt, permanent ratchet, or
// rolling heat). Quiet runs (no rises) print nothing.
function renderMenace(taggedRuns) {
  const MENACE_CLUSTER_RADIUS = 120;
  const offenders = taggedRuns.filter(
    ({ run }) => (run.menace?.rises.length ?? 0) > 0,
  );
  if (offenders.length === 0) return;
  console.log("");
  console.log(
    "MENACE ESCALATIONS — when/where the horde evolved " +
      "(overkill = one-shot jolt, ratchet = permanent floor, heat = rolling output)",
  );
  for (const { tag, run } of offenders) {
    const m = run.menace;
    const byCause = { overkill: 0, ratchet: 0, heat: 0 };
    for (const rise of m.rises) byCause[rise.cause]++;
    const causes = Object.entries(byCause)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${n} ${k}`)
      .join(", ");
    console.log(
      `  ${tag}${run.difficulty}/${run.levelId} — ${m.rises.length} rise(s) (${causes}) · ` +
        `first at ${min(m.firstRiseAtMs)} min · peak stage ${m.peakStage} · ` +
        `ended stage ${m.finalStage} (floor ${m.floorStage})`,
    );
    for (const rise of m.rises.slice(0, 12)) {
      console.log(
        `    ${pad(min(rise.atMs), 5)} min  stage ${pad(rise.stage, 3)}  ` +
          `(${padE(rise.cause, 8)})  at (${pad(rise.x, 5)}, ${pad(rise.y, 5)})`,
      );
    }
    if (m.rises.length > 12) {
      console.log(`    … and ${m.rises.length - 12} more rise(s)`);
    }
    // Cluster the rises into areas (running centroids, like STUCK AREAS) so
    // the highlight command marks the hot zones instead of a point cloud.
    const areas = [];
    for (const rise of m.rises) {
      let area = null;
      for (const a of areas) {
        if (Math.hypot(a.x - rise.x, a.y - rise.y) <= MENACE_CLUSTER_RADIUS) {
          area = a;
          break;
        }
      }
      if (area) {
        area.x = Math.round((area.x * area.count + rise.x) / (area.count + 1));
        area.y = Math.round((area.y * area.count + rise.y) / (area.count + 1));
        area.count++;
      } else {
        areas.push({ x: rise.x, y: rise.y, count: 1 });
      }
    }
    const coords = areas.map((a) => `${a.x},${a.y}`).join(";");
    console.log(
      `    visualize: node scripts/map-layout.mjs ${run.levelId} --seed ${run.seed} --highlight "${coords}"`,
    );
  }
}

// ---- DEATHS — where the hero died, and what killed him --------------------------

// The death ledger (see SimulateLevelOptions.mortal / maxDeaths): one block per
// run that booked deaths, its clustered world coordinates with a per-cause
// breakdown, and a ready-to-paste map-layout --deaths command — so "we keep
// dying HERE, to THAT" can be SEEN on the rendered map and judged by visual
// inspection. Runs the sim ABORTED (deaths reached --max-deaths) are flagged:
// the spot is plainly too hard for the bot — fix the map/balance there rather
// than re-measuring. A deathless sweep prints nothing.
function renderDeathAreas(taggedRuns) {
  const offenders = taggedRuns.filter(
    ({ run }) => (run.deathLog?.events.length ?? 0) > 0,
  );
  if (offenders.length === 0) return;
  console.log("");
  console.log(
    "DEATHS — where the hero died and what killed him " +
      "(clustered areas; a repeated cause at one spot = the problem to fix)",
  );
  for (const { tag, run } of offenders) {
    const d = run.deathLog;
    const mode = d.mortal
      ? "mortal — each death restarted the level"
      : "immortal — revived in place";
    const status = d.aborted
      ? `RUN ABORTED at ${min(run.timeMs)} min — ${d.events.length}/${d.limit} deaths (${mode})`
      : `${d.events.length} death(s)${d.limit > 0 ? ` of ${d.limit} allowed` : ""} over ${min(run.timeMs)} min (${mode})`;
    console.log(`  ${tag}${run.difficulty}/${run.levelId} — ${status}`);
    const byCount = [...d.areas].sort((a, b) => b.count - a.count);
    for (const area of byCount) {
      const causes = Object.entries(area.causes)
        .sort(([, a], [, b]) => b - a)
        .map(([cause, n]) => (n > 1 ? `${cause}×${n}` : cause))
        .join(", ");
      console.log(
        `    (${pad(area.x, 5)}, ${pad(area.y, 5)})  ×${area.count} death(s)  [${causes}]`,
      );
    }
    // Each marker is labelled with the area's dominant killer. --seed matters
    // for the scattered obstacles (in mortal mode later attempts reseed the
    // scatter, so treat rock positions as approximate past the first death).
    const coords = byCount
      .map((a) => {
        const top = Object.entries(a.causes).sort(([, x], [, y]) => y - x)[0];
        return `${a.x},${a.y}:${top?.[0] ?? "unknown"}`;
      })
      .join(";");
    console.log(
      `    visualize: node scripts/map-layout.mjs ${run.levelId} --seed ${run.seed} --deaths "${coords}"`,
    );
  }
}

// ---- --verdict — the one-screen "is anything off?" read -------------------------

// A handful of target-band checks distilled to PASS/WARN/FAIL, so a balance
// tweak can be judged at a glance instead of by reading every table. The bands
// are deliberately generous — this flags the gross regressions (one-shotting,
// walls, first-visit XP starvation, under-levelled boss gates), not fine feel.
function renderVerdict(report) {
  const round1 = (n) => Math.round(n * 10) / 10;
  const checks = [];
  const add = (level, label, detail) => checks.push({ level, label, detail });

  // 1. First-visit XP forfeit — the per-map caps are sized to bite reruns, so a
  //    first pass should forfeit ~nothing (leveling-balance skill's invariant).
  const firstSeen = new Set();
  const xpOffenders = [];
  for (const run of report.runs) {
    const key = `${run.difficulty}/${run.levelId}`;
    if (firstSeen.has(key)) continue;
    firstSeen.add(key);
    if (
      run.hero.xpGained > 0 &&
      run.xpCap.forfeited > 0.15 * run.hero.xpGained
    ) {
      xpOffenders.push(
        `${key} (+${run.xpCap.forfeited} of ${run.hero.xpGained})`,
      );
    }
  }
  if (xpOffenders.length === 0)
    add("PASS", "First-visit XP", "caps withheld ~nothing on first passes");
  else
    add(
      xpOffenders.length > 2 ? "FAIL" : "WARN",
      "First-visit XP",
      `${xpOffenders.length} first pass(es) forfeit >15%: ${xpOffenders.slice(0, 3).join("; ")}`,
    );

  // 2. Blows-to-kill on the minion horde — collapses toward 1 = one-shotting
  //    (the drift the diminishing-returns curve exists to stop); balloons = wall.
  //    KILL-WEIGHTED: a rare mega-hp mob the hero downs once must not outvote
  //    the basic minion he kills hundreds of times — the mean tracks the horde
  //    he ACTUALLY fights, not the worst outlier he happened to clip.
  let tkSum = 0;
  let tkKills = 0;
  for (const run of report.runs) {
    for (const mob of run.mobs) {
      if (mob.role === "minion" && mob.killed > 0 && mob.hitsToKill > 0) {
        tkSum += mob.hitsToKill * mob.killed;
        tkKills += mob.killed;
      }
    }
  }
  const meanToKill = tkKills ? tkSum / tkKills : 0;
  if (tkKills === 0) add("WARN", "Blows-to-kill", "no minion kills to read");
  else if (meanToKill < 1.5)
    add(
      "FAIL",
      "Blows-to-kill",
      `hero one-shots the horde (mean ${round1(meanToKill)})`,
    );
  else if (meanToKill > 12)
    add("FAIL", "Blows-to-kill", `horde walls (mean ${round1(meanToKill)})`);
  else if (meanToKill < 2 || meanToKill > 8)
    add("WARN", "Blows-to-kill", `mean ${round1(meanToKill)} (target 2–8)`);
  else add("PASS", "Blows-to-kill", `mean ${round1(meanToKill)} blows/minion`);

  // 3. Boss level within the map's own level SPAN — the pacing gate. Elites and
  //    bosses are fought THROUGHOUT a map, not at its end, so the hero's level
  //    when he meets one should sit between where he ENTERED (levelStart) and
  //    where a normal clear LEAVES him (intendedHeroLevel = the map's end cap),
  //    with ±2 slack. Comparing against the end cap alone (as an earlier version
  //    did) is biased negative — a mid-map elite met at the entry level is fine,
  //    not under-levelled. Outside the span = genuinely off: well under entry =
  //    under-geared for the map, well over the end cap = over-levelled.
  const bossOff = [];
  let bossesChecked = 0;
  for (const run of report.runs) {
    for (const b of run.bosses) {
      if (!b.engaged || b.intendedHeroLevel === null) continue;
      bossesChecked++;
      const lo = run.hero.levelStart - 2;
      const hi = b.intendedHeroLevel + 2;
      if (b.heroLevel < lo || b.heroLevel > hi) {
        const how = b.heroLevel < lo ? "under" : "over";
        bossOff.push(
          `${run.difficulty}/${b.name} L${b.heroLevel} ${how} span [${run.hero.levelStart}–${b.intendedHeroLevel}]`,
        );
      }
    }
  }
  if (bossesChecked === 0)
    add(
      "WARN",
      "Boss level",
      "no boss was engaged on a map with an intended level",
    );
  else if (bossOff.length === 0)
    add(
      "PASS",
      "Boss level",
      `all ${bossesChecked} within their map's level span`,
    );
  else
    add(
      bossOff.length > bossesChecked / 2 ? "FAIL" : "WARN",
      "Boss level",
      `${bossOff.length}/${bossesChecked} outside span: ${bossOff.slice(0, 3).join("; ")}`,
    );

  // 4. Bosses walled — a boss the hero REACHED and traded blows with but never
  //    felled is a wall (or the bot's pacing giving out). Bosses never reached
  //    in a time-boxed run aren't counted — that's not a balance fault.
  const standing = allBosses.filter(({ boss }) => boss.engaged && !boss.killed);
  if (standing.length === 0)
    add("PASS", "Bosses felled", "every boss engaged went down");
  else
    add(
      "WARN",
      "Bosses felled",
      `${standing.length} engaged but survived: ${standing
        .slice(0, 3)
        .map(({ run, boss }) => `${run.difficulty}/${boss.name}`)
        .join("; ")}`,
    );

  // 5. Loot fits level — the drop rain should mostly hand the hero gear he can
  //    wear and that tracks his level, not aspirational pieces he's too low for
  //    (gated) or trash beneath him (ilvl well under his level).
  let dTotal = 0;
  let dGated = 0;
  let dTrash = 0;
  let dDeltaSum = 0;
  for (const run of report.runs) {
    const e = run.drops.equipment;
    dTotal += e.total;
    dGated += e.levelGated;
    dTrash += e.belowLevel;
    dDeltaSum += e.avgIlvlDelta * e.total;
  }
  if (dTotal === 0)
    add("WARN", "Loot fits level", "no equipment dropped to read");
  else {
    const gatedFrac = dGated / dTotal;
    const trashFrac = dTrash / dTotal;
    const worstFrac = Math.max(gatedFrac, trashFrac);
    const detail =
      `${round1(gatedFrac * 100)}% gated, ${round1(trashFrac * 100)}% trash, ` +
      `mean Δilvl ${round1(dDeltaSum / dTotal)} (over ${dTotal} drops)`;
    if (worstFrac > 0.4) add("FAIL", "Loot fits level", detail);
    else if (worstFrac > 0.2) add("WARN", "Loot fits level", detail);
    else add("PASS", "Loot fits level", detail);
  }

  // 6. DPS on curve — PER RUNG (a campaign mean hides the one rung where loot
  //    fell off). Each run's KILL-WEIGHTED mean minion blows-to-kill should stay
  //    in band — weighted so a rare mega-hp mob doesn't wrongly flag a rung the
  //    hero actually clears fine.
  const offCurve = [];
  let rungsRead = 0;
  for (const run of report.runs) {
    const mk = run.mobs.filter(
      (m) => m.role === "minion" && m.killed > 0 && m.hitsToKill > 0,
    );
    if (mk.length === 0) continue;
    rungsRead++;
    const kills = mk.reduce((a, m) => a + m.killed, 0);
    const mean = mk.reduce((a, m) => a + m.hitsToKill * m.killed, 0) / kills;
    if (mean < 2 || mean > 8) {
      offCurve.push(`${run.difficulty}/${run.levelId} ${round1(mean)}`);
    }
  }
  if (rungsRead === 0)
    add("WARN", "DPS on curve", "no minion kills to read per rung");
  else if (offCurve.length === 0)
    add("PASS", "DPS on curve", `all ${rungsRead} rungs 2–8 blows/minion`);
  else
    add(
      offCurve.length > rungsRead / 3 ? "FAIL" : "WARN",
      "DPS on curve",
      `${offCurve.length}/${rungsRead} rungs off (2–8): ${offCurve.slice(0, 4).join("; ")}`,
    );

  // 7. Dead pools — a run where the hero leveled up but NOTHING better dropped
  //    (no auto-equip swap, no upgrade equipped): the map's loot pool is starved.
  const dead = report.runs.filter(
    (run) =>
      run.hero.levelEnd - run.hero.levelStart >= 2 &&
      run.weaponTimeline.length === 0 &&
      run.drops.equipment.equippableNow === 0,
  );
  if (dead.length === 0)
    add("PASS", "Loot pools", "every rung handed the hero a usable upgrade");
  else
    add(
      "WARN",
      "Loot pools",
      `${dead.length} starved rung(s) — leveled but no wearable drop: ${dead
        .slice(0, 3)
        .map((r) => `${r.difficulty}/${r.levelId}`)
        .join("; ")}`,
    );

  console.log("");
  console.log(
    "VERDICT — target-band checks (generous bands; flags regressions)",
  );
  for (const c of checks) {
    console.log(`  [${c.level.padEnd(4)}] ${padE(c.label, 16)} ${c.detail}`);
  }
  const worst = checks.some((c) => c.level === "FAIL")
    ? "FAIL"
    : checks.some((c) => c.level === "WARN")
      ? "WARN"
      : "PASS";
  console.log(`  → overall: ${worst}`);
}

// ---- --compare — the A/B diff for fast iteration --------------------------------

// Diff this run against a prior --json dump so a knob change reads as deltas
// (this moved k/min +12%, boss L −1) instead of two full reports eyeballed
// side by side. Matches runs and bosses by difficulty/level(/defId).
function renderCompare(report, baselinePath) {
  const round1 = (n) => Math.round(n * 10) / 10;
  let base;
  try {
    base = JSON.parse(readFileSync(baselinePath, "utf8"));
  } catch (err) {
    console.error(`--compare: could not read ${baselinePath}: ${err.message}`);
    return;
  }
  const d = (a, b) => {
    const delta = round1(b - a);
    return `${a} → ${b} (${delta > 0 ? "+" : ""}${delta})`;
  };
  console.log("");
  console.log(`COMPARE vs ${baselinePath}  (baseline → current)`);
  console.log(`  final level : ${d(base.finalLevel, report.finalLevel)}`);
  console.log(`  total kills : ${d(base.totalKills, report.totalKills)}`);
  console.log(`  total deaths: ${d(base.totalDeaths, report.totalDeaths)}`);
  // Jump discipline: total takeoffs across the sweep (absent in pre-jumps
  // baselines — read 0).
  const jumpAgg = (rep) =>
    (rep.runs ?? []).reduce((sum, run) => sum + (run.combat?.jumps ?? 0), 0);
  console.log(`  total jumps : ${d(jumpAgg(base), jumpAgg(report))}`);

  // Campaign loot-vs-level aggregate: total drops and the mean drop ilvl − hero
  // level (the "do drops fit the leveling curve" headline), diffed as a delta.
  const lootAgg = (rep) => {
    let total = 0;
    let deltaSum = 0;
    for (const run of rep.runs ?? []) {
      const e = run.drops?.equipment;
      if (!e) continue;
      total += e.total;
      deltaSum += (e.avgIlvlDelta ?? 0) * e.total;
    }
    return { total, meanDelta: total ? round1(deltaSum / total) : 0 };
  };
  const baseLoot = lootAgg(base);
  const curLoot = lootAgg(report);
  console.log(`  equip drops : ${d(baseLoot.total, curLoot.total)}`);
  console.log(`  mean Δilvl  : ${d(baseLoot.meanDelta, curLoot.meanDelta)}`);

  const baseBoss = new Map();
  for (const run of base.runs ?? []) {
    for (const b of run.bosses ?? []) {
      baseBoss.set(`${run.difficulty}/${run.levelId}/${b.defId}`, b);
    }
  }
  const rows = [];
  for (const run of report.runs) {
    for (const b of run.bosses) {
      const prev = baseBoss.get(`${run.difficulty}/${run.levelId}/${b.defId}`);
      if (prev) rows.push({ diff: run.difficulty, boss: b, prev });
    }
  }
  if (rows.length > 0) {
    console.log("  boss encounters (heroLevel · blows-to-kill):");
    for (const { diff, boss, prev } of rows) {
      console.log(
        `    ${padE(diff, 10)}${padE(boss.name.slice(0, 18), 19)} ` +
          `heroL ${d(prev.heroLevel, boss.heroLevel)} · ` +
          `toKill ${d(prev.hitsToKill, boss.hitsToKill)}`,
      );
    }
  }
}
