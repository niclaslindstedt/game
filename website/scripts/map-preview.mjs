#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The MAP PREVIEW renderer (see the `level-design` skill): draws an annotated
// top-down diagram of a whole level so its design can be READ and iterated on —
// the hero's path, the boss/elite/unique/rare/pack encounters, the safe & quiet
// zones, chests, the merchant, and the tempo curve. Three modes:
//
//   node website/scripts/map-preview.mjs <id>              design view (YAML)
//   node website/scripts/map-preview.mjs <id> --actual     real scattered layout
//     [--seed N] [--difficulty medium]                     from createGame(seed)
//   node website/scripts/map-preview.mjs <id> --heatmap     + a played dwell +
//     [--seed N] [--difficulty easy]                        kill heatmap (sim)
//   node website/scripts/map-preview.mjs --all             every level (design)
//
// Reuses the sprite toolkit (surface/font/preview); the vector primitives it
// draws with live in asset-tools/surface.mjs. Output → website/assets-preview/.

import { register } from "node:module";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { renderText } from "./asset-tools/font.mjs";
import { writePng } from "./asset-tools/preview.mjs";
import {
  blit,
  createSurface,
  drawArrow,
  drawLine,
  fill,
  fillCircle,
  fillRect,
  strokeCircle,
  strokeRect,
  upscale,
} from "./asset-tools/surface.mjs";
import { loadLevels } from "./level-data/load-yaml.mjs";

register("../../scripts/game-alias-loader.mjs", import.meta.url);

const engine = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const { ENEMY_DEFS } = await import(engine("src/game/defs/enemies/index.ts"));

const previewDir = engine("website/assets-preview");
mkdirSync(previewDir, { recursive: true });

// ---- palette ---------------------------------------------------------------
const C = {
  bg: [18, 18, 22, 255],
  panel: [28, 28, 34, 255],
  ink: [232, 232, 236, 255],
  dim: [150, 150, 160, 255],
  wall: [120, 120, 130, 255],
  door: [230, 200, 90, 255],
  well: [180, 120, 230, 255],
  path: [90, 200, 255, 255],
  spawn: [110, 230, 150, 255],
  objective: [240, 90, 90, 255],
  boss: [240, 70, 70, 255],
  elite: [250, 160, 60, 255],
  unique: [250, 220, 80, 255],
  rare: [120, 200, 255, 255],
  pack: [240, 120, 200, 255],
  chest: [250, 200, 90, 255],
  merchant: [90, 220, 220, 255],
  landmark: [170, 170, 190, 255],
  safe: [80, 210, 130, 110],
  quiet: [150, 110, 220, 110],
  zoneEdge: [220, 220, 230, 200],
  tempoLo: [70, 130, 240, 255],
  tempoHi: [240, 90, 90, 255],
  gate: [200, 120, 240, 255],
};

const roleOf = (id) => ENEMY_DEFS[id]?.role ?? "minion";
const enemyName = (id) => ENEMY_DEFS[id]?.name ?? id.toUpperCase();

// ---- layout ----------------------------------------------------------------
const PAD = 10;
const TITLE_H = 12;
const LEGEND_W = 190;
const GAP = 10;

/** A world→image transform for one level, plus the composed surface + legend
 * cursor. `targetW` sets how wide the map area renders (logical px). */
function makeCanvas(def, targetW = 620) {
  const S = targetW / def.width;
  const mapW = Math.round(def.width * S);
  const mapH = Math.round(def.height * S);
  const tempoH = def.tempo?.length ? 30 : 0;
  const ox = PAD;
  const oy = PAD + TITLE_H;
  const bodyH = mapH + (tempoH ? tempoH + 6 : 0);
  const width = ox + mapW + GAP + LEGEND_W + PAD;
  const height = Math.max(oy + bodyH + PAD, oy + 260 + PAD);
  const surf = fill(createSurface(width, height), C.bg);
  return {
    def,
    S,
    ox,
    oy,
    mapW,
    mapH,
    tempoH,
    width,
    height,
    surf,
    legendX: ox + mapW + GAP,
    legendY: oy,
  };
}

const wx = (c, x) => c.ox + x * c.S;
const wy = (c, y) => c.oy + y * c.S;

/** Draw a label with a dark backing so it reads over any ground. The pixel
 * font has no `_` glyph, so underscores in ids become spaces. */
function label(surf, text, x, y, color = C.ink) {
  const clean = String(text).toUpperCase().replace(/_/g, " ");
  const t = renderText(clean, color);
  fillRect(surf, x - 1, y - 1, t.width + 2, t.height + 2, [0, 0, 0, 190]);
  blit(surf, t, x, y);
  return t.width;
}

/** A small filled diamond marker (elites). */
function diamond(surf, cx, cy, r, color) {
  for (let dy = -r; dy <= r; dy++) {
    const w = r - Math.abs(dy);
    for (let dx = -w; dx <= w; dx++)
      fillRect(surf, cx + dx, cy + dy, 1, 1, color);
  }
}

/** A star-ish marker (bosses/uniques): a filled circle with spokes. */
function star(surf, cx, cy, r, color) {
  fillCircle(surf, cx, cy, r, color);
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2;
    drawLine(
      surf,
      cx,
      cy,
      cx + Math.cos(ang) * (r + 3),
      cy + Math.sin(ang) * (r + 3),
      color,
      1,
    );
  }
}

// ---- the design view -------------------------------------------------------
function drawBase(c, description) {
  const { def, surf, ox, oy, mapW, mapH } = c;
  // Title bar.
  label(surf, `${def.name}  (${def.id})  ${def.biome}`, ox, PAD - 1, C.ink);
  // Ground wash + tile zones.
  fillRect(surf, ox, oy, mapW, mapH, [46, 44, 52, 255]);
  for (const z of def.tiles?.zones ?? []) {
    fillRect(
      surf,
      wx(c, z.rect.x),
      wy(c, z.rect.y),
      z.rect.width * c.S,
      z.rect.height * c.S,
      [60, 56, 70, 255],
    );
  }
  strokeRect(surf, ox, oy, mapW, mapH, C.dim, 1);
  // Design zones.
  const zone = (z, fillC, name) => {
    if (z.shape === "rect") {
      fillRect(
        surf,
        wx(c, z.rect.x),
        wy(c, z.rect.y),
        z.rect.width * c.S,
        z.rect.height * c.S,
        fillC,
      );
      strokeRect(
        surf,
        wx(c, z.rect.x),
        wy(c, z.rect.y),
        z.rect.width * c.S,
        z.rect.height * c.S,
        C.zoneEdge,
        1,
      );
      if (z.label || name)
        label(
          surf,
          z.label ?? name,
          wx(c, z.rect.x) + 2,
          wy(c, z.rect.y) + 2,
          C.ink,
        );
    } else {
      const cx = wx(c, z.pos.x);
      const cy = wy(c, z.pos.y);
      fillCircle(surf, cx, cy, z.radius * c.S, fillC);
      strokeCircle(surf, cx, cy, z.radius * c.S, C.zoneEdge, 1);
      if (z.label || name) label(surf, z.label ?? name, cx - 10, cy, C.ink);
    }
  };
  for (const z of def.safeZones ?? []) zone(z, C.safe, "SAFE");
  for (const z of def.quietZones ?? []) zone(z, C.quiet, "DEAD");
  // Walls — the deterministic path-formers: draw them as SOLID barriers (thick,
  // by their real collision radius) so corridors and funnels read at a glance.
  for (const w of def.walls ?? []) {
    const thick = Math.max(3, Math.round(w.radius * 2 * c.S));
    const col = w.jumpable ? [150, 150, 120, 255] : C.wall;
    drawLine(
      surf,
      wx(c, w.from.x),
      wy(c, w.from.y),
      wx(c, w.to.x),
      wy(c, w.to.y),
      col,
      thick,
    );
  }
  // Doors: the gap in a wall a key opens — a bright dashed opening.
  for (const d of def.doors ?? []) {
    const thick = Math.max(3, Math.round(d.radius * 2 * c.S));
    drawLine(
      surf,
      wx(c, d.from.x),
      wy(c, d.from.y),
      wx(c, d.to.x),
      wy(c, d.to.y),
      C.door,
      thick,
    );
    label(surf, "DOOR", wx(c, d.from.x) + 3, wy(c, d.from.y) - 8, C.door);
  }
  for (const w of def.wells ?? [])
    strokeCircle(surf, wx(c, w.pos.x), wy(c, w.pos.y), 8, C.well, 2);
  // Landmarks.
  for (const lm of def.landmarks ?? []) {
    fillRect(surf, wx(c, lm.pos.x) - 2, wy(c, lm.pos.y) - 2, 4, 4, C.landmark);
    label(surf, lm.kind, wx(c, lm.pos.x) + 4, wy(c, lm.pos.y) - 2, C.dim);
  }
}

/** Pinned set pieces (elites/boss), packs, chests, merchant, spawn/objective,
 * and the hero-path arrow. Returns the ordered path waypoints. */
function drawEncounters(c) {
  const { def, surf } = c;
  const spawn = { x: wx(c, def.playerSpawn.x), y: wy(c, def.playerSpawn.y) };
  // START marker.
  fillCircle(surf, spawn.x, spawn.y, 4, C.spawn);
  label(surf, "START", spawn.x + 5, spawn.y - 2, C.spawn);

  // Pinned spawns → classify.
  const pinned = (def.spawns ?? []).filter((s) => "at" in s);
  const setPieces = [];
  for (const s of pinned) {
    const p = {
      x: wx(c, s.at.x),
      y: wy(c, s.at.y),
      id: s.enemy,
      role: roleOf(s.enemy),
      world: s.at,
    };
    setPieces.push(p);
  }
  // Objective anchor.
  const boss = setPieces.find((p) => p.role === "boss");
  let objective = null;
  if (def.objective.type === "reachExit")
    objective = { x: wx(c, def.objective.at.x), y: wy(c, def.objective.at.y) };
  else if (boss) objective = { x: boss.x, y: boss.y };

  // Hero path: START → elites in progression order → objective.
  const elites = setPieces
    .filter((p) => p.role === "elite")
    .sort(
      (a, b) => dist(def.playerSpawn, a.world) - dist(def.playerSpawn, b.world),
    );
  const path = [spawn, ...elites, ...(objective ? [objective] : [])];
  for (let i = 0; i < path.length - 1; i++)
    drawArrow(
      surf,
      path[i].x,
      path[i].y,
      path[i + 1].x,
      path[i + 1].y,
      C.path,
      2,
      7,
    );

  // Packs (with trigger rings).
  for (const pk of def.packs ?? []) {
    const px = wx(c, pk.at.x);
    const py = wy(c, pk.at.y);
    const tr = (pk.triggerRadius ?? 260) * c.S;
    strokeCircle(surf, px, py, tr, [C.pack[0], C.pack[1], C.pack[2], 90], 1);
    fillCircle(surf, px, py, 3, C.pack);
    const n = (pk.members ?? []).reduce(
      (sum, m) => sum + (typeof m.count === "number" ? m.count : 3),
      0,
    );
    label(surf, `PACK ${n}`, px + 4, py + 2, C.pack);
  }
  // Chests.
  for (const ch of def.chests ?? []) {
    fillRect(surf, wx(c, ch.at.x) - 3, wy(c, ch.at.y) - 2, 6, 4, C.chest);
    label(surf, "CHEST", wx(c, ch.at.x) + 4, wy(c, ch.at.y) - 2, C.chest);
  }
  // Merchant spawn points.
  for (const m of def.merchantSpawns ?? []) {
    fillCircle(surf, wx(c, m.x), wy(c, m.y), 3, C.merchant);
    label(surf, "SHOP", wx(c, m.x) + 4, wy(c, m.y) - 2, C.merchant);
  }
  // Elites + boss markers ON TOP.
  for (const p of setPieces) {
    if (p.role === "boss") {
      star(surf, p.x, p.y, 5, C.boss);
      label(surf, enemyName(p.id), p.x + 7, p.y - 2, C.boss);
    } else if (p.role === "elite") {
      diamond(surf, p.x, p.y, 4, C.elite);
      label(surf, enemyName(p.id), p.x + 6, p.y - 2, C.elite);
    } else {
      fillCircle(surf, p.x, p.y, 2, C.ink);
    }
  }
}

function drawTempo(c) {
  if (!c.tempoH) return;
  const { def, surf } = c;
  const y0 = c.oy + c.mapH + 6;
  const h = c.tempoH;
  fillRect(surf, c.ox, y0, c.mapW, h, C.panel);
  const samples = 80;
  const maxI = Math.max(1.5, ...def.tempo.map((p) => p.intensity));
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    const inten = tempoAt(def.tempo, t);
    const barH = Math.round((inten / maxI) * (h - 2));
    const f = Math.min(1, inten / maxI);
    const col = [
      Math.round(C.tempoLo[0] + (C.tempoHi[0] - C.tempoLo[0]) * f),
      Math.round(C.tempoLo[1] + (C.tempoHi[1] - C.tempoLo[1]) * f),
      Math.round(C.tempoLo[2] + (C.tempoHi[2] - C.tempoLo[2]) * f),
      255,
    ];
    const x = c.ox + Math.round(t * (c.mapW - 1));
    fillRect(surf, x, y0 + (h - barH), 1, barH, col);
  }
  // Baseline (intensity 1).
  const baseY = y0 + Math.round(h - (1 / maxI) * (h - 2));
  drawLine(
    surf,
    c.ox,
    baseY,
    c.ox + c.mapW,
    baseY,
    [C.ink[0], C.ink[1], C.ink[2], 120],
    1,
  );
  label(surf, "TEMPO  (opening -> end)", c.ox + 2, y0 + 1, C.dim);
}

/** Piecewise-linear tempo lookup (mirrors tempoIntensity in step.ts). */
function tempoAt(tempo, p) {
  if (!tempo?.length) return 1;
  let value = tempo[0].intensity;
  for (let i = 0; i < tempo.length; i++) {
    const cur = tempo[i];
    if (p <= cur.at) {
      if (i === 0) return cur.intensity;
      const prev = tempo[i - 1];
      const f = (p - prev.at) / Math.max(1e-6, cur.at - prev.at);
      return prev.intensity + (cur.intensity - prev.intensity) * f;
    }
    value = cur.intensity;
  }
  return value;
}

function drawLegend(c, description, extra = []) {
  const { def, surf } = c;
  let x = c.legendX;
  let y = c.legendY;
  fillRect(surf, x - 4, y - 4, LEGEND_W, c.height - y - PAD + 4, C.panel);
  const line = (text, color = C.ink) => {
    label(surf, text, x, y, color);
    y += 8;
  };
  const swatch = (color, text) => {
    fillRect(surf, x, y, 6, 6, color);
    label(surf, text, x + 9, y, C.ink);
    y += 8;
  };
  line("LEGEND", C.ink);
  y += 2;
  swatch(C.spawn, "START");
  swatch(C.path, "HERO PATH");
  swatch(C.boss, "BOSS");
  swatch(C.elite, "ELITE");
  swatch(C.pack, "MOB PACK");
  swatch(C.chest, "CHEST");
  swatch(C.merchant, "MERCHANT");
  swatch(C.safe, "SAFE ZONE");
  swatch(C.quiet, "DEAD ZONE");
  swatch(C.well, "GRAVITY WELL");
  swatch(C.door, "LOCKED DOOR");
  y += 4;
  // Rare/unique encounters (random positions — listed, not placed).
  const rare = def.rareSpawns?.rare ?? [];
  const uniq = def.rareSpawns?.unique ?? [];
  if (rare.length) line(`RARE: ${rare.join(", ")}`, C.rare);
  if (uniq.length) line(`UNIQUE: ${uniq.join(", ")}`, C.unique);
  if (def.gates?.length)
    line(`GATE -> ${def.gates.map((g) => g.to).join(", ")}`, C.gate);
  line(`OBJ: ${def.objective.type}`, C.dim);
  for (const e of extra) line(e, C.dim);
  y += 4;
  // Wrapped description.
  for (const row of wrapText(description || "", 30)) line(row, C.dim);
}

function wrapText(text, cols) {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const rows = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > cols) {
      if (cur) rows.push(cur);
      cur = w;
    } else cur = (cur + " " + w).trim();
  }
  if (cur) rows.push(cur);
  return rows.slice(0, 16);
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// ---- actual + heatmap overlays --------------------------------------------
async function drawActual(c, seed, difficulty) {
  const { createGame } = await import(engine("src/index.ts"));
  const state = createGame(seed, c.def.id, difficulty);
  const { surf } = c;
  // Obstacles at their TRUE blocking footprint, so the navigable layout (the
  // corridors the scatter + walls actually leave) is legible: solid barriers
  // filled opaque, jumpable cover outlined (hoppable), crates/chests tinted.
  for (const o of state.obstacles) {
    const cx = wx(c, o.pos.x);
    const cy = wy(c, o.pos.y);
    const hw = Math.max(1.5, (o.half ? o.half.x : o.radius) * c.S);
    const hh = Math.max(1.5, (o.half ? o.half.y : o.radius) * c.S);
    if (o.chest) fillRect(surf, cx - hw, cy - hh, hw * 2, hh * 2, C.chest);
    else if (o.breakable)
      fillRect(surf, cx - hw, cy - hh, hw * 2, hh * 2, [200, 155, 85, 255]);
    else if (o.jumpable) {
      // Hoppable cover — outline only, so it reads as passable.
      strokeRect(
        surf,
        cx - hw,
        cy - hh,
        hw * 2,
        hh * 2,
        [150, 150, 128, 230],
        1,
      );
    } else {
      // SOLID barrier — filled stony grey with a bright edge so the corridors
      // it carves pop against the ground.
      fillRect(surf, cx - hw, cy - hh, hw * 2, hh * 2, [128, 126, 140, 255]);
      strokeRect(
        surf,
        cx - hw,
        cy - hh,
        hw * 2,
        hh * 2,
        [190, 190, 205, 255],
        1,
      );
    }
  }
  // Mobs: minions as faint dots (placement texture), set pieces bold.
  for (const e of state.enemies) {
    const role = roleOf(e.defId);
    if (role === "minion") {
      fillRect(surf, wx(c, e.pos.x), wy(c, e.pos.y), 1, 1, [200, 90, 90, 150]);
    } else {
      fillCircle(
        surf,
        wx(c, e.pos.x),
        wy(c, e.pos.y),
        3,
        role === "boss" ? C.boss : C.elite,
      );
    }
  }
  label(
    surf,
    `ACTUAL  seed ${seed}  ${difficulty}  (solid=barrier, outline=jumpable)`,
    c.ox + 2,
    c.oy + 2,
    C.ink,
  );
  return state;
}

// ---- entry -----------------------------------------------------------------
async function renderLevel(entry, opts) {
  const { def, description } = entry;
  const c = makeCanvas(def);
  drawBase(c, description);
  const extra = [];
  if (opts.heatmap) {
    const spatial = await runTrace(def.id, opts.seed, opts.difficulty);
    drawHeatmap(c, spatial);
    extra.push(
      `COVERAGE: ${spatial.coveragePct}% of map`,
      `SPAWNS: ${spatial.spawns?.length ?? 0}  KILLS: ${spatial.kills?.length ?? 0}`,
      `PATH: bot ${opts.difficulty}`,
    );
  }
  if (opts.actual && !opts.heatmap)
    await drawActual(c, opts.seed, opts.difficulty);
  drawEncounters(c);
  drawTempo(c);
  drawLegend(c, description, extra);
  const out = `${previewDir}/map_${def.id}${opts.heatmap ? "_heat" : opts.actual ? "_actual" : ""}.png`;
  await writePng(upscale(c.surf, 2), out);
  console.log(`wrote ${out} (${c.width}x${c.height} @2x)`);
}

async function runTrace(id, seed, difficulty) {
  const { simulateLevel } = await import(engine("src/sim/simulate.ts"));
  const report = simulateLevel({
    levelId: id,
    difficulty,
    seed,
    autoShop: true,
    trace: true,
  });
  return report.spatial ?? { path: [], kills: [], coveragePct: 0 };
}

function drawHeatmap(c, spatial) {
  const { surf } = c;
  // Layer 1 — MOB DENSITY (cool): where the horde formed and moved, per cell.
  const md = spatial.mobDensity;
  if (md?.grid?.length) {
    const max = Math.max(1, ...md.grid);
    for (let i = 0; i < md.grid.length; i++) {
      const v = md.grid[i];
      if (v <= 0) continue;
      const col = i % md.cols;
      const row = Math.floor(i / md.cols);
      const a = Math.min(150, Math.round((v / max) * 150));
      fillRect(
        surf,
        wx(c, col * md.cell),
        wy(c, row * md.cell),
        md.cell * c.S,
        md.cell * c.S,
        [70, 140, 240, a],
      );
    }
  }
  // Layer 2 — HERO DWELL (warm): where the map was actually used.
  for (const p of spatial.path ?? [])
    fillCircle(surf, wx(c, p.x), wy(c, p.y), 3, [250, 180, 40, 26]);
  // Layer 3 — SPAWNS (faint cyan dots): the horde's entry points.
  for (const s of spatial.spawns ?? [])
    fillRect(surf, wx(c, s.x), wy(c, s.y), 1, 1, [120, 230, 230, 60]);
  // Layer 4 — KILLS (red).
  for (const k of spatial.kills ?? [])
    fillRect(surf, wx(c, k.x), wy(c, k.y), 1, 1, [255, 60, 60, 170]);
  label(
    surf,
    "MOB DENSITY (blue) . DWELL (warm) . SPAWNS (cyan) . KILLS (red)",
    c.ox + 2,
    c.oy + 12,
    C.ink,
  );
}

function parseArgs(argv) {
  const opts = {
    seed: 1,
    difficulty: "medium",
    actual: false,
    heatmap: false,
    all: false,
  };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--actual") opts.actual = true;
    else if (a === "--heatmap") opts.heatmap = true;
    else if (a === "--all") opts.all = true;
    else if (a === "--seed") opts.seed = Number(argv[++i]);
    else if (a === "--difficulty") opts.difficulty = argv[++i];
    else rest.push(a);
  }
  opts.id = rest[0];
  return opts;
}

const { entries } = loadLevels();
const opts = parseArgs(process.argv.slice(2));
if (opts.heatmap && opts.difficulty === "medium") opts.difficulty = "easy";

if (opts.all) {
  for (const entry of entries) await renderLevel(entry, opts);
} else {
  const entry = entries.find((e) => e.id === opts.id);
  if (!entry) {
    console.error(
      `unknown level "${opts.id}" — try: ${entries.map((e) => e.id).join(", ")}`,
    );
    process.exit(1);
  }
  await renderLevel(entry, opts);
}
