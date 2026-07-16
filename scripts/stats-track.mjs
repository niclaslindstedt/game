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
//   node scripts/stats-track.mjs --out run.csv --graph run.html
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
const { mobArmorReduction } = await import(path.join(root, "src/game/loot.ts"));
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
    armor: Math.round(mobArmorReduction(mlvl, diff) * 100),
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
  writeFileSync(graphPath, buildChartHtml(rows));
  console.error(`wrote chart → ${graphPath}`);
}

// ---- self-contained HTML chart (inline SVG, theme-aware, no external hosts) ----
function buildChartHtml(allRows) {
  const line = allRows.filter((r) => r.kind === "mob-avg");
  const bosses = allRows.filter((r) => r.kind === "boss");
  const diffColor = {
    easy: "#57d97a",
    medium: "#8fd957",
    hard: "#d9c957",
    nightmare: "#d98a57",
    jesus: "#d9578a",
  };
  const metrics = [
    { key: "mlvl", label: "Mob level", accent: "#7aa8ff" },
    { key: "hp", label: "Mob health", accent: "#57d9c9" },
    { key: "dmg", label: "Mob contact damage", accent: "#d9a857", dec: 1 },
    { key: "armor", label: "Mob armor reduction (%)", accent: "#c98aff" },
  ];
  const W = 900;
  const H = 220;
  const pad = { l: 54, r: 16, t: 16, b: 30 };
  const xs = line.map((r) => r.cumKills);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const sx = (k) =>
    pad.l + ((k - xMin) / (xMax - xMin || 1)) * (W - pad.l - pad.r);
  // Difficulty bands: contiguous cumKills spans, one shaded rect each.
  const bands = [];
  for (const r of line) {
    const last = bands[bands.length - 1];
    if (last && last.diff === r.difficulty) last.x2 = r.cumKills;
    else bands.push({ diff: r.difficulty, x1: r.cumKills, x2: r.cumKills });
  }
  const chart = (m) => {
    const ys = line.map((r) => r[m.key]);
    const yMax = Math.max(...ys, 1) * 1.1;
    const sy = (v) => H - pad.b - (v / yMax) * (H - pad.t - pad.b);
    const band = bands
      .map(
        (b) =>
          `<rect x="${sx(b.x1).toFixed(1)}" y="${pad.t}" width="${(
            sx(b.x2) - sx(b.x1)
          ).toFixed(1)}" height="${H - pad.t - pad.b}" fill="${
            diffColor[b.diff]
          }" opacity="0.07"/>`,
      )
      .join("");
    const d = line
      .map(
        (r, i) =>
          `${i ? "L" : "M"}${sx(r.cumKills).toFixed(1)},${sy(r[m.key]).toFixed(
            1,
          )}`,
      )
      .join("");
    const dots = bosses
      .map(
        (r) =>
          `<circle cx="${sx(r.cumKills).toFixed(1)}" cy="${sy(r[m.key]).toFixed(
            1,
          )}" r="3" fill="${
            diffColor[r.difficulty]
          }" stroke="var(--panel)" stroke-width="1"/>`,
      )
      .join("");
    const ticks = [0, 0.5, 1]
      .map((f) => {
        const v = yMax * f;
        const y = sy(v).toFixed(1);
        return `<line x1="${pad.l}" y1="${y}" x2="${W - pad.r}" y2="${y}" stroke="var(--grid)"/><text x="${
          pad.l - 8
        }" y="${(+y + 4).toFixed(1)}" text-anchor="end" class="tick">${
          m.dec ? v.toFixed(m.dec) : Math.round(v)
        }</text>`;
      })
      .join("");
    return `<div class="card"><div class="title">${m.label}</div>
<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${m.label}">
${band}${ticks}
<path d="${d}" fill="none" stroke="${m.accent}" stroke-width="2" stroke-linejoin="round"/>
${dots}
</svg></div>`;
  };
  const legend = bands
    .filter((b, i, a) => a.findIndex((x) => x.diff === b.diff) === i)
    .map(
      (b) =>
        `<span class="lg"><i style="background:${diffColor[b.diff]}"></i>${
          b.diff
        }</span>`,
    )
    .join("");
  return `<meta charset="utf-8"><title>Horde stats across a run</title>
<style>
:root{--bg:#0e151f;--panel:#121a26;--ink:#e6edf6;--faint:#8aa0b8;--grid:#22303f}
@media (prefers-color-scheme: light){:root{--bg:#eef1f6;--panel:#fff;--ink:#1b2430;--faint:#5a6b7f;--grid:#dce3ec}}
:root[data-theme=light]{--bg:#eef1f6;--panel:#fff;--ink:#1b2430;--faint:#5a6b7f;--grid:#dce3ec}
:root[data-theme=dark]{--bg:#0e151f;--panel:#121a26;--ink:#e6edf6;--faint:#8aa0b8;--grid:#22303f}
body{margin:0;padding:22px;background:var(--bg);color:var(--ink);font:14px/1.4 system-ui,sans-serif}
h1{font-size:18px;margin:0 0 4px}p.sub{margin:0 0 18px;color:var(--faint)}
.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(360px,1fr))}
.card{background:var(--panel);border:1px solid var(--grid);border-radius:12px;padding:12px 12px 6px}
.card svg{width:100%;height:200px;overflow:visible}
.title{font-weight:600;margin-bottom:6px}
.tick{fill:var(--faint);font-size:11px}
.legend{margin:14px 0 0;display:flex;gap:16px;flex-wrap:wrap;color:var(--faint)}
.lg{display:inline-flex;align-items:center;gap:6px}.lg i{width:12px;height:12px;border-radius:3px;display:inline-block}
</style>
<h1>Horde stats across a run</h1>
<p class="sub">Averaged over ${bucketSize}-kill buckets along the critical path (${PATH.join(
    " → ",
  )}); dots mark elite/boss kills. X axis: cumulative kills.</p>
<div class="grid">${metrics.map(chart).join("")}</div>
<div class="legend">${legend}</div>`;
}
