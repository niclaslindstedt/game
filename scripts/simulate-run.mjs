#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
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
// This is a CALIBRATION tool: the hero cannot die. A defeat revives the hero
// at the spawn with everything kept, books the death as a pressure gauge,
// and the measurement marches on — so pacing, loot, and damage-exchange
// reads are never capped by the autopilot's survival skill.

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
const { DIFFICULTY_ORDER } = await import(
  path.join(root, "src/game/defs/difficulties.ts")
);
const { LEVEL_ORDER } = await import(
  path.join(root, "src/game/defs/levels/index.ts")
);
const { BALANCE_TUNING_DEFAULTS } = await import(
  path.join(root, "src/game/tuning.ts")
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
      "[--level all|spacez_hq[,…]] [--rerun N] [--seed N] [--strategy survivor|rush|kite|boss] " +
      "[--max-minutes N] [--fresh] [--full] [--verdict] [--balance xpGain=0.8,mobHp=1.5] " +
      "[--compare baseline.json] [--json out.json]\n\n" +
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
const strategy = opt("strategy", "survivor");
const maxMinutes = Number(opt("max-minutes", "15"));
const carryLoadout = !flag("fresh");
const full = flag("full");
const verdict = flag("verdict");
const balance = parseBalance(opt("balance"));
const comparePath = opt("compare");
const jsonPath = opt("json");

// ---- Run ------------------------------------------------------------------------

const startedAt = Date.now();
const balanceLabel = balance
  ? Object.entries(balance)
      .map(([k, v]) => `${k}=${v}×`)
      .join(" ")
  : "shipped 1×";
console.log(
  `Simulating ${difficulties.length} difficulty(ies) × ${levels.length} level run(s)` +
    ` — strategy=${strategy} seed=${seed} maxMinutes=${maxMinutes}` +
    ` carry=${carryLoadout}${rerun > 1 ? ` rerun=${rerun}` : ""} · balance: ${balanceLabel}`,
);

const report = simulateCampaign({
  difficulties,
  levels,
  seed,
  strategy,
  maxMinutes,
  carryLoadout,
  balance,
});

// ---- Render ----------------------------------------------------------------------

const min = (ms) => (ms / 60000).toFixed(1);
const pct = (x) => `${Math.round(x * 100)}%`;
const pad = (v, w) => String(v).padStart(w);
const padE = (v, w) => String(v).padEnd(w);

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
      pad(run.xpCap.cap, 5) +
      pad(run.xpCap.forfeited, 9) +
      `  ${run.hero.weapon.name} (${run.hero.weapon.tier}, ${run.hero.weapon.dps} dps)`,
  );
}

console.log("");
console.log(
  `Hero after the sweep: level ${report.finalLevel}, ${report.finalMaxHp} hp, ` +
    `${report.finalWeapon} — ${report.totalKills} kills, ${report.totalDeaths} deaths, ` +
    `${min(report.totalTimeMs)} simulated minutes (${((Date.now() - startedAt) / 1000).toFixed(1)}s wall).`,
);

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
  const toKill = [];
  for (const run of report.runs) {
    for (const mob of run.mobs) {
      if (mob.role === "minion" && mob.killed > 0 && mob.hitsToKill > 0) {
        toKill.push(mob.hitsToKill);
      }
    }
  }
  const meanToKill = toKill.length
    ? toKill.reduce((a, b) => a + b, 0) / toKill.length
    : 0;
  if (toKill.length === 0)
    add("WARN", "Blows-to-kill", "no minion kills to read");
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

  // 3. Boss level vs the map's intended level — the pacing gate: is the hero
  //    arriving at each boss roughly where the content expects him?
  const bossOff = [];
  let bossesChecked = 0;
  for (const run of report.runs) {
    for (const b of run.bosses) {
      if (!b.engaged || b.intendedHeroLevel === null) continue;
      bossesChecked++;
      const delta = b.heroLevel - b.intendedHeroLevel;
      if (Math.abs(delta) > 2) {
        bossOff.push(
          `${run.difficulty}/${b.name} L${b.heroLevel}v${b.intendedHeroLevel} (${delta > 0 ? "+" : ""}${delta})`,
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
    add("PASS", "Boss level", `all ${bossesChecked} within ±2 of intended`);
  else
    add(
      bossOff.length > bossesChecked / 2 ? "FAIL" : "WARN",
      "Boss level",
      `${bossOff.length}/${bossesChecked} off by >2: ${bossOff.slice(0, 3).join("; ")}`,
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
