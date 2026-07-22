#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// MOB DIFFICULTY CURVE — the "how many hits does a mob take?" analysis.
//
// Answers the balance question the menace complaint raised: over the whole
// game, does a rank-and-file mob require MORE hits to kill, or does the hero
// out-scale it into one-shot territory (which pins the rampage meter at its
// cap)? For each difficulty it walks hero level 1→cap and records, off the
// REAL engine rules:
//   - the horde's monster level and a REFERENCE minion's hp (`refMobHp` on the
//     shared per-level hp ramp — the same "typical minion" the leveling curve
//     is authored against, so the curve is smooth, not a random spawn sample),
//   - the mob's physical armor reduction,
//   - the hero's real per-hit / DPS output at that level, with the gear the
//     analytic progression sim (src/sim/analytic.ts) actually equipped,
//   - HITS REQUIRED to fell one reference minion (mobHp ÷ the hero's landed
//     blow after mob armor) — the headline number, "4.7 hits to kill".
//
// Writes a console table and a self-contained HTML graph (no external hosts):
//   node scripts/mob-hp-curve.mjs                       # every difficulty → mob-hp-curve.html
//   node scripts/mob-hp-curve.mjs --difficulty easy,jesus
//   node scripts/mob-hp-curve.mjs --html out.html --to 70
//   node scripts/mob-hp-curve.mjs --no-unique --no-legendary --no-sets  # NORMAL gear only
//
// The `--no-unique` / `--no-legendary` / `--no-sets` / `--no-artifact` flags
// tell the geared hero to LEAVE those tiers on the ground — so the curve reads
// the hero on everyday magic/rare loot, which is what the mob-hp balance is
// calibrated against (named drops are meant to be a BONUS spike, not the
// baseline the horde is tuned to).
//
// The hero damage assumes a PHYSICAL (melee/ranged) weapon for the armor cut;
// a magic build ignores mob armor and needs a touch fewer hits.

import { writeFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

register("./game-alias-loader.mjs", import.meta.url);

const load = (rel) => import(pathToFileURL(path.join(root, rel)).href);

const { simulateProgression } = await load("src/sim/analytic.ts");
const { DIFFICULTY_ORDER } = await load("src/game/defs/difficulties.ts");
const { mobHpScaleFor, mobLevelFor } = await load("src/game/menace.ts");
const { mobArmorReduction } = await load("src/game/loot.ts");
const { LEVELING } = await load("src/game/config/index.ts");
const { STAT_BUILDS } = await load("src/game/builds.ts");

// ---- Flags ---------------------------------------------------------------------

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const flag = (name) => argv.includes(`--${name}`);

if (flag("help")) {
  console.log(
    "usage: node scripts/mob-hp-curve.mjs " +
      "[--difficulty all|easy[,jesus,…]] [--to 70] [--seed N] [--html out.html] " +
      "[--class melee|ranged|magic|balanced] " +
      "[--no-unique] [--no-legendary] [--no-sets] [--no-artifact]\n\n" +
      "--class picks the stat-distribution build the geared hero levels as (default: a\n" +
      "        neutral bruiser). It changes the hero's per-hit/dps and the gear the\n" +
      "        auto-equip wears, so the hits-to-kill curve reflects that build.",
  );
  process.exit(0);
}

// The stat-distribution build the geared hero levels as (default: the analytic
// sim's neutral bruiser weights). Validated against the shared catalog.
const heroClass = opt("class");
if (heroClass !== undefined && !STAT_BUILDS.includes(heroClass)) {
  console.error(
    `unknown class "${heroClass}" — expected one of ${STAT_BUILDS.join(", ")}`,
  );
  process.exit(1);
}

// Named tiers the hero refuses to equip (NORMAL-gear calibration).
const excludeTiers = [];
if (flag("no-unique")) excludeTiers.push("unique");
if (flag("no-legendary")) excludeTiers.push("legendary");
if (flag("no-sets") || flag("no-set")) excludeTiers.push("set");
if (flag("no-artifact") || flag("no-artifacts")) excludeTiers.push("artifact");

const difficulties =
  opt("difficulty", "all") === "all"
    ? DIFFICULTY_ORDER
    : opt("difficulty", "all").split(",");
const toLevel = Number(opt("to", 72));
const seed = Number(opt("seed", 1));
const htmlPath = opt("html", "mob-hp-curve.html");

// ---- Gather one row per hero level, per difficulty ------------------------------

// A reference minion's hp at a hero level: the same `refMobHp × mobHpScaleFor`
// unit the kills-per-level curve is authored against (a smooth "typical mob",
// not a random per-spawn sample).
function refMobHpAt(level, difficulty) {
  return LEVELING.refMobHp * mobHpScaleFor(level, difficulty);
}

// The realistic HERO-LEVEL band each rung is actually PLAYED over (its unlock
// entry to roughly its XP-cap exit): the isolated sim would start nightmare/
// jesus NAKED at level 1 against level-38/58 mobs, which never happens in play
// (you arrive geared and levelled). Restricting each rung's curve to its band
// keeps the graph truthful — the campaign hero, not a warped one.
const REALISTIC_BAND = {
  easy: [1, 40],
  medium: [1, 42],
  hard: [1, 42],
  nightmare: [33, 58],
  jesus: [54, LEVELING.maxLevel],
};

const series = {};

for (const difficulty of difficulties) {
  // Each rung ISOLATED (no cross-tier carry — that over-farms and over-levels,
  // poisoning the per-tier level read). Within a rung the hero still gears up
  // from its own drops, so by the time he reaches the rung's realistic BAND he
  // carries level-appropriate gear; the band filter drops only the unreachable
  // naked-start rows (a level-1 hero was never really on jesus).
  const report = simulateProgression({
    difficulties: [difficulty],
    seed,
    build: heroClass,
    targetLevel: Math.min(LEVELING.maxLevel, toLevel + 4),
    excludeTiers,
  });
  const byLevel = new Map();
  for (const cp of report.checkpoints) {
    if (!byLevel.has(cp.heroLevel)) byLevel.set(cp.heroLevel, cp);
  }
  const [bandLo, bandHi] = REALISTIC_BAND[difficulty] ?? [1, toLevel];

  const rows = [];
  for (const [level, cp] of [...byLevel].sort((a, b) => a[0] - b[0])) {
    if (level > toLevel) break;
    if (level < bandLo || level > bandHi) continue;
    if (cp.perHit <= 0) continue;
    const mobLevel = mobLevelFor(level, difficulty);
    const mobHp = refMobHpAt(level, difficulty);
    const armorRed = mobArmorReduction(mobLevel, difficulty);
    const landedBlow = cp.perHit * (1 - armorRed); // physical assumption
    const hits = landedBlow > 0 ? mobHp / landedBlow : 0;
    const hitsNoArmor = cp.perHit > 0 ? mobHp / cp.perHit : 0;
    rows.push({
      level,
      mobLevel,
      mobHp: Math.round(mobHp),
      armorRed,
      perHit: cp.perHit,
      dps: cp.dps,
      hits,
      hitsNoArmor,
      weapon: cp.weapon,
      weaponTier: cp.weaponTier,
    });
  }
  series[difficulty] = rows;
}

// ---- Console table --------------------------------------------------------------

console.log(
  `Hero build: ${heroClass ?? "default (neutral bruiser)"} · ` +
    (excludeTiers.length
      ? `gear: NORMAL only (leaving on the ground: ${excludeTiers.join(", ")})`
      : "gear: ALL tiers (named drops included)"),
);

for (const difficulty of difficulties) {
  const rows = series[difficulty];
  console.log(
    `\n=== ${difficulty.toUpperCase()} — hits to kill a reference minion ===`,
  );
  console.log(
    "Lvl  mobLvl   mobHp   armor%   perHit      dps    HITS   (no-armor)  weapon",
  );
  console.log("-".repeat(92));
  for (const r of rows) {
    if (
      r.level % 3 !== 0 &&
      r.level !== 1 &&
      r.level !== rows[rows.length - 1].level
    )
      continue;
    console.log(
      String(r.level).padStart(3),
      String(r.mobLevel).padStart(6),
      String(r.mobHp).padStart(8),
      (r.armorRed * 100).toFixed(0).padStart(6),
      String(Math.round(r.perHit)).padStart(8),
      String(Math.round(r.dps)).padStart(9),
      r.hits.toFixed(1).padStart(7),
      r.hitsNoArmor.toFixed(1).padStart(10),
      "  " + r.weapon,
    );
  }
}

// ---- Self-contained HTML graph --------------------------------------------------

const ACCENTS = {
  easy: "#7ef0c8",
  medium: "#4da6ff",
  hard: "#ffd75e",
  nightmare: "#ff8c42",
  jesus: "#d83a3a",
};

function buildHtml() {
  const data = JSON.stringify(
    difficulties.map((d) => ({
      diff: d,
      color: ACCENTS[d] ?? "#4da6ff",
      rows: series[d],
    })),
  );
  return `<!doctype html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Mob difficulty curve — hits to kill</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; background:#0e1116; color:#e8edf2;
    font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; padding:24px; }
  h1 { font-size:18px; margin:0 0 4px; }
  p.sub { color:#8b98a5; margin:0 0 20px; max-width:70ch; }
  .grid { display:grid; gap:28px; grid-template-columns:repeat(auto-fit,minmax(440px,1fr)); }
  .card { background:#161b22; border:1px solid #232a33; border-radius:10px; padding:16px 16px 8px; }
  .card h2 { font-size:14px; margin:0 0 10px; font-weight:600; }
  svg { width:100%; height:300px; display:block; overflow:visible; }
  .legend { display:flex; flex-wrap:wrap; gap:14px; margin:14px 0 0; }
  .legend span { display:inline-flex; align-items:center; gap:6px; color:#b6c2cf; font-size:12px; }
  .legend i { width:14px; height:3px; border-radius:2px; display:inline-block; }
  .axis { stroke:#2b333d; stroke-width:1; }
  .grid-line { stroke:#1c222a; stroke-width:1; }
  .tick { fill:#6b7683; font-size:10px; }
  .target { stroke:#5b6673; stroke-width:1; stroke-dasharray:4 4; }
</style></head><body>
<h1>Mob difficulty curve — how many hits to kill a mob</h1>
<p class="sub">Hits required to fell a reference minion (its hp ÷ the hero's landed blow after mob armor),
across hero level. The hero is geared by the analytic progression sim. A rising line means mobs
demand more hits as the game goes on; a line pinned near the bottom means the hero one-shots the
horde (which pins the rampage meter at its cap). Dashed line = the ~10-hits target.</p>
<div class="grid">
  <div class="card"><h2>Hits to kill (after mob armor)</h2><svg id="hits"></svg></div>
  <div class="card"><h2>Reference mob hp vs hero damage per hit</h2><svg id="hp"></svg></div>
  <div class="card"><h2>Mob armor reduction (physical)</h2><svg id="armor"></svg></div>
  <div class="card"><h2>Hits to kill — log scale</h2><svg id="hitslog"></svg></div>
</div>
<div class="legend" id="legend"></div>
<script>
const DATA = ${data};
const M = {l:48,r:16,t:12,b:28};
function draw(svgId, pick, {log=false, target=null, ymin=0}={}) {
  const svg = document.getElementById(svgId);
  const W = svg.clientWidth || 440, H = 300;
  const iw = W-M.l-M.r, ih = H-M.t-M.b;
  let xmax=1, ymax=0.0001;
  for (const s of DATA) for (const r of s.rows) {
    xmax=Math.max(xmax,r.level);
    const v=pick(r); if(isFinite(v)) ymax=Math.max(ymax,v);
  }
  const ylo = log ? Math.max(0.05, ymin||0.05) : (ymin||0);
  ymax = log ? ymax*1.3 : ymax*1.08;
  const X = l => M.l + (l/xmax)*iw;
  const Y = v => {
    if (log) {
      const a=Math.log10(ylo), b=Math.log10(ymax);
      return M.t + ih - ((Math.log10(Math.max(ylo,v))-a)/(b-a))*ih;
    }
    return M.t + ih - ((v-ylo)/(ymax-ylo))*ih;
  };
  let out='';
  // grid + y ticks
  const ticks = log ? logTicks(ylo,ymax) : linTicks(ylo,ymax,5);
  for (const t of ticks) {
    out+='<line class="grid-line" x1="'+M.l+'" y1="'+Y(t)+'" x2="'+(W-M.r)+'" y2="'+Y(t)+'"/>';
    out+='<text class="tick" x="'+(M.l-6)+'" y="'+(Y(t)+3)+'" text-anchor="end">'+fmt(t)+'</text>';
  }
  // x ticks
  for (let l=10;l<=xmax;l+=10){
    out+='<text class="tick" x="'+X(l)+'" y="'+(H-8)+'" text-anchor="middle">'+l+'</text>';
  }
  out+='<line class="axis" x1="'+M.l+'" y1="'+(M.t+ih)+'" x2="'+(W-M.r)+'" y2="'+(M.t+ih)+'"/>';
  if (target!=null) out+='<line class="target" x1="'+M.l+'" y1="'+Y(target)+'" x2="'+(W-M.r)+'" y2="'+Y(target)+'"/>';
  for (const s of DATA) {
    let d='';
    s.rows.forEach((r,i)=>{ const v=pick(r); if(!isFinite(v))return; d+=(d?'L':'M')+X(r.level)+' '+Y(v)+' '; });
    out+='<path d="'+d+'" fill="none" stroke="'+s.color+'" stroke-width="2"/>';
  }
  svg.innerHTML=out;
}
function linTicks(lo,hi,n){const out=[];for(let i=0;i<=n;i++)out.push(lo+(hi-lo)*i/n);return out;}
function logTicks(lo,hi){const out=[];for(let e=Math.floor(Math.log10(lo));e<=Math.ceil(Math.log10(hi));e++){for(const m of [1,2,5]){const v=m*Math.pow(10,e); if(v>=lo&&v<=hi)out.push(v);}}return out;}
function fmt(v){ if(v>=1000)return (v/1000).toFixed(v>=10000?0:1)+'k'; if(v>=10)return v.toFixed(0); if(v>=1)return v.toFixed(1); return v.toFixed(2);}
draw('hits', r=>r.hits, {target:10});
draw('hitslog', r=>r.hits, {log:true, target:10});
draw('armor', r=>r.armorRed*100);
// hp vs damage: two implicit series per difficulty is noisy; show ratio-free by
// plotting mob hp and perHit for the FIRST difficulty pair via a combined draw.
(function(){
  const svg=document.getElementById('hp'); const W=svg.clientWidth||440,H=300;
  const iw=W-M.l-M.r, ih=H-M.t-M.b;
  let xmax=1,ymax=0.0001;
  for(const s of DATA)for(const r of s.rows){xmax=Math.max(xmax,r.level);ymax=Math.max(ymax,r.mobHp,r.perHit);}
  const ylo=0.5; ymax*=1.3;
  const X=l=>M.l+(l/xmax)*iw;
  const Y=v=>{const a=Math.log10(ylo),b=Math.log10(ymax);return M.t+ih-((Math.log10(Math.max(ylo,v))-a)/(b-a))*ih;};
  let out='';
  for(const t of logTicks(ylo,ymax)){out+='<line class="grid-line" x1="'+M.l+'" y1="'+Y(t)+'" x2="'+(W-M.r)+'" y2="'+Y(t)+'"/>';out+='<text class="tick" x="'+(M.l-6)+'" y="'+(Y(t)+3)+'" text-anchor="end">'+fmt(t)+'</text>';}
  for(let l=10;l<=xmax;l+=10)out+='<text class="tick" x="'+X(l)+'" y="'+(H-8)+'" text-anchor="middle">'+l+'</text>';
  for(const s of DATA){
    let dh='',dp='';
    s.rows.forEach(r=>{dh+=(dh?'L':'M')+X(r.level)+' '+Y(r.mobHp)+' ';dp+=(dp?'L':'M')+X(r.level)+' '+Y(r.perHit)+' ';});
    out+='<path d="'+dh+'" fill="none" stroke="'+s.color+'" stroke-width="2"/>';
    out+='<path d="'+dp+'" fill="none" stroke="'+s.color+'" stroke-width="1.5" stroke-dasharray="3 3" opacity="0.8"/>';
  }
  svg.innerHTML=out;
})();
const leg=document.getElementById('legend');
leg.innerHTML=DATA.map(s=>'<span><i style="background:'+s.color+'"></i>'+s.diff.toUpperCase()+'</span>').join('')
  +'<span style="color:#8b98a5">solid = hits / mob hp · dashed = hero per-hit</span>';
</script></body></html>`;
}

writeFileSync(htmlPath, buildHtml());
console.log(`\nWrote ${htmlPath}`);
