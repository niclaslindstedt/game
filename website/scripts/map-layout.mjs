#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The MAP LAYOUT renderer (see the `map-improvement` + `level-design` skills):
// a CLEAN, HIGH-RESOLUTION, top-down blueprint of a level's AUTHORED layout —
// the first thing to look at to UNDERSTAND a map before touching it. Where
// `map-preview.mjs` is the analysis view (trigger rings, density smears, a
// derived path, the played heatmap), this is the reference blueprint: a
// coordinate grid you can read x/y off for editing, every wall + gap, the
// authored hero path, every spawn point, pinned elite/boss/guardian, chest,
// merchant, zone, landmark and placed item — plus a full side dossier of the
// per-difficulty mob-level bands and each encounter's hp/level. It reads the
// YAML directly (no sim, deterministic, fast).
//
//   node website/scripts/map-layout.mjs <id>            one level
//   node website/scripts/map-layout.mjs --all           every level
//   node website/scripts/map-layout.mjs <id> --seed 1   + scatter real obstacles
//   node website/scripts/map-layout.mjs <id> --width 1800  bigger map area (px)
//
// Output → website/assets-preview/map_<id>_layout.png. Also `make map-layout
// LEVEL=<id>`.

import { register } from "node:module";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { renderText, FONT_HEIGHT } from "./asset-tools/font.mjs";
import { renderHudText } from "./asset-tools/font-hud.mjs";
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
  bg: [16, 16, 20, 255],
  ground: [44, 42, 52, 255],
  groundZone: [58, 54, 70, 255],
  panel: [26, 26, 32, 255],
  panelEdge: [70, 70, 84, 255],
  ink: [236, 236, 240, 255],
  dim: [156, 156, 168, 255],
  faint: [110, 110, 122, 255],
  grid: [255, 255, 255, 18],
  gridMajor: [255, 255, 255, 40],
  axis: [150, 150, 165, 255],
  wall: [136, 134, 148, 255],
  wallJump: [150, 150, 118, 255],
  door: [230, 200, 90, 255],
  well: [180, 120, 230, 255],
  path: [90, 200, 255, 255],
  spawn: [110, 235, 150, 255],
  boss: [244, 74, 74, 255],
  elite: [250, 162, 62, 255],
  unique: [250, 220, 80, 255],
  rare: [120, 200, 255, 255],
  guardian: [250, 150, 200, 255],
  spawner: [236, 92, 206, 255],
  spawnerRing: [236, 92, 206, 26],
  chest: [250, 200, 90, 255],
  merchant: [90, 220, 220, 255],
  landmark: [200, 200, 216, 255],
  item: [130, 235, 160, 255],
  safe: [80, 210, 130, 80],
  quiet: [150, 110, 220, 80],
  zoneEdge: [220, 220, 232, 170],
};

const roleOf = (id) => ENEMY_DEFS[id]?.role ?? "minion";
const enemyName = (id) => ENEMY_DEFS[id]?.name ?? String(id).toUpperCase();

// ---- text helpers ----------------------------------------------------------
/** Blit a line of pixel-font text; underscores read as spaces (no `_` glyph). */
function text(surf, str, x, y, color = C.ink) {
  const t = renderText(String(str).replace(/_/g, " "), color);
  blit(surf, t, x, y);
  return t.width;
}

/** Map label — the taller, rounder HUD font (7px) so names read clearly while
 * scanning the map, with a 1px drop shadow instead of a heavy plate. The HUD
 * font is caps + digits + ` :.-/`, so callers pre-sanitise other punctuation. */
function label(surf, str, x, y, color = C.ink) {
  const clean = String(str).replace(/_/g, " ");
  const shadow = renderHudText(clean, [0, 0, 0, 230]);
  blit(surf, shadow, x + 1, y + 1);
  const t = renderHudText(clean, color);
  blit(surf, t, x, y);
  return t.width;
}

/** Word-wrap to a column count (chars), capped at `maxRows`. */
function wrap(str, cols, maxRows = 40) {
  const words = String(str).replace(/\s+/g, " ").trim().split(" ");
  const rows = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > cols) {
      if (cur) rows.push(cur);
      cur = w;
    } else cur = (cur + " " + w).trim();
  }
  if (cur) rows.push(cur);
  return rows.slice(0, maxRows);
}

// ---- markers ---------------------------------------------------------------
function diamond(surf, cx, cy, r, color) {
  for (let dy = -r; dy <= r; dy++) {
    const w = r - Math.abs(dy);
    for (let dx = -w; dx <= w; dx++)
      fillRect(surf, cx + dx, cy + dy, 1, 1, color);
  }
}

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

/** A tiny plus (medkit / placed item). */
function plus(surf, cx, cy, r, color) {
  fillRect(surf, cx - r, cy, r * 2 + 1, 1, color);
  fillRect(surf, cx, cy - r, 1, r * 2 + 1, color);
}

// ---- def helpers -----------------------------------------------------------
/** Total mobs an emitter queues (a `count`, or ~3 for a countless pack triple). */
const memberCount = (members) =>
  (members ?? []).reduce(
    (s, m) => s + (typeof m.count === "number" ? m.count : 3),
    0,
  );

/** "wisp+ghost" — the member enemy ids, dominant first. */
function memberTypes(members) {
  return (members ?? [])
    .slice()
    .sort((a, b) => memberCount([b]) - memberCount([a]))
    .map((m) => String(m.enemy))
    .join("+");
}

/** Normalise a per-difficulty band cell to "lo-hi" or "n". Accepts [lo,hi],
 * a scalar, or undefined. */
function bandCell(v) {
  if (Array.isArray(v)) return v[0] === v[1] ? `${v[0]}` : `${v[0]}-${v[1]}`;
  if (v == null) return "·";
  return `${v}`;
}

/** Render a mobLevels-shaped value (4 per-difficulty cells) as "E / M / H / N". */
function bandRow(levels) {
  if (!Array.isArray(levels)) return "·";
  return levels.map(bandCell).join(" / ");
}

// ---- canvas ----------------------------------------------------------------
const PAD = 12;
const TITLE_H = 10;
const RULER = 20; // gutter for the y-axis coordinate labels
const GAP = 12;
const PANEL_W = 340;

function makeCanvas(def, targetW) {
  const S = targetW / def.width;
  const mapW = Math.round(def.width * S);
  const mapH = Math.round(def.height * S);
  const ox = PAD + RULER;
  const oy = PAD + TITLE_H + FONT_HEIGHT + 4;
  const mapBottom = oy + mapH;
  const width = ox + mapW + GAP + PANEL_W + PAD;
  const height = Math.max(mapBottom, oy + 900) + PAD;
  const surf = fill(createSurface(width, height), C.bg);
  return { def, S, ox, oy, mapW, mapH, mapBottom, width, height, surf };
}

// World→image transform. ROUND to integers: the raw surface primitives write
// pixels by a `(y*width + x)*4` index with no flooring, so a fractional y adds
// 0.5·width to the index and WRAPS the x by width/2 — every label would land at
// the wrong place. Integer pixel coords are also simply correct for pixel art.
const wx = (c, x) => Math.round(c.ox + x * c.S);
const wy = (c, y) => Math.round(c.oy + y * c.S);

// ---- the map ---------------------------------------------------------------
function drawGrid(c) {
  const { def, surf, ox, oy, mapW, mapH } = c;
  fillRect(surf, ox, oy, mapW, mapH, C.ground);
  for (const z of def.tiles?.zones ?? [])
    fillRect(
      surf,
      wx(c, z.rect.x),
      wy(c, z.rect.y),
      z.rect.width * c.S,
      z.rect.height * c.S,
      C.groundZone,
    );
  // Coordinate grid — a minor line every `step`, a labelled major every 2×.
  const step = def.width > 2600 ? 400 : 200;
  for (let x = 0; x <= def.width; x += step) {
    const px = wx(c, x);
    const major = x % (step * 2) === 0;
    drawLine(surf, px, oy, px, oy + mapH, major ? C.gridMajor : C.grid, 1);
    if (major) text(surf, `${x}`, px + 1, oy - FONT_HEIGHT - 2, C.axis);
  }
  for (let y = 0; y <= def.height; y += step) {
    const py = wy(c, y);
    const major = y % (step * 2) === 0;
    drawLine(surf, ox, py, ox + mapW, py, major ? C.gridMajor : C.grid, 1);
    if (major) text(surf, `${y}`, ox - RULER + 1, py - 2, C.axis);
  }
  strokeRect(surf, ox, oy, mapW, mapH, C.dim, 1);
}

function drawZones(c) {
  const { def, surf } = c;
  const zone = (z, fillC, fallback) => {
    if (z.shape === "rect") {
      const x = wx(c, z.rect.x);
      const y = wy(c, z.rect.y);
      fillRect(surf, x, y, z.rect.width * c.S, z.rect.height * c.S, fillC);
      strokeRect(
        surf,
        x,
        y,
        z.rect.width * c.S,
        z.rect.height * c.S,
        C.zoneEdge,
        1,
      );
      label(surf, z.label ?? fallback, x + 2, y + 2, C.ink);
    } else {
      const cx = wx(c, z.pos.x);
      const cy = wy(c, z.pos.y);
      fillCircle(surf, cx, cy, z.radius * c.S, fillC);
      strokeCircle(surf, cx, cy, z.radius * c.S, C.zoneEdge, 1);
      label(surf, z.label ?? fallback, cx - 12, cy - 3, C.ink);
    }
  };
  for (const z of def.safeZones ?? []) zone(z, C.safe, "SAFE");
  for (const z of def.quietZones ?? []) zone(z, C.quiet, "DEAD");
}

function drawWalls(c) {
  const { def, surf } = c;
  for (const w of def.walls ?? []) {
    const thick = Math.max(3, Math.round(w.radius * 2 * c.S));
    drawLine(
      surf,
      wx(c, w.from.x),
      wy(c, w.from.y),
      wx(c, w.to.x),
      wy(c, w.to.y),
      w.jumpable ? C.wallJump : C.wall,
      thick,
    );
  }
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
    strokeCircle(
      surf,
      wx(c, w.pos.x),
      wy(c, w.pos.y),
      Math.max(6, (w.radius ?? 40) * c.S),
      C.well,
      2,
    );
}

/** The AUTHORED hero path (def.path) — the intended route, waypoints numbered.
 * Falls back to START→elites→boss when no path is authored. */
function drawPath(c) {
  const { def, surf } = c;
  let pts = def.path;
  if (!pts?.length) {
    const spawn = def.playerSpawn;
    const elites = (def.spawns ?? [])
      .filter((s) => "at" in s && roleOf(s.enemy) === "elite")
      .map((s) => s.at)
      .sort((a, b) => dist(spawn, a) - dist(spawn, b));
    const boss = (def.spawns ?? []).find(
      (s) => "at" in s && roleOf(s.enemy) === "boss",
    );
    pts = [spawn, ...elites, ...(boss ? [boss.at] : [])];
  }
  for (let i = 0; i < pts.length - 1; i++)
    drawArrow(
      surf,
      wx(c, pts[i].x),
      wy(c, pts[i].y),
      wx(c, pts[i + 1].x),
      wy(c, pts[i + 1].y),
      C.path,
      2,
      7,
    );
  pts.forEach((p, i) => {
    fillCircle(surf, wx(c, p.x), wy(c, p.y), 2, C.path);
    // Waypoint number top-LEFT of the node — clears the enemy (top-right) and
    // spawner (bottom-right) labels that co-locate on the path.
    if (def.path)
      label(surf, `${i + 1}`, wx(c, p.x) - 10, wy(c, p.y) - 11, C.path);
  });
}

function drawSpawners(c) {
  const { def, surf } = c;
  (def.spawners ?? []).forEach((s, i) => {
    const px = wx(c, s.at.x);
    const py = wy(c, s.at.y);
    strokeCircle(
      surf,
      px,
      py,
      (s.triggerRadius ?? 320) * c.S,
      C.spawnerRing,
      1,
    );
    fillCircle(surf, px, py, 3, C.spawner);
    // Spawner tag bottom-RIGHT so it clears a co-located elite's top-right name.
    // HUD font has no ×, so the count reads plain (the panel spells it out).
    label(
      surf,
      `S${i + 1} ${s.id ?? ""} ${memberCount(s.members)}`,
      px + 5,
      py + 6,
      C.spawner,
    );
  });
}

function drawEncounters(c) {
  const { def, surf } = c;
  // Chests, merchant, placed items, landmarks first (under the enemy markers).
  for (const ch of def.chests ?? []) {
    fillRect(surf, wx(c, ch.at.x) - 3, wy(c, ch.at.y) - 3, 6, 6, C.chest);
    label(surf, "CHEST", wx(c, ch.at.x) + 5, wy(c, ch.at.y) - 3, C.chest);
  }
  for (const m of def.merchantSpawns ?? []) {
    fillCircle(surf, wx(c, m.x), wy(c, m.y), 3, C.merchant);
    label(surf, "SHOP", wx(c, m.x) + 5, wy(c, m.y) - 3, C.merchant);
  }
  for (const it of def.placedItems ?? []) {
    plus(surf, wx(c, it.pos.x), wy(c, it.pos.y), 2, C.item);
    label(
      surf,
      it.defId ?? it.kind,
      wx(c, it.pos.x) + 4,
      wy(c, it.pos.y) - 3,
      C.item,
    );
  }
  for (const lm of def.landmarks ?? []) {
    fillRect(surf, wx(c, lm.pos.x) - 2, wy(c, lm.pos.y) - 2, 4, 4, C.landmark);
    label(surf, lm.kind, wx(c, lm.pos.x) + 4, wy(c, lm.pos.y) - 3, C.landmark);
  }
  // Pinned enemies on top: boss star, elite diamond, guardian (rare/unique in a
  // quiet pocket) dot, minion faint dot.
  for (const s of (def.spawns ?? []).filter((e) => "at" in e)) {
    const px = wx(c, s.at.x);
    const py = wy(c, s.at.y);
    const role = roleOf(s.enemy);
    const rarity = ENEMY_DEFS[s.enemy]?.rarity;
    // Enemy names top-RIGHT (above the marker) so they clear the spawner tag
    // that sits bottom-right when an elite guards a knot.
    if (role === "boss") {
      star(surf, px, py, 5, C.boss);
      label(surf, enemyName(s.enemy), px + 7, py - 11, C.boss);
    } else if (role === "elite") {
      diamond(surf, px, py, 4, C.elite);
      label(surf, enemyName(s.enemy), px + 6, py - 11, C.elite);
    } else if (rarity === "unique" || rarity === "rare") {
      diamond(surf, px, py, 3, C.guardian);
      label(surf, enemyName(s.enemy), px + 6, py - 11, C.guardian);
    } else {
      fillCircle(surf, px, py, 2, C.ink);
    }
  }
  // START marker last so it's never buried.
  const sx = wx(c, def.playerSpawn.x);
  const sy = wy(c, def.playerSpawn.y);
  fillCircle(surf, sx, sy, 4, C.spawn);
  label(surf, "START", sx + 6, sy - 3, C.spawn);
}

async function drawObstacles(c, seed, difficulty) {
  const { createGame } = await import(engine("src/index.ts"));
  const state = createGame(seed, c.def.id, difficulty);
  const { surf } = c;
  for (const o of state.obstacles) {
    const cx = wx(c, o.pos.x);
    const cy = wy(c, o.pos.y);
    const hw = Math.max(1.5, (o.half ? o.half.x : o.radius) * c.S);
    const hh = Math.max(1.5, (o.half ? o.half.y : o.radius) * c.S);
    if (o.chest) continue; // drawn from the authored def already
    if (o.jumpable)
      strokeRect(
        surf,
        cx - hw,
        cy - hh,
        hw * 2,
        hh * 2,
        [150, 150, 128, 200],
        1,
      );
    else fillRect(surf, cx - hw, cy - hh, hw * 2, hh * 2, [120, 118, 132, 255]);
  }
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// ---- the dossier panel -----------------------------------------------------
function drawPanel(c, description) {
  const { def, surf } = c;
  const x0 = c.ox + c.mapW + GAP;
  const w = PANEL_W;
  fillRect(surf, x0, PAD, w, c.height - PAD * 2, C.panel);
  strokeRect(surf, x0, PAD, w, c.height - PAD * 2, C.panelEdge, 1);
  const x = x0 + 6;
  let y = PAD + 5;
  const LH = FONT_HEIGHT + 3;
  const line = (str, color = C.ink) => {
    if (str !== "") text(surf, str, x, y, color);
    y += LH;
  };
  const rule = () => {
    fillRect(surf, x, y + 1, w - 12, 1, C.panelEdge);
    y += 5;
  };
  const head = (str) => {
    y += 2;
    text(surf, str, x, y, C.spawner);
    y += LH;
    rule();
  };
  const swatch = (color, str) => {
    fillRect(surf, x, y, 6, 6, color);
    text(surf, str, x + 10, y, C.ink);
    y += LH;
  };

  // Identity.
  text(surf, `${def.name}  (${def.id})`, x, y, C.ink);
  y += LH;
  line(
    `BIOME ${def.biome ?? "?"}   ${def.width}×${def.height}   GRAV ${def.gravity ?? "?"}`,
    C.dim,
  );
  line(`OBJ ${def.objective?.type ?? "?"}   FOES ${def.foes ?? "?"}`, C.dim);
  const mobTotal = (def.spawners ?? []).reduce(
    (s, sp) => s + memberCount(sp.members),
    0,
  );
  line(
    `${(def.spawners ?? []).length} SPAWNERS · ${mobTotal} MOBS · ${(def.chests ?? []).length} CHESTS`,
    C.dim,
  );
  rule();

  // Per-difficulty default mob-level band.
  head("MOB LEVELS  (E / M / H / NM)");
  line(bandRow(def.mobLevels), C.ink);
  line("JESUS: player-relative (unauthored)", C.faint);

  // Legend.
  head("LEGEND");
  swatch(C.spawn, "START");
  swatch(C.path, "HERO PATH (numbered)");
  swatch(C.boss, "BOSS");
  swatch(C.elite, "ELITE");
  swatch(C.guardian, "PINNED RARE/UNIQUE");
  swatch(C.spawner, "SPAWNER KNOT");
  swatch(C.chest, "CHEST");
  swatch(C.merchant, "MERCHANT");
  swatch(C.item, "PLACED ITEM");
  swatch(C.safe, "SAFE ZONE");
  swatch(C.quiet, "QUIET / DEAD ZONE");
  swatch(C.wall, "WALL");
  swatch(C.wallJump, "JUMPABLE WALL");

  // Spawn points table.
  head("SPAWN KNOTS  (id ×count, maxAlive, types)");
  (def.spawners ?? []).forEach((s, i) => {
    line(
      `S${i + 1} ${s.id ?? ""}  ×${memberCount(s.members)}  a${s.maxAlive ?? "?"} r${s.triggerRadius ?? "?"}`,
      C.ink,
    );
    line(`   ${memberTypes(s.members)}`, C.dim);
    line(`   L ${bandRow(s.mobLevels ?? def.mobLevels)}`, C.faint);
  });

  // Pinned encounters — hp & level per difficulty.
  head("ELITES / BOSSES  (L E/M/H/NM · HP)");
  for (const s of (def.spawns ?? []).filter((e) => "at" in e)) {
    const role = roleOf(s.enemy);
    const rarity = ENEMY_DEFS[s.enemy]?.rarity ?? "";
    const tag =
      role === "boss"
        ? "BOSS"
        : role === "elite"
          ? "ELITE"
          : rarity.toUpperCase();
    const col =
      role === "boss" ? C.boss : role === "elite" ? C.elite : C.guardian;
    text(surf, `${enemyName(s.enemy)} (${tag})`, x, y, col);
    y += LH;
    line(`   L ${bandRow(s.level)}`, C.dim);
    line(
      `   HP ${Array.isArray(s.hp) ? s.hp.join(" / ") : (s.hp ?? "def")}`,
      C.faint,
    );
  }

  // Rares that spawn at random positions (listed, not placed).
  const rare = def.rareSpawns?.rare ?? [];
  const uniq = def.rareSpawns?.unique ?? [];
  if (rare.length || uniq.length) {
    head("RANDOM RARES");
    if (rare.length) line(`RARE: ${rare.join(", ")}`, C.rare);
    if (uniq.length) line(`UNIQUE: ${uniq.join(", ")}`, C.unique);
  }

  // Description.
  if (description) {
    head("DESIGN INTENT");
    for (const row of wrap(description, 54, 60)) line(row, C.dim);
  }
}

// ---- entry -----------------------------------------------------------------
async function renderLevel(entry, opts) {
  const { def, description } = entry;
  const c = makeCanvas(def, opts.width);
  // Title.
  const step = def.width > 2600 ? 400 : 200;
  label(
    c.surf,
    `MAP LAYOUT - ${def.name} - ${def.id} - GRID ${step}U`,
    PAD,
    PAD - 1,
    C.ink,
  );
  drawGrid(c);
  drawZones(c);
  if (opts.seed != null) await drawObstacles(c, opts.seed, opts.difficulty);
  drawWalls(c);
  drawPath(c);
  drawSpawners(c);
  drawEncounters(c);
  drawPanel(c, description);
  const out = `${previewDir}/map_${def.id}_layout.png`;
  await writePng(upscale(c.surf, 2), out);
  console.log(
    `wrote ${out} (${c.width}×${c.height} @2x = ${c.width * 2}×${c.height * 2})`,
  );
}

function parseArgs(argv) {
  const opts = { width: 1400, difficulty: "medium", all: false, seed: null };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--all") opts.all = true;
    else if (a === "--seed") opts.seed = Number(argv[++i]);
    else if (a === "--difficulty") opts.difficulty = argv[++i];
    else if (a === "--width") opts.width = Number(argv[++i]);
    else rest.push(a);
  }
  opts.id = rest[0];
  return opts;
}

const { entries } = loadLevels();
const opts = parseArgs(process.argv.slice(2));

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
