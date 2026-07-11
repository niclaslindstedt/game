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

import { writeFileSync } from "node:fs";
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
      "[--max-minutes N] [--fresh] [--full] [--json out.json]",
  );
  process.exit(0);
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
const jsonPath = opt("json");

// ---- Run ------------------------------------------------------------------------

const startedAt = Date.now();
console.log(
  `Simulating ${difficulties.length} difficulty(ies) × ${levels.length} level run(s)` +
    ` — strategy=${strategy} seed=${seed} maxMinutes=${maxMinutes}` +
    ` carry=${carryLoadout}${rerun > 1 ? ` rerun=${rerun}` : ""}`,
);

const report = simulateCampaign({
  difficulties,
  levels,
  seed,
  strategy,
  maxMinutes,
  carryLoadout,
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
