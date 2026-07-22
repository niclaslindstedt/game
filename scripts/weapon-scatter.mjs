#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// NAMED-WEAPON SCATTER ANALYSIS (see the `weapon-system` skill). The other
// weapon scripts audit the ROLLED economy (`weapon-budget.mjs` — every base on
// its damage line; `weapon-stats.mjs` — class ladders; `weapon-ilvl.mjs` —
// the unique ilvl/budget cap). This one takes the opposite cut: it looks at the
// hand-authored NAMED weapon drops — the uniques, the legendaries, the
// artifacts, and the set signature weapons — as a POPULATION, and plots each
// one against its equip requirement so an outlier is a dot off the cloud.
//
// It answers "do we have any crazy overpowered weapons?" by measuring, for each
// named weapon, the EFFECTIVE DPS a fresh drop delivers to a neutral hero — the
// damage-budget model (`weapon-budget.mjs`), extended to fold in the two
// intrinsic damage multipliers a NAMED weapon carries that a plain base doesn't:
//
//     effDps = base.damage
//              × (1 + Σ damagePct)                                // the weapon's +%dmg bonus
//              × (1 + WEAPON.damagePerIlvl·max(0, ilvl − req))    // ilvl scales the base blow
//              × 1000/cooldown × assumedTargets × critLift(chance)// budget normalization,
//                                                                 //   crit priced at the
//                                                                 //   weapon's own +crit
//
// (neutral hero: no picked-up stats, baseRoll 1, quality 1 — the weapon's OWN
// power only). STAT GRANTS (a +50 STR that also multiplies these hits), PROCS and
// GRANTED SPELLS are deliberately LEFT OUT of effDps — the stat grant has its own
// chart, and procs/spells can't be priced here — so effDps is a LOWER bound.
//
// The headline metric is the POWER SPIKE = effDps / budget(REQ): how hard the
// drop hits for the level you can actually equip it. A named weapon is meant to
// punch above its equip gate (its ilvl sits above req), so > 1 is by design —
// and ARTIFACTS (endgame) are meant to spike hardest, legendaries next. So raw
// power is NOT the flag: a weapon is called an ANOMALY only when it out-spikes
// its OWN tier's median by ≥ ANOMALY_FACTOR (1.5×) — a low-req unique hitting
// like endgame gear, or an artifact hot even among artifacts. The two mechanisms
// that inflate a spike are surfaced as columns: the ilvl base-damage scaling
// (`ilvlx`) and the damagePct double-count (`dmgx` — a +%dmg bonus both raises
// the ilvl AND directly multiplies damage).
//
// Output: a self-contained multi-chart HTML page (x = Required Level on every
// chart; one scatter per stat + one for ilvl), plus a console over/under-power
// report. Runs on plain `node` via type stripping.
//
//   node scripts/weapon-scatter.mjs                 # write the page + print the report
//   node scripts/weapon-scatter.mjs --out page.html # choose the output path
//   node scripts/weapon-scatter.mjs --body-only     # emit only the inner markup (for embedding)
//   node scripts/weapon-scatter.mjs --json          # dump the computed rows as JSON, no page

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

const { WEAPON_DEFS, weaponAssumedTargets, baseCritMult, isWeaponDef } =
  await import(path.join(root, "src/game/defs/equipment.ts"));
const { UNIQUE_DEFS } = await import(
  path.join(root, "src/game/defs/uniques.ts")
);
const { WEAPON } = await import(path.join(root, "src/game/config.ts"));
const { DIFFICULTY_DEFS } = await import(
  path.join(root, "src/game/defs/difficulties.ts")
);

// ---- The budget model (shared with weapon-budget.mjs) -----------------------

const BASE = 40; // effective DPS owed at levelReq 1
const PER_LEVEL = 4; // + this per level of requirement
const SPECIAL_PREMIUM = 1.15; // named/story weapons run this much hot on purpose
const REF_CRIT = 0.15; // the reference crit chance the lift is priced at
// Artifacts (endgame) are SUPPOSED to be the strongest, and high-req legendaries
// next — so raw power is not "overpowered". We flag a weapon only when it is a
// standout WITHIN ITS OWN TIER: spike ≥ this × the tier's median spike. That
// leaves the tier ordering intact and surfaces the genuine anomalies (a low-req
// unique that hits like endgame gear; an artifact hot even for an artifact).
const ANOMALY_FACTOR = 1.5;
const COLD_RATIO = 1.05; // at/below its equip-gate budget = notably weak

const budgetFor = (level) => BASE + PER_LEVEL * (Math.max(1, level) - 1);
// Named weapons mint with a bigger crit chance than the reference (their own
// +crit bonus), so the lift they enjoy is priced at that raised chance.
const critLiftAt = (def, critChance) =>
  1 + critChance * (baseCritMult(def) - 1);

// STRENGTH scales melee & ranged damage, INTELLIGENCE scales magic (DAMAGE_STAT
// in items.ts).
const DAMAGE_STAT = {
  melee: "strength",
  ranged: "strength",
  magic: "intelligence",
};

// Bases the damage-budget model exempts (weapon-budget.mjs): the difficulty
// ladder's starter weapons and the fallback sidearm sit intentionally off the
// budget line, so a unique built on one (EXCALIBUR → medieval_sword) reads hot
// only because its BASE is off-budget, not its bonuses. Mark those so the report
// can caveat them.
const EXEMPT_BASES = new Set([
  "blaster",
  "soggy_cardboard_sword",
  "busted_flamethrower",
  "cybervan_wiper",
  ...Object.values(DIFFICULTY_DEFS).map((d) => d.startingWeapon),
]);

// ---- Build the population ----------------------------------------------------

// NOTE on "sets": a boss's green SET (defs/sets.ts) is armor-only; its on-theme
// SIGNATURE weapon is kept as a plain `tier: "unique"` (there is no weapon "set"
// tier), so set signature weapons appear here under the `unique` tier — the
// three weapon tiers that actually mint are unique / legendary / artifact.
const rows = [];
for (const u of Object.values(UNIQUE_DEFS)) {
  if (u.slot !== "weapon" || !isWeaponDef(u.base)) continue;
  const def = WEAPON_DEFS[u.base];
  if (!def) continue;
  const req = def.levelReq;
  const ilvl = u.ilvl;
  const cls = def.class;
  const damageStat = DAMAGE_STAT[cls];

  let damagePct = 0;
  let critBonus = 0;
  let maxHp = 0;
  let ownDamageStatPts = 0;
  let totalStatPts = 0;
  let scalingPct = 0;
  for (const b of u.bonuses) {
    if (b.kind === "damagePct") damagePct += b.value;
    else if (b.kind === "crit") critBonus += b.value;
    else if (b.kind === "maxHp") maxHp += b.value;
    else if (b.kind === "stat") {
      totalStatPts += b.value;
      if (b.stat === damageStat) ownDamageStatPts += b.value;
    } else if (b.kind === "statPct" || b.kind === "maxHpPct") {
      scalingPct += b.value;
    }
  }

  // The weapon's INTRINSIC damage multiplier: its flat +% damage only. Stat
  // GRANTS (e.g. +50 STR) also boost this weapon's hits, but they're a separate
  // axis with their own chart — folding them here would double-represent them —
  // so the DPS metric stays "what the weapon's own damage bonuses do".
  const dmgMult = 1 + damagePct;
  const ilvlMult = 1 + WEAPON.damagePerIlvl * Math.max(0, ilvl - req);
  const targets = weaponAssumedTargets(def);
  const critChance = Math.min(1, REF_CRIT + critBonus);
  const lift = critLiftAt(def, critChance);
  const baseLift = critLiftAt(def, REF_CRIT);
  // NOTE: procs (bolt/nova) and granted spells (storm) add real, often large DPS
  // that this figure does NOT model — so for the proc-laden artifacts effDps is
  // a LOWER bound on true output.
  const hasProc = u.bonuses.some(
    (b) => b.kind === "proc" || b.kind === "spell",
  );

  const perHit = def.damage * dmgMult * ilvlMult; // neutral-hero per-blow average
  const effDps = ((perHit * 1000) / def.cooldownMs) * targets * lift;
  const baseEffDps =
    ((def.damage * 1000) / def.cooldownMs) * targets * baseLift; // catalog base
  const spike = effDps / budgetFor(req); // power delivered at the equip gate, × budget

  rows.push({
    id: u.id,
    name: u.name,
    tier: u.tier ?? "unique",
    base: u.base,
    baseExempt: EXEMPT_BASES.has(u.base),
    hasProc,
    class: cls,
    req,
    ilvl,
    cooldownMs: def.cooldownMs,
    targets,
    ilvlMult: +ilvlMult.toFixed(2),
    dmgMult: +dmgMult.toFixed(2),
    damage: Math.round(perHit), // per-hit (neutral)
    effDps: +effDps.toFixed(1),
    baseEffDps: +baseEffDps.toFixed(1),
    spike: +spike.toFixed(2),
    damagePct: +damagePct.toFixed(2),
    critBonus: +critBonus.toFixed(2),
    maxHp,
    ownDamageStatPts,
    totalStatPts,
    scalingPct: +scalingPct.toFixed(3),
  });
}
rows.sort((a, b) => a.req - b.req || a.ilvl - b.ilvl);

// Tier-relative anomaly: a weapon is flagged only if it out-spikes its OWN
// tier's median — so "artifacts are strong" is expected, but "this unique spikes
// like an artifact" (or "this artifact is hot even for an artifact") is caught.
const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  const n = s.length;
  return n === 0 ? 0 : n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};
const tierSpikes = {};
for (const r of rows) (tierSpikes[r.tier] ??= []).push(r.spike);
const tierMedian = {};
for (const t of Object.keys(tierSpikes))
  tierMedian[t] = +median(tierSpikes[t]).toFixed(2);
for (const r of rows) {
  r.tierMedian = tierMedian[r.tier];
  r.tierRatio = +(r.spike / (tierMedian[r.tier] || 1)).toFixed(2); // spike vs tier-typical
  r.anomaly = r.spike >= tierMedian[r.tier] * ANOMALY_FACTOR;
}

// ---- Console over/under-power report -----------------------------------------

function report() {
  const byTier = {};
  for (const r of rows) (byTier[r.tier] ??= []).push(r);
  const anomalies = rows.filter((r) => r.anomaly);
  const cold = rows
    .filter((r) => r.spike <= COLD_RATIO)
    .sort((a, b) => a.spike - b.spike);

  console.log(`Named weapon population: ${rows.length}`);
  for (const t of TIER_ORDER)
    if (byTier[t])
      console.log(
        `  ${t}: ${byTier[t].length}  (median spike ×${tierMedian[t].toFixed(2)})`,
      );
  console.log(
    "\nEffective DPS = neutral-hero per-hit × 1000/cd × assumedTargets × critLift,",
  );
  console.log(
    "folding the weapon's own +% damage AND +crit bonuses AND its ilvl base-damage scaling",
  );
  console.log(
    "(stat grants, procs and granted spells are NOT in it — so it's a lower bound).",
  );
  console.log(
    "spike = effDps / budget(REQ) — power delivered at the level you can equip it.",
  );
  console.log(
    `Artifacts (endgame) SHOULD spike highest, legendaries next — so a weapon is flagged only`,
  );
  console.log(
    `as an ANOMALY: spike ≥ ${ANOMALY_FACTOR}× its OWN tier's median (tierRatio ≥ ${ANOMALY_FACTOR}).\n`,
  );

  const w = (s, n) => String(s).padStart(n);
  const wl = (s, n) => String(s).padEnd(n);
  console.log(
    "  " +
      [
        wl("weapon", 22),
        wl("tier", 10),
        wl("cls", 7),
        w("req", 4),
        w("ilvl", 5),
        w("ilvlx", 6),
        w("dmgx", 5),
        w("effDps", 7),
        w("spike", 6),
        w("tierX", 6),
      ].join(" "),
  );
  for (const r of [...rows].sort((a, b) => b.tierRatio - a.tierRatio)) {
    const flag =
      (r.anomaly ? "  ⚠ ANOMALY" : r.spike <= COLD_RATIO ? "  · weak" : "") +
      (r.baseExempt ? " [starter base]" : "") +
      (r.hasProc ? " [+proc/spell]" : "");
    console.log(
      "  " +
        [
          wl(r.id, 22),
          wl(r.tier, 10),
          wl(r.class, 7),
          w(r.req, 4),
          w(r.ilvl, 5),
          w(r.ilvlMult.toFixed(2), 6),
          w(r.dmgMult.toFixed(2), 5),
          w(r.effDps.toFixed(0), 7),
          w(r.spike.toFixed(2), 6),
          w("×" + r.tierRatio.toFixed(2), 6),
        ].join(" ") +
        flag,
    );
  }

  console.log(
    `\n${anomalies.length} flagged as TIER ANOMALIES (spike ≥ ${ANOMALY_FACTOR}× their tier median):`,
  );
  for (const t of TIER_ORDER) {
    const list = anomalies
      .filter((r) => r.tier === t)
      .sort((a, b) => b.tierRatio - a.tierRatio);
    if (!list.length) continue;
    console.log(`  ${t} (median ×${tierMedian[t].toFixed(2)}):`);
    for (const r of list)
      console.log(
        `    ⚠ ${wl(r.name, 22)} req ${w(r.req, 3)} ilvl ${w(r.ilvl, 3)}  spike ×${r.spike.toFixed(1)} = ${r.tierRatio.toFixed(1)}× tier` +
          (r.baseExempt ? "  (starter base)" : "") +
          (r.hasProc ? "  (+proc/spell)" : ""),
      );
  }
  if (!anomalies.length)
    console.log("  none — every tier's members sit in a tight band.");
  if (cold.length) {
    console.log(
      `\n${cold.length} at/under their equip-gate budget (spike ≤ ${COLD_RATIO}×):`,
    );
    for (const r of cold)
      console.log(
        `  · ${wl(r.name, 22)} ${wl(r.tier, 10)} ×${r.spike.toFixed(2)}`,
      );
  }
}

// ---- HTML page ---------------------------------------------------------------

// Charts: each is x = Required Level, y = the named field. The first is ilvl
// (explicitly requested); "effDps" carries the budget reference line.
const CHARTS = [
  {
    key: "effDps",
    label: "Effective DPS",
    desc: "Neutral-hero DPS a fresh drop delivers (folds +%damage, +crit, and ilvl base-damage scaling; excludes stat grants, procs & spells). Amber line = budget owed at that Required Level; dashed = the ×1.15 named premium.",
    budget: true,
  },
  {
    key: "ilvl",
    label: "Item level (ilvl)",
    desc: "Authored power/drop-odds level. Sits above Required Level by design — the wider the gap, the more the ilvl scaling multiplies the base blow (0.02× per level over req).",
    diag: true,
  },
  {
    key: "spike",
    label: "Power spike (effDps ÷ budget @ Required Level)",
    desc: "How hard the drop hits for the level you can wear it. 1.0 = on the equip-gate budget, 1.15 = the named premium. A red ring marks a TIER ANOMALY — a weapon spiking ≥ 1.5× its own tier's median (endgame artifacts being strong is expected; a low unique hitting like one is not).",
    refLine: 1.15,
  },
  {
    key: "damage",
    label: "Per-hit damage",
    desc: "Average damage of a single blow to a neutral hero (folds +%damage + ilvl scaling), before AoE and crit.",
  },
  {
    key: "damagePct",
    label: "+% Damage bonus",
    desc: "Flat additive damage multiplier from the bonus block. Cheap in ilvl (STRENGTH floods the same multiplier), so a big number here compounds with the ilvl scaling it also buys — the double-count.",
  },
  {
    key: "totalStatPts",
    label: "Total stat points",
    desc: "Sum of all flat stat bonuses (STR/DEX/INT/…). A big damage-stat grant (e.g. +50 STR) also multiplies this weapon's own hits — power the effDps chart deliberately leaves out.",
  },
  {
    key: "critBonus",
    label: "+Crit chance",
    desc: "Flat crit-chance bonus from the bonus block (0.24 = +24%).",
  },
  {
    key: "maxHp",
    label: "+Max HP",
    desc: "Flat max-HP bonus carried by the weapon (negative = a glass-cannon downside).",
  },
];

const TIER_ORDER = ["unique", "legendary", "artifact"];
const TIER_LABEL = {
  unique: "Unique",
  legendary: "Legendary",
  artifact: "Artifact",
};

function esc(s) {
  return String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
}

function bodyMarkup() {
  const anomalies = rows
    .filter((r) => r.anomaly)
    .sort((a, b) => b.tierRatio - a.tierRatio);
  const data = JSON.stringify({
    rows,
    charts: CHARTS,
    tierOrder: TIER_ORDER,
    tierLabel: TIER_LABEL,
    tierMedian,
    budgetFor: { BASE, PER_LEVEL, SPECIAL_PREMIUM },
  });

  const tierBlocks = TIER_ORDER.map((t) => {
    const list = anomalies.filter((r) => r.tier === t);
    if (!list.length) return "";
    const items = list
      .map(
        (r) =>
          `<li><strong>${esc(r.name)}</strong> — req ${r.req}, ilvl ${r.ilvl}, <b>${r.effDps.toFixed(0)}</b> eff DPS = spike <span class="ratio">×${r.spike.toFixed(1)}</span> (<b>${r.tierRatio.toFixed(1)}×</b> the tier median)${r.baseExempt ? " <em>(starter base — off-budget)</em>" : ""}${r.hasProc ? " <em>(+uncounted proc/spell)</em>" : ""}</li>`,
      )
      .join("\n");
    return `<div class="tblock"><h3><span class="chip chip-${t}">${esc(TIER_LABEL[t])}</span> <span class="tmed">tier median spike ×${tierMedian[t].toFixed(2)}</span></h3><ul class="hotlist">${items}</ul></div>`;
  }).join("\n");
  const anyBlocks = tierBlocks.trim()
    ? tierBlocks
    : `<p class="sub">None — every tier's members sit in a tight band.</p>`;

  return `<div class="viz-root">
  <header class="viz-head">
    <h1>Named Weapon Analysis</h1>
    <p class="sub">${rows.length} hand-authored weapon drops — uniques, legendaries, artifacts &amp; set signatures — plotted against their equip requirement. Every chart shares one x-axis: <strong>Required Level</strong>.</p>
    <div class="legend" id="legend"></div>
  </header>

  <section class="callout">
    <h2>Overpowered — for their tier?</h2>
    <p class="sub">Artifacts (endgame) are <em>meant</em> to spike hardest, legendaries next — so raw power isn't the flag. A weapon is called out only when it out-spikes <strong>its own tier's median by ≥ ${ANOMALY_FACTOR}×</strong> — a genuine anomaly (a low unique hitting like endgame gear, or an artifact hot even among artifacts):</p>
    ${anyBlocks}
  </section>

  <div class="grid" id="charts"></div>

  <details class="tablewrap">
    <summary>Data table (${rows.length} rows)</summary>
    <div class="scroll"><table id="datatable"></table></div>
  </details>

  <div class="tooltip" id="tt" hidden></div>
  <script id="viz-data" type="application/json">${data}</script>
  <script>${CLIENT_JS}</script>
</div>`;
}

const CLIENT_JS = String.raw`
(() => {
  const D = JSON.parse(document.getElementById("viz-data").textContent);
  const { rows, charts, tierOrder, tierLabel } = D;
  const SVGNS = "http://www.w3.org/2000/svg";
  const tt = document.getElementById("tt");

  // Marker shape per tier (secondary encoding alongside hue — CVD + light-mode
  // low-contrast relief).
  const shape = { unique: "circle", legendary: "diamond", artifact: "square" };
  const el = (t, a = {}, p) => { const n = document.createElementNS(SVGNS, t); for (const k in a) n.setAttribute(k, a[k]); if (p) p.appendChild(n); return n; };

  function marker(parent, cx, cy, kind, r, cls) {
    let n;
    if (kind === "diamond") n = el("path", { d: "M" + cx + " " + (cy - r) + "L" + (cx + r) + " " + cy + "L" + cx + " " + (cy + r) + "L" + (cx - r) + " " + cy + "Z" }, parent);
    else if (kind === "square") n = el("rect", { x: cx - r * 0.86, y: cy - r * 0.86, width: r * 1.72, height: r * 1.72, rx: 1.5 }, parent);
    else n = el("circle", { cx, cy, r }, parent);
    n.setAttribute("class", cls);
    return n;
  }

  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (p * m >= v) return p * m;
    return p * 10;
  }

  const reqMax = niceMax(Math.max(...rows.map((r) => r.req)) * 1.02);

  function chart(spec) {
    const W = 520, H = 340, m = { t: 14, r: 14, b: 40, l: 46 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const vals = rows.map((r) => r[spec.key]);
    let yMax = niceMax(Math.max(...vals) * 1.05);
    let yMin = Math.min(0, ...vals);
    if (spec.key === "spike") { yMin = Math.min(0.8, ...vals) - 0.1; }
    const x = (v) => m.l + (v / reqMax) * iw;
    const y = (v) => m.t + ih - ((v - yMin) / (yMax - yMin)) * ih;

    const fig = document.createElement("figure");
    fig.className = "card";
    const cap = document.createElement("figcaption");
    cap.innerHTML = '<span class="ctitle">' + spec.label + '</span><span class="cdesc">' + spec.desc + "</span>";
    const svg = el("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": spec.label + " by Required Level" });

    // gridlines + y ticks
    const yticks = 5;
    for (let i = 0; i <= yticks; i++) {
      const yv = yMin + (i / yticks) * (yMax - yMin);
      const yy = y(yv);
      el("line", { x1: m.l, y1: yy, x2: W - m.r, y2: yy, class: "grid" }, svg);
      const lab = el("text", { x: m.l - 6, y: yy + 3, class: "tick tickr" }, svg);
      lab.textContent = spec.key === "spike" ? yv.toFixed(1) : (spec.key === "damagePct" || spec.key === "critBonus") ? yv.toFixed(2) : Math.round(yv);
    }
    // x ticks
    const xstep = reqMax <= 50 ? 10 : 20;
    for (let v = 0; v <= reqMax + 0.1; v += xstep) {
      el("line", { x1: x(v), y1: m.t, x2: x(v), y2: m.t + ih, class: "grid gridv" }, svg);
      const lab = el("text", { x: x(v), y: m.t + ih + 16, class: "tick tickc" }, svg);
      lab.textContent = Math.round(v);
    }
    // axis titles
    const xt = el("text", { x: m.l + iw / 2, y: H - 4, class: "axtitle" }, svg); xt.textContent = "Required Level";

    // reference lines
    if (spec.budget) {
      const line = (mult, cls) => {
        const p = "M" + x(1) + " " + y((D.budgetFor.BASE) * mult) + " L" + x(reqMax) + " " + y((D.budgetFor.BASE + D.budgetFor.PER_LEVEL * (reqMax - 1)) * mult);
        el("path", { d: p, class: cls }, svg);
      };
      line(1, "refline");
      line(D.budgetFor.SPECIAL_PREMIUM, "refline refdash");
    }
    if (spec.refLine != null) el("line", { x1: m.l, y1: y(spec.refLine), x2: W - m.r, y2: y(spec.refLine), class: "refline" }, svg);
    // per-tier median spike lines on the spike chart (the anomaly baselines)
    if (spec.key === "spike") for (const t of D.tierOrder) el("line", { x1: m.l, y1: y(D.tierMedian[t]), x2: W - m.r, y2: y(D.tierMedian[t]), class: "refline tmedline tmed-" + t }, svg);

    // points
    for (const r of rows) {
      const cx = x(r.req), cy = y(r[spec.key]);
      const hot = r.anomaly;
      const n = marker(svg, cx, cy, shape[r.tier], 5, "pt pt-" + r.tier + (hot ? " pt-hot" : ""));
      n.addEventListener("pointerenter", (e) => showTip(e, r, spec));
      n.addEventListener("pointermove", (e) => moveTip(e));
      n.addEventListener("pointerleave", hideTip);
      // direct label for hot outliers (relief for low-contrast hues + the headline)
      if (hot) { const t = el("text", { x: cx + 8, y: cy - 6, class: "ptlabel" }, svg); t.textContent = r.name; }
    }
    fig.appendChild(svg); fig.appendChild(cap);
    return fig;
  }

  function showTip(e, r, spec) {
    tt.innerHTML =
      '<div class="tt-name"><span class="dot dot-' + r.tier + '"></span>' + r.name + "</div>" +
      '<div class="tt-sub">' + tierLabel[r.tier] + " · " + r.class + "</div>" +
      '<table class="tt-tbl">' +
      row("Required level", r.req) + row("Item level", r.ilvl) +
      row("Eff. DPS", r.effDps.toFixed(0) + " (base " + r.baseEffDps.toFixed(0) + ")") +
      row("Per-hit dmg", r.damage) + row("Power spike", "×" + r.spike.toFixed(1) + " budget@req") +
      row("+% damage", r.damagePct ? "+" + Math.round(r.damagePct * 100) + "%" : "—") +
      row("+crit", r.critBonus ? "+" + Math.round(r.critBonus * 100) + "%" : "—") +
      row("stat pts", r.totalStatPts || "—") + row("+maxHP", r.maxHp || "—") +
      "</table>";
    tt.hidden = false; moveTip(e);
  }
  const row = (k, v) => '<tr><td>' + k + "</td><td>" + v + "</td></tr>";
  function moveTip(e) {
    const pad = 14; const r = tt.getBoundingClientRect();
    let left = e.clientX + pad, top = e.clientY + pad;
    if (left + r.width > innerWidth) left = e.clientX - r.width - pad;
    if (top + r.height > innerHeight) top = e.clientY - r.height - pad;
    tt.style.left = left + "px"; tt.style.top = top + "px";
  }
  function hideTip() { tt.hidden = true; }

  // legend
  const lg = document.getElementById("legend");
  for (const t of tierOrder) {
    const s = document.createElement("span"); s.className = "lg";
    const svg = el("svg", { viewBox: "0 0 14 14", class: "lgmark" });
    marker(svg, 7, 7, shape[t], 5, "pt pt-" + t);
    s.appendChild(svg);
    const lab = document.createElement("span"); lab.textContent = tierLabel[t] + " (" + rows.filter((r) => r.tier === t).length + ")";
    s.appendChild(lab); lg.appendChild(s);
  }
  { const s = document.createElement("span"); s.className = "lg"; s.innerHTML = '<span class="hotring"></span><span>tier anomaly</span>'; lg.appendChild(s); }

  const grid = document.getElementById("charts");
  for (const spec of charts) grid.appendChild(chart(spec));

  // data table
  const cols = [["name", "Weapon"], ["tier", "Tier"], ["class", "Class"], ["req", "Req"], ["ilvl", "ilvl"], ["effDps", "Eff DPS"], ["spike", "×budget@req"], ["ilvlMult", "ilvl×"], ["damage", "Dmg"], ["damagePct", "+%dmg"], ["critBonus", "+crit"], ["totalStatPts", "stats"], ["maxHp", "+HP"]];
  const tbl = document.getElementById("datatable");
  const trh = document.createElement("tr");
  for (const [, label] of cols) { const th = document.createElement("th"); th.textContent = label; trh.appendChild(th); }
  const th0 = document.createElement("thead"); th0.appendChild(trh); tbl.appendChild(th0);
  const tb = document.createElement("tbody");
  for (const r of [...rows].sort((a, b) => b.spike - a.spike)) {
    const tr = document.createElement("tr"); if (r.anomaly) tr.className = "hot";
    for (const [k] of cols) {
      const td = document.createElement("td");
      let v = r[k];
      if (k === "spike") v = "×" + v.toFixed(1);
      else if (k === "ilvlMult") v = "×" + v.toFixed(2);
      else if (k === "damagePct") v = v ? "+" + Math.round(v * 100) + "%" : "";
      else if (k === "critBonus") v = v ? "+" + Math.round(v * 100) + "%" : "";
      else if (k === "effDps") v = v.toFixed(0);
      else if (k === "tier") v = tierLabel[v];
      td.textContent = v === 0 ? "" : v;
      if (k === "name") td.className = "tcell-" + r.tier;
      tr.appendChild(td);
    }
    tb.appendChild(tr);
  }
  tbl.appendChild(tb);
})();
`;

const STYLE = String.raw`
.viz-root {
  color-scheme: light;
  --surface-1: #fcfcfb; --plane: #f9f9f7;
  --text-primary: #0b0b0b; --text-secondary: #52514e; --muted: #898781;
  --grid: #e1e0d9; --axis: #c3c2b7; --border: rgba(11,11,11,0.10);
  --unique: #2a78d6; --legendary: #eda100; --artifact: #e87ba4;
  --ref: #52514e; --hot: #d03b3b;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  color: var(--text-primary); background: var(--plane);
  max-width: 1180px; margin: 0 auto; padding: 24px 20px 60px;
}
@media (prefers-color-scheme: dark) {
  :root:where(:not([data-theme="light"])) .viz-root {
    color-scheme: dark;
    --surface-1: #1a1a19; --plane: #0d0d0d;
    --text-primary: #fff; --text-secondary: #c3c2b7; --muted: #898781;
    --grid: #2c2c2a; --axis: #383835; --border: rgba(255,255,255,0.10);
    --unique: #3987e5; --legendary: #c98500; --artifact: #d55181;
    --ref: #c3c2b7; --hot: #e06464;
  }
}
:root[data-theme="dark"] .viz-root {
  color-scheme: dark;
  --surface-1: #1a1a19; --plane: #0d0d0d;
  --text-primary: #fff; --text-secondary: #c3c2b7; --muted: #898781;
  --grid: #2c2c2a; --axis: #383835; --border: rgba(255,255,255,0.10);
  --unique: #3987e5; --legendary: #c98500; --artifact: #d55181;
  --ref: #c3c2b7; --hot: #e06464;
}
.viz-head h1 { font-size: 1.5rem; margin: 0 0 4px; letter-spacing: -0.01em; }
.sub { color: var(--text-secondary); font-size: 0.9rem; line-height: 1.5; margin: 0 0 12px; max-width: 78ch; }
.legend { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; margin: 8px 0 4px; }
.lg { display: inline-flex; align-items: center; gap: 6px; font-size: 0.85rem; color: var(--text-secondary); }
.lgmark { width: 16px; height: 16px; }
.hotring { width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--hot); display: inline-block; }
.callout { background: var(--surface-1); border: 1px solid var(--border); border-radius: 12px; padding: 14px 18px; margin: 18px 0; }
.callout h2 { font-size: 1.05rem; margin: 0 0 4px; }
.hotlist { margin: 6px 0 0; padding-left: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
.hotlist li { font-size: 0.9rem; line-height: 1.5; }
.ratio { color: var(--hot); font-weight: 700; }
.chip { display: inline-block; font-size: 0.72rem; font-weight: 700; padding: 1px 7px; border-radius: 999px; vertical-align: middle; }
.chip-unique { background: color-mix(in srgb, var(--unique) 20%, transparent); color: var(--unique); }
.chip-legendary { background: color-mix(in srgb, var(--legendary) 24%, transparent); color: var(--legendary); }
.chip-artifact { background: color-mix(in srgb, var(--artifact) 24%, transparent); color: var(--artifact); }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 16px; }
.card { margin: 0; background: var(--surface-1); border: 1px solid var(--border); border-radius: 12px; padding: 10px 12px 12px; }
.card svg { width: 100%; height: auto; display: block; }
figcaption { margin-top: 4px; }
.ctitle { display: block; font-weight: 650; font-size: 0.92rem; }
.cdesc { display: block; color: var(--muted); font-size: 0.76rem; line-height: 1.45; margin-top: 2px; }
.grid line.grid { stroke: var(--grid); stroke-width: 1; }
.tick { fill: var(--muted); font-size: 10px; font-variant-numeric: tabular-nums; }
.tickr { text-anchor: end; } .tickc { text-anchor: middle; }
.axtitle { fill: var(--text-secondary); font-size: 11px; text-anchor: middle; font-weight: 600; }
.refline { stroke: var(--ref); stroke-width: 1.5; opacity: 0.5; fill: none; }
.refdash { stroke-dasharray: 4 3; opacity: 0.4; }
.refhot { stroke: var(--hot); stroke-dasharray: 4 3; opacity: 0.7; }
.tmedline { stroke-width: 1; stroke-dasharray: 2 4; opacity: 0.45; }
.tmed-unique { stroke: var(--unique); } .tmed-legendary { stroke: var(--legendary); } .tmed-artifact { stroke: var(--artifact); }
.tblock { margin-top: 10px; }
.tblock h3 { font-size: 0.9rem; margin: 0 0 4px; display: flex; align-items: center; gap: 8px; font-weight: 600; }
.tmed { color: var(--muted); font-size: 0.76rem; font-weight: 500; }
.pt { stroke: var(--surface-1); stroke-width: 1.5; }
.pt-unique { fill: var(--unique); } .pt-legendary { fill: var(--legendary); } .pt-artifact { fill: var(--artifact); }
.pt-hot { stroke: var(--hot); stroke-width: 2; }
.ptlabel { fill: var(--text-secondary); font-size: 9.5px; font-weight: 600; paint-order: stroke; stroke: var(--surface-1); stroke-width: 2.5px; }
.tooltip { position: fixed; z-index: 50; pointer-events: none; background: var(--surface-1); color: var(--text-primary); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; box-shadow: 0 6px 24px rgba(0,0,0,0.18); font-size: 0.8rem; max-width: 260px; }
.tt-name { font-weight: 700; display: flex; align-items: center; gap: 6px; }
.dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
.dot-unique { background: var(--unique); } .dot-legendary { background: var(--legendary); } .dot-artifact { background: var(--artifact); }
.tt-sub { color: var(--muted); font-size: 0.72rem; margin-bottom: 4px; text-transform: capitalize; }
.tt-tbl { border-collapse: collapse; width: 100%; }
.tt-tbl td { padding: 1px 0; font-variant-numeric: tabular-nums; }
.tt-tbl td:first-child { color: var(--text-secondary); padding-right: 10px; }
.tt-tbl td:last-child { text-align: right; font-weight: 600; }
.tablewrap { margin-top: 22px; }
.tablewrap summary { cursor: pointer; font-weight: 600; font-size: 0.9rem; color: var(--text-secondary); }
.scroll { overflow-x: auto; margin-top: 10px; }
#datatable { border-collapse: collapse; width: 100%; font-size: 0.82rem; }
#datatable th, #datatable td { padding: 5px 9px; text-align: right; border-bottom: 1px solid var(--grid); white-space: nowrap; font-variant-numeric: tabular-nums; }
#datatable th:first-child, #datatable td:first-child { text-align: left; }
#datatable th { color: var(--muted); font-weight: 600; border-bottom: 1px solid var(--axis); }
#datatable tr.hot td { background: color-mix(in srgb, var(--hot) 10%, transparent); }
.tcell-unique { color: var(--unique); font-weight: 600; }
.tcell-legendary { color: var(--legendary); font-weight: 600; }
.tcell-artifact { color: var(--artifact); font-weight: 600; }
`;

function fullPage() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Named Weapon Analysis</title>
<style>*{box-sizing:border-box}body{margin:0}${STYLE}</style>
</head>
<body>
${bodyMarkup()}
</body>
</html>`;
}

// ---- CLI ---------------------------------------------------------------------

const argv = process.argv.slice(2);
if (argv.includes("--json")) {
  process.stdout.write(JSON.stringify(rows, null, 2) + "\n");
  process.exit(0);
}
if (argv.includes("--body-only")) {
  process.stdout.write(`<style>${STYLE}</style>\n` + bodyMarkup() + "\n");
  process.exit(0);
}

const outIdx = argv.indexOf("--out");
const outPath =
  outIdx >= 0 && argv[outIdx + 1]
    ? path.resolve(argv[outIdx + 1])
    : path.join(root, "pwa", "assets-preview", "weapon-scatter.html");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, fullPage());

report();
console.log(`\nWrote multi-chart page → ${path.relative(root, outPath)}`);
