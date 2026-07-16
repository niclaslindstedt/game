#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// STATS TRACKER — how the horde's stats scale as the hero climbs a campaign, so
// you can SEE mob level, hp, contact damage and armor rise (and step up each
// difficulty). It walks the CRITICAL PATH (one bottom lane → nightmare → jesus)
// KILL-BY-KILL through the real rosters — the same fast, deterministic model the
// leveling-curve calculator uses, NOT the autopilot — so a full run is modelled
// in well under a second. It logs an AVERAGE over each bucket of ~100 kills
// (`--bucket`), one CSV row per bucket, plus one row per elite/boss kill. Every
// mob stat is the engine's own scaling read at the bucket's mean hero level.
//
//   node scripts/stats-track.mjs                      # critical path → stdout CSV
//   node scripts/stats-track.mjs --out run.csv --graph run.json
//   node scripts/stats-track.mjs --start hard         # a different bottom lane
//   node scripts/stats-track.mjs --full               # all five rungs
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";

register("./game-alias-loader.mjs", import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

const { LEVELING, LOOT, STATS } = await import(
  path.join(root, "src/game/config.ts")
);
const {
  xpToLevelUp,
  arrowXpShareAt,
  arrowColdXp,
  xpLevelCap,
  xpCapMultiplier,
  mobLevelXp,
} = await import(path.join(root, "src/game/leveling.ts"));
const { mobLevelFor, mobHpScaleFor, mobContactScaleFor } = await import(
  path.join(root, "src/game/menace.ts")
);
const { DIFFICULTY_ORDER, difficultyDef, meetsMinDifficulty, scaledMobCount } =
  await import(path.join(root, "src/game/defs/difficulties.ts"));
const { LEVELS, LEVEL_ORDER } = await import(
  path.join(root, "src/game/defs/levels/index.ts")
);
const { enemyDef } = await import(
  path.join(root, "src/game/defs/enemies/index.ts")
);

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const bucketSize = Number(opt("bucket", "100"));
const startLane = opt("start", "medium");
const PATH = args.includes("--full")
  ? [...DIFFICULTY_ORDER]
  : [startLane, "nightmare", "jesus"];
// Where a full clear of the tier below leaves the hero (see leveling-curve.mjs).
const TIER_ENTRY = { nightmare: 34, jesus: 56 };
const outPath = opt("out");
const graphPath = opt("graph");

// A reference minion's contact damage at monster level 1 — the anchor the
// per-level contact ramp (`mobContactScaleFor`) rides, so "mob damage" reads as
// an absolute whose trend is legible.
const REF_CONTACT_L1 = 6;
const mobStats = (heroLevel, diff) => {
  const mlvl = mobLevelFor(heroLevel, diff);
  return {
    mlvl,
    hp: Math.round(LEVELING.refMobHp * mobHpScaleFor(heroLevel, diff)),
    dmg: Math.round(REF_CONTACT_L1 * mobContactScaleFor(mlvl) * 10) / 10,
    armor: Math.round((difficultyDef(diff).mobArmor ?? 0) * 100),
  };
};

// The per-kill golden-arrow drop chance at `diff` (mirrors the calculator).
const arrowDropProb = (diff) => {
  const d = difficultyDef(diff);
  const dropChance = Math.min(
    1,
    LOOT.dropChance + d.dropChanceBonus + STATS.dropChancePerLuck * 0,
  );
  return dropChance * (1 - LOOT.nukeShare) * LOOT.arrowShare * d.arrowDropMult;
};
// The roster as [enemyDef, scaled head-count] (minDifficulty-gated).
const rosterEntries = (def, diff) => {
  const out = [];
  for (const s of def.spawns ?? [])
    if (meetsMinDifficulty(diff, s.minDifficulty))
      out.push([
        enemyDef(s.enemy),
        scaledMobCount("count" in s ? s.count : 1, diff),
      ]);
  for (const e of def.waves?.budget ?? [])
    if (meetsMinDifficulty(diff, e.minDifficulty))
      out.push([enemyDef(e.enemy), scaledMobCount(e.count, diff)]);
  return out;
};

// ---- walk the campaign kill-by-kill ----
const rows = [];
let level = 1;
let xp = 0;
let cumKills = 0;
let bucketKills = 0;
let heroLevelSum = 0;
let bucketDiff = null;
let bucketLevel = null;
const advance = (diff) => {
  while (level < LEVELING.maxLevel && xp >= xpToLevelUp(level, diff)) {
    xp -= xpToLevelUp(level, diff);
    level++;
  }
};
const flush = () => {
  if (bucketKills === 0) return;
  const hl = heroLevelSum / bucketKills;
  rows.push({
    kind: "mob-avg",
    difficulty: bucketDiff,
    levelId: bucketLevel,
    cumKills,
    heroLevel: Math.round(hl * 10) / 10,
    ...mobStats(Math.round(hl), bucketDiff),
  });
  bucketKills = 0;
  heroLevelSum = 0;
};

for (const diff of PATH) {
  if (TIER_ENTRY[diff] !== undefined && level < TIER_ENTRY[diff]) {
    level = TIER_ENTRY[diff];
    xp = 0;
  }
  const pArrow = arrowDropProb(diff);
  for (const id of LEVEL_ORDER) {
    if (bucketDiff !== null && (diff !== bucketDiff || id !== bucketLevel))
      flush();
    bucketDiff = diff;
    bucketLevel = id;
    const cap = LEVELS[id].loot.arrowCapByDifficulty?.[diff];
    const mapCap = xpLevelCap(id, diff);
    for (const [e, count] of rosterEntries(LEVELS[id], diff)) {
      const isBoss = e.role !== "minion";
      for (let k = 0; k < count; k++) {
        cumKills++;
        // Bank the kill's XP (minion: level-priced; set piece: bar-share).
        const killXp = isBoss
          ? (e.xpBarShare ??
              (e.role === "boss"
                ? LEVELING.bossXpBarShare
                : LEVELING.eliteXpBarShare)) * xpToLevelUp(level, diff)
          : mobLevelXp(mobLevelFor(level, diff), level);
        const arrowPerDrop =
          cap !== undefined && level >= cap
            ? arrowColdXp(level)
            : arrowXpShareAt(level) * xpToLevelUp(level, diff);
        xp += (killXp + pArrow * arrowPerDrop) * xpCapMultiplier(level, mapCap);
        advance(diff);
        if (isBoss) {
          rows.push({
            kind: "boss",
            difficulty: diff,
            levelId: id,
            cumKills,
            heroLevel: level,
            ...mobStats(level, diff),
          });
        } else {
          bucketKills++;
          heroLevelSum += level;
          if (bucketKills >= bucketSize) flush();
        }
      }
    }
  }
}
flush();

// ---- emit CSV ----
const header =
  "kind,difficulty,levelId,cumKills,heroLevel,mobLevel,mobHp,mobContactDmg,mobArmorPct";
const csv = [header]
  .concat(
    rows.map((r) =>
      [
        r.kind,
        r.difficulty,
        r.levelId,
        r.cumKills,
        r.heroLevel,
        r.mlvl,
        r.hp,
        r.dmg,
        r.armor,
      ].join(","),
    ),
  )
  .join("\n");
if (outPath) {
  writeFileSync(outPath, csv + "\n");
  console.error(`wrote ${rows.length} rows → ${outPath}`);
} else {
  console.log(csv);
}
if (graphPath) {
  writeFileSync(graphPath, JSON.stringify(rows));
  console.error(`wrote ${rows.length}-row json → ${graphPath}`);
}
