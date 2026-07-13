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
      "[--max-minutes N] [--fresh] [--full] [--verdict] [--farm] [--auto-shop] " +
      "[--balance xpGain=0.8,mobHp=1.5] [--compare baseline.json] [--json out.json]\n\n" +
      "--auto-shop      let the hero use the merchant (sell → repair → buy → equip) when\n" +
      "                 weapon-starved — A/B it to tell a real high-difficulty stall from\n" +
      "                 the bot simply never shopping\n\n" +
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
const strategy = opt("strategy", "survivor");
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
// --auto-shop: let the sim use the merchant (sell → repair → buy → equip) when
// the hero is weapon-starved, so a high-difficulty stall reads as balance
// rather than the bot never shopping. Off by default (A/B the death spiral).
const autoShop = flag("auto-shop");

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
    ` carry=${carryLoadout}${rerun > 1 ? ` rerun=${rerun}` : ""} · balance: ${balanceLabel}` +
    (realisticPacing
      ? " · pacing: clear to the map's level & move on (realistic)"
      : " · pacing: FARM to the cap (endgame / L99 chase — over-levels on purpose)") +
    (autoShop ? " · auto-shop: ON (merchant recovery)" : ""),
);

const report = simulateCampaign({
  difficulties,
  levels,
  seed,
  strategy,
  maxMinutes,
  carryLoadout,
  balance,
  realisticPacing,
  autoShop,
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
  //    fell off). Each run's mean minion blows-to-kill should stay in band.
  const offCurve = [];
  let rungsRead = 0;
  for (const run of report.runs) {
    const mk = run.mobs.filter(
      (m) => m.role === "minion" && m.killed > 0 && m.hitsToKill > 0,
    );
    if (mk.length === 0) continue;
    rungsRead++;
    const mean = mk.reduce((a, m) => a + m.hitsToKill, 0) / mk.length;
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
