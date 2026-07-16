// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The progression graph builder for scripts/progression-sim.mjs: turns an
// analytic ProgressionReport (src/sim/analytic.ts) into a single self-contained
// HTML page — a HUD-style telemetry dashboard of how the hero's level, health,
// damage, crit, and armor climb over the whole game, banded by difficulty.
//
// The output is body-only content (inline <style>, markup, inline <script> with
// the data embedded) — no external hosts, no build step: a browser renders the
// file directly, and it doubles as an Artifact source. Charts are drawn client
// -side as inline SVG with a shared crosshair/tooltip layer.

/** The metrics plotted one-series-per-chart (title names the series, so no
 * legend). Each reads a field straight off a checkpoint. */
// Metric metadata is serialized to the client (JSON drops functions), so
// formatting is done client-side from `isPct`/`decimals` — see fmtMetric().
const METRICS = [
  { key: "heroLevel", label: "Hero level", accent: "level" },
  { key: "maxHp", label: "Max health", accent: "hp" },
  { key: "perHit", label: "Damage per hit", accent: "dmg", decimals: 1 },
  { key: "dps", label: "Damage per second", accent: "dps" },
  { key: "crit", label: "Crit chance", accent: "crit", isPct: true },
  { key: "armorRed", label: "Armor reduction", accent: "armor", isPct: true },
];

/** The six trainable stats, plotted together (a real multi-series chart → a
 * legend + validated categorical colors). */
const STAT_KEYS = [
  "stamina",
  "strength",
  "dexterity",
  "intelligence",
  "speed",
  "luck",
  "spirit",
];

export function buildChartHtml(report) {
  const points = report.checkpoints.map((cp) => ({
    k: cp.totalKills,
    diff: cp.difficulty,
    lvl: cp.levelName,
    levelId: cp.levelId,
    heroLevel: cp.heroLevel,
    maxHp: cp.maxHp,
    perHit: cp.perHit,
    dps: cp.dps,
    crit: cp.critChance,
    armorRed: cp.armorReduction,
    weapon: cp.weapon,
    stats: cp.stats,
  }));

  // Contiguous difficulty bands along the kill axis — the escalating "heat"
  // backdrop every chart shares.
  const bands = [];
  for (const p of points) {
    const last = bands[bands.length - 1];
    if (last && last.diff === p.diff) last.end = p.k;
    else bands.push({ diff: p.diff, start: last ? last.end : 0, end: p.k });
  }

  const data = {
    points,
    bands,
    metrics: METRICS,
    statKeys: STAT_KEYS,
    seed: report.seed,
    statWeights: report.statWeights,
    batchSize: report.batchSize,
    heroLevelEnd: report.heroLevelEnd,
    totalKills: report.totalKills,
    targetLevel: report.targetLevel,
    difficulties: bands
      .map((b) => b.diff)
      .filter((d, i, a) => a.indexOf(d) === i),
  };

  const weightDigest = Object.entries(report.statWeights || {})
    .map(([k, v]) => `${k}×${v}`)
    .join(" · ");

  return `${STYLE}
<main class="wrap">
  <header class="masthead">
    <div class="title-row">
      <span class="glyph" aria-hidden="true"></span>
      <h1>Progression telemetry</h1>
    </div>
    <p class="lede">A paper playthrough of the whole campaign on real engine rules — every mob a level fields, farmed clean, easy&nbsp;→&nbsp;JESUS, tracked to level&nbsp;${report.targetLevel}.</p>
    <dl class="facts">
      <div><dt>Final level</dt><dd>${report.heroLevelEnd}</dd></div>
      <div><dt>Kills simulated</dt><dd>${report.totalKills.toLocaleString("en-US")}</dd></div>
      <div><dt>Level passes</dt><dd>${report.levels.length}</dd></div>
      <div><dt>Stat build</dt><dd>${weightDigest || "default"}</dd></div>
      <div><dt>Snapshot every</dt><dd>${report.batchSize} kills</dd></div>
      <div><dt>Seed</dt><dd>${report.seed}</dd></div>
    </dl>
    <div class="bandkey" id="bandkey" aria-label="Difficulty bands"></div>
  </header>

  <section class="grid" id="charts" aria-label="Progression charts"></section>

  <section class="statsblock">
    <h2>Stat allocation over the run</h2>
    <p class="sub">Effective value of each attribute (chosen points + auto-growth + gear), per snapshot.</p>
    <figure class="card wide" id="statchart"></figure>
  </section>

  <details class="tablewrap">
    <summary>Data table — one row per snapshot</summary>
    <div class="scroll"><table id="datatable"></table></div>
  </details>
</main>
<div class="tooltip" id="tooltip" role="status" aria-live="off"></div>
<script>
const DATA = ${JSON.stringify(data)};
${CLIENT_JS}
</script>`;
}

const STYLE = `<style>
:root {
  color-scheme: light dark;
  --bg: #0b0f16;
  --panel: #121a26;
  --panel-2: #0e151f;
  --line: #223047;
  --ink: #e8eef7;
  --muted: #8b9bb4;
  --faint: #5a6b86;
  /* metric accents — one per single-series chart, never adjacent in a plot */
  --level: #f5a623;
  --hp: #4fc98a;
  --dmg: #ff7a59;
  --dps: #ff5470;
  --crit: #c98bff;
  --armor: #4aa8ff;
  --spirit: #59d6d0;
  /* difficulty heat ramp: calm → deadly (sequential warm escalation) */
  --easy: #3fb6a8;
  --medium: #8fc451;
  --hard: #f5c542;
  --nightmare: #f5883a;
  --jesus: #ef4a5b;
  --grid: #1b2637;
  --shadow: 0 1px 0 rgba(255,255,255,.03), 0 12px 32px -18px rgba(0,0,0,.8);
}
:root[data-theme="dark"] { color-scheme: dark; }
@media (prefers-color-scheme: light) {
  :root {
    --bg: #eef1f6; --panel: #ffffff; --panel-2: #f5f7fb; --line: #d3dbe8;
    --ink: #16202e; --muted: #556074; --faint: #93a0b5; --grid: #e7ecf4;
    --level: #b9770a; --hp: #1c9c5f; --dmg: #d8502e; --dps: #d62b48;
    --crit: #8a3fe0; --armor: #1f74d6;
    --easy: #1f9488; --medium: #5c9a2f; --hard: #c99a12; --nightmare: #d96f1f; --jesus: #cf3244;
    --shadow: 0 1px 0 rgba(0,0,0,.02), 0 12px 30px -20px rgba(20,30,50,.35);
  }
}
:root[data-theme="light"] {
  color-scheme: light;
  --bg: #eef1f6; --panel: #ffffff; --panel-2: #f5f7fb; --line: #d3dbe8;
  --ink: #16202e; --muted: #556074; --faint: #93a0b5; --grid: #e7ecf4;
  --level: #b9770a; --hp: #1c9c5f; --dmg: #d8502e; --dps: #d62b48;
  --crit: #8a3fe0; --armor: #1f74d6;
  --easy: #1f9488; --medium: #5c9a2f; --hard: #c99a12; --nightmare: #d96f1f; --jesus: #cf3244;
  --shadow: 0 1px 0 rgba(0,0,0,.02), 0 12px 30px -20px rgba(20,30,50,.35);
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--ink);
  font: 15px/1.5 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.wrap { max-width: 1120px; margin: 0 auto; padding: 40px 24px 72px; }
.masthead { margin-bottom: 28px; }
.title-row { display: flex; align-items: center; gap: 12px; }
.glyph { width: 14px; height: 14px; border-radius: 2px;
  background: linear-gradient(135deg, var(--level), var(--jesus)); box-shadow: 0 0 14px -2px var(--nightmare); }
h1 { font: 700 26px/1.1 ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  letter-spacing: .01em; margin: 0; text-wrap: balance; }
.lede { color: var(--muted); max-width: 62ch; margin: 10px 0 20px; }
.facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 1px; background: var(--line); border: 1px solid var(--line); border-radius: 12px;
  overflow: hidden; margin: 0 0 18px; }
.facts > div { background: var(--panel); padding: 12px 14px; }
.facts dt { color: var(--faint); font-size: 11px; text-transform: uppercase; letter-spacing: .08em; }
.facts dd { margin: 4px 0 0; font: 600 20px/1 ui-monospace, Menlo, monospace;
  font-variant-numeric: tabular-nums; }
.bandkey { display: flex; flex-wrap: wrap; gap: 8px 16px; }
.bandkey .b { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; color: var(--muted);
  text-transform: uppercase; letter-spacing: .06em; }
.bandkey .sw { width: 20px; height: 8px; border-radius: 2px; }
.grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
@media (max-width: 720px) { .grid { grid-template-columns: 1fr; } }
.card { background: var(--panel); border: 1px solid var(--line); border-radius: 14px;
  padding: 16px 16px 10px; box-shadow: var(--shadow); }
.card.wide { grid-column: 1 / -1; }
.card h3 { margin: 0; font: 600 13px/1 system-ui, sans-serif; text-transform: uppercase;
  letter-spacing: .07em; color: var(--muted); display: flex; justify-content: space-between; align-items: baseline; }
.card h3 .now { font: 700 15px/1 ui-monospace, Menlo, monospace; color: var(--ink);
  font-variant-numeric: tabular-nums; }
.card svg { width: 100%; height: auto; display: block; margin-top: 8px; overflow: visible; }
.statsblock { margin-top: 30px; }
.statsblock h2 { font: 700 18px/1.2 ui-monospace, Menlo, monospace; margin: 0; }
.statsblock .sub { color: var(--muted); margin: 6px 0 14px; font-size: 13px; }
.legend { display: flex; flex-wrap: wrap; gap: 6px 16px; margin: 4px 2px 0; }
.legend span { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; color: var(--muted); }
.legend i { width: 12px; height: 3px; border-radius: 2px; }
.axis text { fill: var(--faint); font: 10px ui-monospace, Menlo, monospace; }
.gridline { stroke: var(--grid); stroke-width: 1; }
.axisline { stroke: var(--line); stroke-width: 1; }
.series { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.endcap { stroke: var(--panel); stroke-width: 2; }
.crosshair { stroke: var(--faint); stroke-width: 1; stroke-dasharray: 3 3; opacity: 0; }
.hit { fill: transparent; cursor: crosshair; }
.tooltip { position: fixed; z-index: 20; pointer-events: none; opacity: 0; transition: opacity .08s;
  background: var(--panel-2); color: var(--ink); border: 1px solid var(--line); border-radius: 10px;
  padding: 9px 11px; font: 12px/1.45 ui-monospace, Menlo, monospace; box-shadow: var(--shadow);
  max-width: 260px; }
.tooltip b { color: var(--faint); font-weight: 600; }
.tooltip .row { display: flex; justify-content: space-between; gap: 14px; }
.tooltip .row .v { font-variant-numeric: tabular-nums; }
.tablewrap { margin-top: 30px; border: 1px solid var(--line); border-radius: 12px; background: var(--panel); }
.tablewrap summary { cursor: pointer; padding: 14px 16px; font-weight: 600; color: var(--muted); }
.tablewrap .scroll { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font: 12px ui-monospace, Menlo, monospace;
  font-variant-numeric: tabular-nums; }
th, td { padding: 6px 10px; text-align: right; white-space: nowrap; border-top: 1px solid var(--line); }
th:first-child, td:first-child, th:nth-child(2), td:nth-child(2) { text-align: left; }
thead th { position: sticky; top: 0; background: var(--panel-2); color: var(--faint);
  font-weight: 600; text-transform: uppercase; font-size: 10px; letter-spacing: .05em; }
@media (prefers-reduced-motion: reduce) { .tooltip { transition: none; } }
</style>`;

const CLIENT_JS = String.raw`
const $ = (s, r = document) => r.querySelector(s);
const SVGNS = "http://www.w3.org/2000/svg";
const el = (n, a = {}) => { const e = document.createElementNS(SVGNS, n);
  for (const k in a) e.setAttribute(k, a[k]); return e; };
const cssv = (name) => getComputedStyle(document.documentElement).getPropertyValue("--" + name).trim();
const P = DATA.points;
const fmtMetric = (m, v) => m.isPct ? Math.round(v * 100) + "%"
  : (m.decimals ? v.toFixed(m.decimals) : Math.round(v).toLocaleString());
const K0 = P[0]?.k ?? 0, K1 = P[P.length - 1]?.k ?? 1;
const W = 520, H = 200, ML = 46, MR = 16, MT = 12, MB = 26;
const xOf = (k) => ML + ((k - K0) / Math.max(1, K1 - K0)) * (W - ML - MR);

function niceMax(v) {
  if (v <= 1) { const s = [0.1,0.2,0.25,0.5,1]; return s.find((x) => x >= v) ?? 1; }
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= v) return m * pow;
  return 10 * pow;
}

function drawBands(svg) {
  for (const b of DATA.bands) {
    const x = xOf(b.start), w = xOf(b.end) - xOf(b.start);
    const r = el("rect", { x, y: MT, width: Math.max(0, w), height: H - MT - MB,
      fill: cssv(b.diff), opacity: 0.10 });
    svg.appendChild(r);
  }
}

function chart(container, metric) {
  const values = P.map((p) => p[metric.key]);
  // Never cap the axis below the data — crit chance genuinely overflows past
  // 100% (stacked gear crit + DEX), and hiding that would bury a real balance
  // signal. niceMax lifts the ceiling to fit whatever the run actually hit.
  const maxRaw = Math.max(...values, metric.isPct ? 0.01 : 1);
  const max = niceMax(maxRaw);
  const yOf = (v) => H - MB - (v / max) * (H - MT - MB);
  const color = cssv(metric.accent);

  const svg = el("svg", { viewBox: "0 0 " + W + " " + H, role: "img",
    "aria-label": metric.label + " over the run" });
  drawBands(svg);

  // gridlines + y labels
  const gaxis = el("g", { class: "axis" });
  const ticks = 4;
  for (let i = 0; i <= ticks; i++) {
    const v = (max / ticks) * i, y = yOf(v);
    gaxis.appendChild(el("line", { class: "gridline", x1: ML, y1: y, x2: W - MR, y2: y }));
    const t = el("text", { x: ML - 8, y: y + 3, "text-anchor": "end" });
    t.textContent = metric.isPct ? Math.round(v * 100) + "%" : fmtAxis(v);
    gaxis.appendChild(t);
  }
  // x labels (kills)
  for (let i = 0; i <= 4; i++) {
    const k = K0 + ((K1 - K0) / 4) * i, x = xOf(k);
    const t = el("text", { x, y: H - 8, "text-anchor": i === 0 ? "start" : i === 4 ? "end" : "middle" });
    t.textContent = fmtAxis(k);
    gaxis.appendChild(t);
  }
  svg.appendChild(gaxis);

  // the series
  const d = P.map((p, i) => (i ? "L" : "M") + xOf(p.k).toFixed(1) + " " + yOf(values[i]).toFixed(1)).join(" ");
  svg.appendChild(el("path", { class: "series", d, stroke: color }));
  // endpoint
  const lastX = xOf(K1), lastY = yOf(values[values.length - 1]);
  svg.appendChild(el("circle", { class: "endcap", cx: lastX, cy: lastY, r: 4.5, fill: color }));

  // crosshair + hit layer
  const cross = el("line", { class: "crosshair", x1: 0, y1: MT, x2: 0, y2: H - MB });
  svg.appendChild(cross);
  const dot = el("circle", { class: "endcap", cx: -10, cy: -10, r: 4, fill: color, opacity: 0 });
  svg.appendChild(dot);
  const hit = el("rect", { class: "hit", x: ML, y: MT, width: W - ML - MR, height: H - MT - MB });
  svg.appendChild(hit);
  attachHover(hit, svg, cross, dot, yOf, values, metric);

  const now = fmtMetric(metric, values[values.length - 1]);
  container.innerHTML = "<h3>" + metric.label + " <span class='now'>" + now + "</span></h3>";
  container.appendChild(svg);
}

function fmtAxis(v) {
  if (v >= 1000) return (v / 1000).toFixed(v >= 10000 ? 0 : 1) + "k";
  return Math.round(v).toString();
}

function nearestIndex(k) {
  let lo = 0, hi = P.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (P[mid].k < k) lo = mid + 1; else hi = mid; }
  if (lo > 0 && Math.abs(P[lo - 1].k - k) < Math.abs(P[lo].k - k)) return lo - 1;
  return lo;
}

const tooltip = $("#tooltip");
function attachHover(hit, svg, cross, dot, yOf, values, metric) {
  const move = (ev) => {
    const pt = svg.createSVGPoint();
    const src = ev.touches ? ev.touches[0] : ev;
    pt.x = src.clientX; pt.y = src.clientY;
    const loc = pt.matrixTransform(svg.getScreenCTM().inverse());
    const k = K0 + ((loc.x - ML) / (W - ML - MR)) * (K1 - K0);
    const idx = nearestIndex(k);
    const p = P[idx], x = xOf(p.k), y = yOf(values[idx]);
    cross.setAttribute("x1", x); cross.setAttribute("x2", x); cross.style.opacity = 1;
    dot.setAttribute("cx", x); dot.setAttribute("cy", y); dot.style.opacity = 1;
    tooltip.innerHTML =
      "<b>" + p.diff.toUpperCase() + " · " + p.lvl + "</b>" +
      "<div class='row'><span>kills</span><span class='v'>" + p.k.toLocaleString() + "</span></div>" +
      "<div class='row'><span>hero</span><span class='v'>L" + p.heroLevel + "</span></div>" +
      "<div class='row'><span>" + metric.label.toLowerCase() + "</span><span class='v'>" + fmtMetric(metric, values[idx]) + "</span></div>" +
      "<div class='row'><span>weapon</span><span class='v'>" + p.weapon + "</span></div>";
    tooltip.style.opacity = 1;
    tooltip.style.left = Math.min(window.innerWidth - 270, src.clientX + 14) + "px";
    tooltip.style.top = (src.clientY + 14) + "px";
  };
  const leave = () => { cross.style.opacity = 0; dot.style.opacity = 0; tooltip.style.opacity = 0; };
  hit.addEventListener("mousemove", move);
  hit.addEventListener("mouseleave", leave);
  hit.addEventListener("touchmove", (e) => { move(e); e.preventDefault(); }, { passive: false });
  hit.addEventListener("touchend", leave);
}

function statChart(container) {
  // Reuse the themed metric accents (each has a light+dark override) in an
  // order whose adjacent pairs clear the CVD floor; the direct STR/DEX/… end
  // labels are the secondary encoding, so identity is never colour-alone.
  const colors = ["hp", "dmg", "armor", "level", "crit", "dps", "spirit"].map(
    cssv,
  );
  const all = P.flatMap((p) => DATA.statKeys.map((s) => p.stats[s]));
  const max = niceMax(Math.max(...all, 1));
  const yOf = (v) => H - MB - (v / max) * (H - MT - MB);
  const svg = el("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Attributes over the run" });
  drawBands(svg);
  const gaxis = el("g", { class: "axis" });
  for (let i = 0; i <= 4; i++) {
    const v = (max / 4) * i, y = yOf(v);
    gaxis.appendChild(el("line", { class: "gridline", x1: ML, y1: y, x2: W - MR, y2: y }));
    const t = el("text", { x: ML - 8, y: y + 3, "text-anchor": "end" }); t.textContent = fmtAxis(v);
    gaxis.appendChild(t);
  }
  for (let i = 0; i <= 4; i++) {
    const k = K0 + ((K1 - K0) / 4) * i, x = xOf(k);
    const t = el("text", { x, y: H - 8, "text-anchor": i === 0 ? "start" : i === 4 ? "end" : "middle" });
    t.textContent = fmtAxis(k); gaxis.appendChild(t);
  }
  svg.appendChild(gaxis);
  const ends = [];
  DATA.statKeys.forEach((s, si) => {
    const d = P.map((p, i) => (i ? "L" : "M") + xOf(p.k).toFixed(1) + " " + yOf(p.stats[s]).toFixed(1)).join(" ");
    svg.appendChild(el("path", { class: "series", d, stroke: colors[si], opacity: 0.92 }));
    ends.push({ y: yOf(P[P.length - 1].stats[s]), color: colors[si], text: s.slice(0, 3).toUpperCase() });
  });
  // Dodge the end-labels apart: attributes converge on the diminishing-returns
  // ceiling, so their raw label positions would stack into a smear.
  ends.sort((a, b) => a.y - b.y);
  const GAP = 11;
  for (let i = 1; i < ends.length; i++)
    if (ends[i].y - ends[i - 1].y < GAP) ends[i].y = ends[i - 1].y + GAP;
  const lx = xOf(K1);
  for (const e of ends) {
    const lbl = el("text", { x: lx + 6, y: e.y + 3, fill: e.color, "font-size": 10,
      "font-family": "ui-monospace, Menlo, monospace" });
    lbl.textContent = e.text;
    svg.appendChild(lbl);
  }
  container.innerHTML = "<h3>Attributes (effective)</h3>";
  container.appendChild(svg);
  const legend = document.createElement("div"); legend.className = "legend";
  DATA.statKeys.forEach((s, si) => {
    legend.insertAdjacentHTML("beforeend",
      "<span><i style='background:" + colors[si] + "'></i>" + s + "</span>");
  });
  container.appendChild(legend);
}

function bandKey() {
  const box = $("#bandkey");
  DATA.difficulties.forEach((d) => {
    box.insertAdjacentHTML("beforeend",
      "<span class='b'><span class='sw' style='background:" + cssv(d) + "'></span>" + d + "</span>");
  });
}

function table() {
  const t = $("#datatable");
  const head = ["Difficulty", "Level", "Kills", "Hero", "HP", "Per-hit", "DPS", "Crit", "Armor", "Reduc",
    ...DATA.statKeys.map((s) => s.slice(0, 3).toUpperCase())];
  t.innerHTML = "<thead><tr>" + head.map((h) => "<th>" + h + "</th>").join("") + "</tr></thead>";
  const tb = document.createElement("tbody");
  for (const p of P) {
    const cells = [p.diff, p.lvl, p.k.toLocaleString(), "L" + p.heroLevel, p.maxHp, p.perHit.toFixed(1),
      Math.round(p.dps), Math.round(p.crit * 100) + "%", "-", Math.round(p.armorRed * 100) + "%",
      ...DATA.statKeys.map((s) => p.stats[s])];
    tb.insertAdjacentHTML("beforeend", "<tr>" + cells.map((c) => "<td>" + c + "</td>").join("") + "</tr>");
  }
  t.appendChild(tb);
}

function render() {
  const grid = $("#charts");
  grid.innerHTML = "";
  for (const m of DATA.metrics) {
    const fig = document.createElement("figure"); fig.className = "card";
    grid.appendChild(fig); chart(fig, m);
  }
  statChart($("#statchart"));
  bandKey();
  table();
}
render();
// Re-render on theme toggle so CSS-var colors are re-read.
new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
`;
