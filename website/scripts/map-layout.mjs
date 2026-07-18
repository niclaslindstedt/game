#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The MAP LAYOUT renderer (see the `map-improvement` + `level-design` skills):
// a CLEAN, HIGH-RESOLUTION, top-down VISUAL OVERVIEW of a level's authored
// layout — the picture you look at (alongside reading the YAML) to understand a
// map before touching it. It shows only what benefits from being SEEN; the
// numbers live in the YAML and are not repeated here.
//
// On the image: a labelled COORDINATE GRID for orientation, every wall + gap,
// the authored hero path (numbered), the design zones, and every placed thing as
// a DISTINCT SHAPE (star=boss, diamond=elite, triangle=rare/unique, circle=spawn
// knot, cluster=pack, square=chest, +=item, …). SPAWN POINTS render as CON
// CIRCLES: the circle AREA scales with the mob count, and its COLOUR is the con
// — the mob level vs the map's intended hero level (`intendedLevel` in the YAML)
// on the chosen difficulty — so an over/under-tuned difficulty ramp reads at a
// glance (grey trivial → green → yellow even → orange → red brutal). Every mob
// marker is coloured the same way; shape tells you WHAT, colour tells you HOW
// HARD. The side panel is a DECODE KEY only (shapes + the con ramp).
//
//   node website/scripts/map-layout.mjs <id>                 one level
//   node website/scripts/map-layout.mjs --all                every level
//   node website/scripts/map-layout.mjs <id> --difficulty hard   con vs that rung
//   node website/scripts/map-layout.mjs <id> --seed 1        + scatter obstacles
//   node website/scripts/map-layout.mjs <id> --width 1800    bigger map area (px)
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
  dim: [168, 168, 180, 255],
  faint: [120, 120, 132, 255],
  grid: [255, 255, 255, 20],
  gridMajor: [255, 255, 255, 46],
  axis: [150, 150, 165, 255],
  wall: [136, 134, 148, 255],
  wallJump: [156, 156, 110, 255],
  door: [230, 200, 90, 255],
  well: [186, 120, 234, 255],
  path: [90, 200, 255, 255],
  spawn: [96, 236, 130, 255], // START
  merchant: [86, 216, 220, 255],
  chest: [250, 200, 90, 255],
  landmark: [186, 190, 206, 255],
  item: [128, 236, 158, 255],
  exit: [250, 96, 96, 255],
  shape: [196, 198, 210, 255], // neutral, for legend shapes whose colour = con
  section: [236, 132, 214, 255],
  safe: [80, 210, 130, 80],
  quiet: [150, 110, 220, 80],
  zoneEdge: [220, 220, 232, 170],
  coord: [128, 132, 150, 255],
};

// WoW-style CON ramp: mob level minus intended hero level → difficulty colour.
const CON_STOPS = [
  [-99, [132, 134, 142], "TRIVIAL"], // grey
  [-4, [104, 202, 112], "EASY"], // green
  [-1, [228, 208, 90], "EVEN"], // yellow
  [2, [240, 152, 62], "TOUGH"], // orange
  [5, [238, 82, 82], "BRUTAL"], // red
];
function conColor(con) {
  if (con == null) return C.shape;
  let col = CON_STOPS[0][1];
  for (const [lo, c] of CON_STOPS) if (con >= lo) col = c;
  return [...col, 255];
}

const DIFF_IDX = { easy: 0, medium: 1, hard: 2, nightmare: 3 };
const roleOf = (id) => ENEMY_DEFS[id]?.role ?? "minion";
const rarityOf = (id) => ENEMY_DEFS[id]?.rarity;
const enemyName = (id) => ENEMY_DEFS[id]?.name ?? String(id).toUpperCase();
const bandMid = (v) => (Array.isArray(v) ? (v[0] + v[1]) / 2 : v);

// ---- text helpers ----------------------------------------------------------
function text(surf, str, x, y, color = C.ink) {
  blit(surf, renderText(String(str).replace(/_/g, " "), color), x, y);
}
/** Map label — taller HUD font (7px) + 1px drop shadow, clean over any ground. */
function label(surf, str, x, y, color = C.ink) {
  const clean = String(str).replace(/_/g, " ");
  blit(surf, renderHudText(clean, [0, 0, 0, 230]), x + 1, y + 1);
  blit(surf, renderHudText(clean, color), x, y);
}
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

// ---- marker shapes (map + legend share these, so the key is exact) ----------
const mkCircle = (s, cx, cy, r, c) => fillCircle(s, cx, cy, r, c);
function mkRing(s, cx, cy, r, c) {
  strokeCircle(s, cx, cy, r, c, 1);
  fillRect(s, cx, cy, 1, 1, c);
}
function mkDiamond(s, cx, cy, r, c) {
  for (let dy = -r; dy <= r; dy++) {
    const w = r - Math.abs(dy);
    for (let dx = -w; dx <= w; dx++) fillRect(s, cx + dx, cy + dy, 1, 1, c);
  }
}
function mkTriangle(s, cx, cy, r, c) {
  for (let dy = -r; dy <= r; dy++) {
    const w = Math.round(((dy + r) / (2 * r)) * r);
    for (let dx = -w; dx <= w; dx++) fillRect(s, cx + dx, cy + dy, 1, 1, c);
  }
}
const mkSquare = (s, cx, cy, r, c) =>
  fillRect(s, cx - r, cy - r, r * 2 + 1, r * 2 + 1, c);
const mkHollowSquare = (s, cx, cy, r, c) =>
  strokeRect(s, cx - r, cy - r, r * 2 + 1, r * 2 + 1, c, 1);
function mkStar(s, cx, cy, r, c) {
  fillCircle(s, cx, cy, r, c);
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2;
    drawLine(
      s,
      cx,
      cy,
      cx + Math.cos(ang) * (r + 3),
      cy + Math.sin(ang) * (r + 3),
      c,
      1,
    );
  }
}
function mkPlus(s, cx, cy, r, c) {
  fillRect(s, cx - r, cy, r * 2 + 1, 1, c);
  fillRect(s, cx, cy - r, 1, r * 2 + 1, c);
}
function mkCluster(s, cx, cy, r, c) {
  mkTriangle(s, cx, cy - 1, Math.max(1, r - 1), c);
  fillRect(s, cx - r, cy + r - 1, 1, 1, c);
  fillRect(s, cx + r, cy + r - 1, 1, 1, c);
}
/** A CON DISC: a translucent con-coloured fill + solid outline, its area ∝ the
 * mob count, with a small kind glyph at the centre. */
function conDisc(surf, cx, cy, count, color, centre) {
  const r = Math.round(Math.min(20, 4 + Math.sqrt(Math.max(1, count)) * 0.85));
  fillCircle(surf, cx, cy, r, [color[0], color[1], color[2], 66]);
  strokeCircle(surf, cx, cy, r, color, 1);
  centre(cx, cy);
  return r;
}

// ---- def helpers -----------------------------------------------------------
const sumRecord = (rec) =>
  rec && typeof rec === "object" ? Math.max(0, ...Object.values(rec)) : 3;
const memberCount = (members) =>
  (members ?? []).reduce(
    (s, m) => s + (typeof m.count === "number" ? m.count : sumRecord(m.count)),
    0,
  );

/** The con (mob level − intended hero level) for a mob-level band on `diff`. */
function conFor(def, levels, diff) {
  const i = DIFF_IDX[diff];
  const intended = def.intendedLevel?.[i];
  if (intended == null || !Array.isArray(levels)) return null;
  const mob = bandMid(levels[i]);
  return mob == null ? null : Math.round(mob - intended);
}

// ---- canvas ----------------------------------------------------------------
const PAD = 12;
const TITLE_H = 12;
const RULER = 22;
const GAP = 12;
const PANEL_W = 300;
const LH = FONT_HEIGHT + 3;

function makeCanvas(def, targetW, panelH) {
  const S = targetW / def.width;
  const mapW = Math.round(def.width * S);
  const mapH = Math.round(def.height * S);
  const ox = PAD + RULER;
  const oy = PAD + TITLE_H + FONT_HEIGHT + 4;
  const mapBottom = oy + mapH + PAD;
  const width = ox + mapW + GAP + PANEL_W + PAD;
  const height = Math.max(mapBottom, PAD + panelH + PAD);
  const surf = fill(createSurface(width, height), C.bg);
  return { def, S, ox, oy, mapW, mapH, width, height, surf };
}

// World→image transform. ROUND: the raw primitives index pixels by `(y*w+x)*4`
// with no flooring, so a fractional y adds 0.5·w to the index and WRAPS x by
// w/2 — every label would land wrong. Integers are also correct for pixel art.
const wx = (c, x) => Math.round(c.ox + x * c.S);
const wy = (c, y) => Math.round(c.oy + y * c.S);
const gridStep = (def) => (def.width > 2600 ? 400 : 200);

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
  const step = gridStep(def);
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
    label(
      surf,
      `DOOR ${d.id ?? ""}`,
      wx(c, d.from.x) + 3,
      wy(c, d.from.y) - 10,
      C.door,
    );
  }
  for (const w of def.wells ?? [])
    strokeCircle(
      surf,
      wx(c, w.pos.x),
      wy(c, w.pos.y),
      Math.max(6, (w.pullRadius ?? 120) * c.S),
      C.well,
      2,
    );
}

function drawPath(c) {
  const { def, surf } = c;
  const pts = def.path;
  if (!pts?.length) return;
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
    label(surf, `${i + 1}`, wx(c, p.x) - 10, wy(c, p.y) - 11, C.path);
  });
}

/** A dim world-coordinate readout, so the agent can correlate the image to the
 * YAML positions it will edit. */
function coord(c, at, x, y) {
  text(c.surf, `${Math.round(at.x)},${Math.round(at.y)}`, x, y, C.coord);
}

function drawSpawners(c, diff) {
  const { def, surf } = c;
  (def.spawners ?? []).forEach((s, i) => {
    const px = wx(c, s.at.x);
    const py = wy(c, s.at.y);
    const con = conFor(def, s.mobLevels ?? def.mobLevels, diff);
    const col = conColor(con);
    strokeCircle(
      surf,
      px,
      py,
      (s.triggerRadius ?? 320) * c.S,
      [col[0], col[1], col[2], 22],
      1,
    );
    const r = conDisc(surf, px, py, memberCount(s.members), col, (x, y) =>
      fillRect(surf, x, y, 1, 1, col),
    );
    label(
      surf,
      `S${i + 1} ${s.id ?? ""} ×${memberCount(s.members)}`,
      px + r + 2,
      py - 4,
      col,
    );
    coord(c, s.at, px + r + 2, py + 5);
  });
  (def.packs ?? []).forEach((p, i) => {
    const px = wx(c, p.at.x);
    const py = wy(c, p.at.y);
    const con = conFor(def, def.mobLevels, diff);
    const col = conColor(con);
    strokeCircle(
      surf,
      px,
      py,
      (p.triggerRadius ?? 260) * c.S,
      [col[0], col[1], col[2], 26],
      1,
    );
    const r = conDisc(surf, px, py, memberCount(p.members), col, (x, y) =>
      mkCluster(surf, x, y, 2, col),
    );
    label(
      surf,
      `PACK ${i + 1} ×${memberCount(p.members)}`,
      px + r + 2,
      py - 4,
      col,
    );
    coord(c, p.at, px + r + 2, py + 5);
  });
}

function drawEncounters(c, diff) {
  const { def, surf } = c;
  for (const ch of def.chests ?? []) {
    mkSquare(surf, wx(c, ch.at.x), wy(c, ch.at.y), 3, C.chest);
    label(surf, "CHEST", wx(c, ch.at.x) + 6, wy(c, ch.at.y) - 4, C.chest);
    coord(c, ch.at, wx(c, ch.at.x) + 6, wy(c, ch.at.y) + 5);
  }
  for (const m of def.merchantSpawns ?? []) {
    mkCircle(surf, wx(c, m.x), wy(c, m.y), 3, C.merchant);
    label(surf, "SHOP", wx(c, m.x) + 6, wy(c, m.y) - 4, C.merchant);
  }
  for (const it of def.placedItems ?? []) {
    mkPlus(surf, wx(c, it.pos.x), wy(c, it.pos.y), 3, C.item);
    label(
      surf,
      it.defId ?? it.kind,
      wx(c, it.pos.x) + 5,
      wy(c, it.pos.y) - 4,
      C.item,
    );
  }
  for (const lm of def.landmarks ?? []) {
    mkHollowSquare(surf, wx(c, lm.pos.x), wy(c, lm.pos.y), 2, C.landmark);
    label(surf, lm.kind, wx(c, lm.pos.x) + 5, wy(c, lm.pos.y) - 4, C.landmark);
  }
  if (def.objective?.type === "reachExit" && def.objective.at) {
    const ex = def.objective.at;
    mkRing(surf, wx(c, ex.x), wy(c, ex.y), 6, C.exit);
    label(surf, "EXIT", wx(c, ex.x) + 8, wy(c, ex.y) - 4, C.exit);
  }
  // Pinned mobs: SHAPE = role, COLOUR = con.
  for (const s of (def.spawns ?? []).filter((e) => "at" in e)) {
    const px = wx(c, s.at.x);
    const py = wy(c, s.at.y);
    const role = roleOf(s.enemy);
    const rar = rarityOf(s.enemy);
    const con = conFor(
      def,
      s.level ? s.level.map((n) => n) : def.mobLevels,
      diff,
    );
    const col = conColor(con);
    if (role === "boss") mkStar(surf, px, py, 5, col);
    else if (role === "elite") mkDiamond(surf, px, py, 4, col);
    else if (rar === "unique" || rar === "rare")
      mkTriangle(surf, px, py, 4, col);
    else {
      mkCircle(surf, px, py, 2, col);
      continue;
    }
    label(surf, enemyName(s.enemy), px + 7, py - 11, col);
    coord(c, s.at, px + 7, py - 2);
  }
  const sp = def.playerSpawn;
  mkCircle(surf, wx(c, sp.x), wy(c, sp.y), 4, C.spawn);
  label(surf, "START", wx(c, sp.x) + 6, wy(c, sp.y) - 4, C.spawn);
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
    if (o.chest) continue;
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

// ---- the decode key (right panel) ------------------------------------------
const ROW_H = {
  title: LH + 1,
  kv: LH,
  line: LH,
  head: 2 + LH + 5,
  rule: 5,
  gap: 3,
  ramp: 22,
  legend: LH,
};

function legendGlyph(surf, kind, x, y, color) {
  const cx = x + 4;
  const cy = y + 3;
  const fns = {
    circle: mkCircle,
    star: mkStar,
    diamond: mkDiamond,
    triangle: mkTriangle,
    ring: mkRing,
    cluster: mkCluster,
    square: mkSquare,
    hollowSquare: mkHollowSquare,
    plus: mkPlus,
  };
  if (fns[kind]) return fns[kind](surf, cx, cy, 3, color);
  if (kind === "line") return drawLine(surf, x, cy, x + 8, cy, color, 2);
  if (kind === "disc") {
    fillCircle(surf, cx, cy, 3, [color[0], color[1], color[2], 66]);
    return strokeCircle(surf, cx, cy, 3, color, 1);
  }
  return fillRect(surf, x, y, 7, 7, color); // swatch (zones/walls)
}

function buildKey(def, meta, diff) {
  const rows = [];
  const R = (...a) => rows.push(a);
  R("title", "MAP LAYOUT");
  R("title", `${def.name}  (${def.id})`);
  const kindTag = meta.secret
    ? "SECRET"
    : meta.campaign
      ? "CAMPAIGN"
      : "OFF-CAMPAIGN";
  R("kv", `LVL ${def.index ?? "?"} · ${kindTag} · ${def.biome ?? "?"}`, C.dim);
  R("kv", `${def.width}×${def.height} · GRAV ${def.gravity ?? "?"}`, C.dim);
  R("kv", `OBJ ${def.objective?.type ?? "?"} · FOES ${def.foes ?? "?"}`, C.dim);
  R("rule");

  R("head", `CON - MOB LEVEL vs INTENDED (${diff.toUpperCase()})`);
  R("ramp");
  const il = def.intendedLevel;
  R(
    "line",
    il
      ? `INTENDED L  E${il[0]} M${il[1]} H${il[2]} NM${il[3]}`
      : "intendedLevel: not set",
    il ? C.dim : C.exit,
  );

  R("head", "SHAPES  (colour = con)");
  R("legend", "disc", C.shape, "SPAWN KNOT - area = count");
  if (def.packs?.length) R("legend", "cluster", C.shape, "PLACED PACK");
  R("legend", "star", C.shape, "BOSS");
  R("legend", "diamond", C.shape, "ELITE");
  R("legend", "triangle", C.shape, "PINNED RARE / UNIQUE");

  R("head", "SHAPES  (fixed colour)");
  R("legend", "circle", C.spawn, "START");
  R("legend", "line", C.path, "HERO PATH (numbered)");
  R("legend", "circle", C.merchant, "MERCHANT");
  R("legend", "square", C.chest, "CHEST");
  R("legend", "plus", C.item, "PLACED ITEM");
  R("legend", "hollowSquare", C.landmark, "LANDMARK");
  if (def.objective?.type === "reachExit") R("legend", "ring", C.exit, "EXIT");
  R("legend", "swatch", C.safe, "SAFE ZONE");
  R("legend", "swatch", C.quiet, "QUIET / DEAD ZONE");
  R("legend", "swatch", C.wall, "WALL");
  R("legend", "swatch", C.wallJump, "JUMPABLE WALL");
  if (def.doors?.length) R("legend", "swatch", C.door, "LOCKED DOOR");
  if (def.wells?.length) R("legend", "ring", C.well, "GRAVITY WELL");

  R("gap");
  for (const r of wrap(
    "Grey N,N = world coords. The YAML holds the numbers - read it alongside this picture.",
    42,
  ))
    R("line", r, C.faint);
  return rows;
}

const keyHeight = (rows) =>
  rows.reduce((h, r) => h + (ROW_H[r[0]] ?? LH), 0) + 12;

function drawKey(c, rows) {
  const { surf } = c;
  const x0 = c.width - PAD - PANEL_W;
  fillRect(surf, x0, PAD, PANEL_W, c.height - PAD * 2, C.panel);
  strokeRect(surf, x0, PAD, PANEL_W, c.height - PAD * 2, C.panelEdge, 1);
  const x = x0 + 6;
  let y = PAD + 6;
  for (const row of rows) {
    const k = row[0];
    if (k === "title") {
      text(surf, row[1], x, y, C.ink);
      y += ROW_H.title;
    } else if (k === "kv" || k === "line") {
      if (row[1] !== "") text(surf, row[1], x, y, row[2] ?? C.ink);
      y += LH;
    } else if (k === "head") {
      y += 2;
      text(surf, row[1], x, y, C.section);
      y += LH;
      fillRect(surf, x, y + 1, PANEL_W - 12, 1, C.panelEdge);
      y += 5;
    } else if (k === "rule") {
      fillRect(surf, x, y + 1, PANEL_W - 12, 1, C.panelEdge);
      y += 5;
    } else if (k === "gap") {
      y += ROW_H.gap;
    } else if (k === "ramp") {
      const w = PANEL_W - 18;
      for (let i = 0; i < w; i++) {
        const con = -6 + (i / w) * 14; // −6 … +8
        fillRect(surf, x + i, y, 1, 8, conColor(con));
      }
      strokeRect(surf, x, y, w, 8, C.panelEdge, 1);
      const bands = CON_STOPS.map((s) => s[2]);
      bands.forEach((lbl, i) =>
        text(
          surf,
          lbl,
          x + Math.round((i / bands.length) * w),
          y + 10,
          C.faint,
        ),
      );
      y += ROW_H.ramp;
    } else if (k === "legend") {
      legendGlyph(surf, row[1], x, y, row[2]);
      text(surf, row[3], x + 13, y, C.ink);
      y += LH;
    }
  }
}

// ---- entry -----------------------------------------------------------------
async function renderLevel(entry, opts) {
  const { def, campaign, secret } = entry;
  const diff = DIFF_IDX[opts.difficulty] != null ? opts.difficulty : "easy";
  const rows = buildKey(def, { campaign, secret }, diff);
  const c = makeCanvas(def, opts.width, keyHeight(rows));
  label(
    c.surf,
    `MAP LAYOUT - ${def.name} - ${def.id} - GRID ${gridStep(def)}U - CON vs ${diff.toUpperCase()}`,
    PAD,
    PAD - 1,
    C.ink,
  );
  drawGrid(c);
  drawZones(c);
  if (opts.seed != null) await drawObstacles(c, opts.seed, opts.difficulty);
  drawWalls(c);
  drawPath(c);
  drawSpawners(c, diff);
  drawEncounters(c, diff);
  drawKey(c, rows);
  const out = `${previewDir}/map_${def.id}_layout.png`;
  await writePng(upscale(c.surf, 2), out);
  console.log(
    `wrote ${out} (${c.width}×${c.height} @2x = ${c.width * 2}×${c.height * 2})`,
  );
}

function parseArgs(argv) {
  const opts = { width: 1400, difficulty: "easy", all: false, seed: null };
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
