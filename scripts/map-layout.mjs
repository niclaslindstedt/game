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
//   node scripts/map-layout.mjs <id>                 one level
//   node scripts/map-layout.mjs --all                every level
//   node scripts/map-layout.mjs <id> --difficulty hard   con vs that rung
//   node scripts/map-layout.mjs <id> --seed 1        + scatter obstacles
//   node scripts/map-layout.mjs <id> --width 1800    bigger map area (px)
//   node scripts/map-layout.mjs <id> --highlight "1240,380;2010,660"
//   node scripts/map-layout.mjs <id> --deaths "1240,380:raider;2010,660"
//   node scripts/map-layout.mjs <id> --highlight-file report.json
//
// HIGHLIGHTS mark arbitrary world coordinates on the render — built for the
// simulator's STUCK AREAS (simulate-run.mjs --stuck-limit prints the exact
// --highlight command), but any probe coordinates work. --highlight takes
// inline `x,y[:label]` pairs separated by `;`. DEATHS mark where the
// simulated hero DIED (simulate-run.mjs's DEATHS table prints the exact
// --deaths command): red † markers, disc area ∝ deaths in the cluster,
// labelled D1, D2, … with the killer — same `x,y[:label]` syntax (the label
// may itself contain `:`, e.g. `hazard:asteroid`). --highlight-file takes a
// JSON file: a plain array of {x, y, label?, count?} (or [x, y] pairs), OR a
// simulate-run --json dump — its runs matching this level contribute their
// stuck.areas as highlights AND their deathLog.areas as death markers
// automatically.
//
// Output → pwa/assets-preview/map_<id>_layout.png. Also `make map-layout
// LEVEL=<id>`.

import { register } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { renderText, FONT_HEIGHT } from "./asset-tools/font.mjs";
import {
  renderHudText,
  measureHudText,
  HUD_FONT_HEIGHT,
} from "./asset-tools/font-hud.mjs";
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

register("./game-alias-loader.mjs", import.meta.url);

const engine = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const { ENEMY_DEFS } = await import(engine("src/game/defs/enemies/index.ts"));
// Deterministic XP model (see leveling.ts) — used to PROJECT the hero's level at
// 25/50/75/100 % cleared, so the con ramp can be judged against the hero's rise.
const { mobLevelXp, xpToLevelUp } = await import(
  engine("src/game/leveling.ts")
);

const previewDir = engine("pwa/assets-preview");
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
  building: [150, 106, 66, 255], // solid town buildings (box footprints)
  buildingEdge: [92, 66, 42, 255],
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
  stuck: [255, 64, 216, 255], // highlight markers (nothing else on the map is this)
  death: [255, 40, 40, 255], // death markers — hotter than the exit/brutal reds
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

/** PROJECT the hero's level after clearing 25/50/75/100 % of the map's killable
 * mobs, IN PATH ORDER (spawn knots as authored + the packs), starting from the
 * map's intended level. XP is deterministic (each kill pays `mobLevelXp` at the
 * hero's CURRENT level; a level costs `xpToLevelUp`), so this needs no sim. It
 * lets the con ramp be judged against the hero's actual rise: mobs should keep
 * pace (even) and pull a touch ahead toward the end (a rising con). Ignores the
 * per-map XP CAP and golden arrows — it's the raw kill-XP the swarm is worth. */
function heroProjection(def, diff) {
  const i = DIFF_IDX[diff];
  const start = def.intendedLevel?.[i];
  if (start == null || diff === "jesus") return null;
  const knots = [];
  for (const s of def.spawners ?? [])
    knots.push({
      lvl: bandMid((s.mobLevels ?? def.mobLevels)[i]),
      n: memberCount(s.members),
    });
  for (const p of def.packs ?? [])
    knots.push({ lvl: bandMid(def.mobLevels[i]), n: memberCount(p.members) });
  const total = knots.reduce((s, k) => s + k.n, 0);
  if (!total) return null;
  const marks = [0.25, 0.5, 0.75, 1];
  const out = [];
  let L = start;
  let xp = 0;
  let killed = 0;
  let mi = 0;
  for (const k of knots) {
    for (let j = 0; j < k.n; j++) {
      xp += mobLevelXp(Math.round(k.lvl), L);
      killed++;
      let guard = 0;
      while (xp >= xpToLevelUp(L, diff) && guard++ < 99) {
        xp -= xpToLevelUp(L, diff);
        L++;
      }
      while (mi < marks.length && killed >= Math.round(total * marks[mi])) {
        out.push(L);
        mi++;
      }
    }
  }
  while (out.length < 4) out.push(L);
  return { start, total, at: out };
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
  // Hand-placed BUILDINGS: solid box footprints the hero can't cross. Drawn as
  // filled rectangles (dark edge) so the town's Main Street reads at a glance.
  for (const b of def.buildings ?? []) {
    const x = wx(c, b.pos.x - b.w / 2);
    const y = wy(c, b.pos.y - b.h / 2);
    const w = Math.max(2, Math.round(b.w * c.S));
    const h = Math.max(2, Math.round(b.h * c.S));
    fillRect(surf, x, y, w, h, b.jumpable ? C.wallJump : C.building);
    // dark edge
    fillRect(surf, x, y, w, 1, C.buildingEdge);
    fillRect(surf, x, y + h - 1, w, 1, C.buildingEdge);
    fillRect(surf, x, y, 1, h, C.buildingEdge);
    fillRect(surf, x + w - 1, y, 1, h, C.buildingEdge);
  }
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
    queueLabel(c, wx(c, p.x), wy(c, p.y), `${i + 1}`, C.path, 1, 3);
  });
}

/** Queue a map label for the second-pass placer (`placeLabels`), anchored at a
 * marker (ax, ay) of radius `rad`. `coordAt` adds a dim world-coord readout under
 * the name so the agent can correlate the image to the YAML it edits. */
function queueLabel(c, ax, ay, str, color, prio, rad = 6, coordAt = null) {
  c.labels.push({ ax, ay, str, color, prio, rad, coordAt });
}

/** Place every queued label so NO text overlaps other text: for each (most
 * important first) try a ring of candidate offsets that clear the marker, take
 * the first that collides with nothing already placed and stays on the map, and
 * draw a thin LEADER LINE back to the marker when the label had to be pushed
 * away. The picture stays readable even where an elite guards a spawn knot. */
function placeLabels(c) {
  const { surf } = c;
  const placed = [];
  const over = (a, b) =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const inb = (b) =>
    b.x >= c.ox - 2 &&
    b.x + b.w <= c.ox + c.mapW + 2 &&
    b.y >= c.oy - 8 &&
    b.y + b.h <= c.oy + c.mapH + 8;
  const sorted = [...c.labels].sort((a, b) => b.prio - a.prio);
  for (const L of sorted) {
    const clean = String(L.str).replace(/_/g, " ");
    const w = measureHudText(clean.toUpperCase());
    const h = HUD_FONT_HEIGHT + (L.coordAt ? FONT_HEIGHT + 2 : 0);
    const R = L.rad + 3;
    const cands = [
      [R, -4],
      [R, -13],
      [R, 6],
      [R, -22],
      [R, 15],
      [-w - R, -4],
      [-w - R, -13],
      [-w - R, 6],
      [R + 8, -26],
      [R + 8, 24],
      [-w - R - 8, -26],
      [-w - R - 8, 24],
      [R, -31],
      [R, 33],
    ];
    let best = null;
    for (const [dx, dy] of cands) {
      const box = { x: L.ax + dx - 1, y: L.ay + dy - 1, w: w + 3, h: h + 3 };
      if (inb(box) && !placed.some((p) => over(box, p))) {
        best = { dx, dy, box };
        break;
      }
    }
    if (!best) {
      const dx = R;
      const dy = -4;
      best = {
        dx,
        dy,
        box: { x: L.ax + dx - 1, y: L.ay + dy - 1, w: w + 3, h: h + 3 },
      };
    }
    if (Math.abs(best.dx) > L.rad + 6 || Math.abs(best.dy) > 14) {
      const lx = best.dx < 0 ? best.box.x + best.box.w : best.box.x;
      drawLine(
        surf,
        L.ax,
        L.ay,
        lx,
        best.box.y + Math.floor(HUD_FONT_HEIGHT / 2),
        [L.color[0], L.color[1], L.color[2], 140],
        1,
      );
    }
    label(surf, L.str, L.ax + best.dx, L.ay + best.dy, L.color);
    if (L.coordAt)
      text(
        surf,
        `${Math.round(L.coordAt.x)},${Math.round(L.coordAt.y)}`,
        L.ax + best.dx,
        L.ay + best.dy + HUD_FONT_HEIGHT + 1,
        C.coord,
      );
    placed.push(best.box);
  }
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
    queueLabel(
      c,
      px,
      py,
      `S${i + 1} ${s.id ?? ""} ×${memberCount(s.members)}`,
      col,
      3,
      r,
      s.at,
    );
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
    queueLabel(
      c,
      px,
      py,
      `PACK ${i + 1} ×${memberCount(p.members)}`,
      col,
      3,
      r,
      p.at,
    );
  });
}

function drawEncounters(c, diff) {
  const { def, surf } = c;
  for (const ch of def.chests ?? []) {
    mkSquare(surf, wx(c, ch.at.x), wy(c, ch.at.y), 3, C.chest);
    queueLabel(
      c,
      wx(c, ch.at.x),
      wy(c, ch.at.y),
      "CHEST",
      C.chest,
      2,
      4,
      ch.at,
    );
  }
  for (const m of def.merchantSpawns ?? []) {
    mkCircle(surf, wx(c, m.x), wy(c, m.y), 3, C.merchant);
    queueLabel(c, wx(c, m.x), wy(c, m.y), "SHOP", C.merchant, 2, 4);
  }
  for (const it of def.placedItems ?? []) {
    mkPlus(surf, wx(c, it.pos.x), wy(c, it.pos.y), 3, C.item);
    queueLabel(
      c,
      wx(c, it.pos.x),
      wy(c, it.pos.y),
      it.defId ?? it.kind,
      C.item,
      2,
      4,
    );
  }
  for (const lm of def.landmarks ?? []) {
    mkHollowSquare(surf, wx(c, lm.pos.x), wy(c, lm.pos.y), 2, C.landmark);
    queueLabel(c, wx(c, lm.pos.x), wy(c, lm.pos.y), lm.kind, C.landmark, 2, 3);
  }
  if (def.objective?.type === "reachExit" && def.objective.at) {
    const ex = def.objective.at;
    mkRing(surf, wx(c, ex.x), wy(c, ex.y), 6, C.exit);
    queueLabel(c, wx(c, ex.x), wy(c, ex.y), "EXIT", C.exit, 3, 7, ex);
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
    const prio = role === "boss" ? 5 : 4;
    queueLabel(c, px, py, enemyName(s.enemy), col, prio, 6, s.at);
  }
  const sp = def.playerSpawn;
  mkCircle(surf, wx(c, sp.x), wy(c, sp.y), 4, C.spawn);
  queueLabel(c, wx(c, sp.x), wy(c, sp.y), "START", C.spawn, 3, 5);
}

// ---- highlights (--highlight / --highlight-file) ----------------------------

/**
 * Resolve the requested highlight markers for `levelId`: inline `x,y[:label]`
 * pairs (`;`-separated), plus a JSON file that is either a plain array of
 * {x, y, label?, count?} / [x, y] entries, or a simulate-run --json dump
 * (single-campaign {runs: […]} or matrix [{report: {runs}}]) — dump runs
 * matching this level contribute their stuck.areas, labelled by difficulty.
 */
function parseHighlights(opts, levelId) {
  const out = [];
  const pushCoord = (e) => {
    if (Array.isArray(e)) {
      const [x, y] = e.map(Number);
      if (Number.isFinite(x) && Number.isFinite(y)) out.push({ x, y });
      return;
    }
    const x = Number(e?.x);
    const y = Number(e?.y);
    if (Number.isFinite(x) && Number.isFinite(y))
      out.push({ x, y, label: e.label, count: e.count });
  };
  const pushRuns = (runs) => {
    for (const run of runs ?? []) {
      if (run.levelId !== levelId) continue;
      for (const a of run.stuck?.areas ?? [])
        out.push({ x: a.x, y: a.y, count: a.count, label: run.difficulty });
    }
  };
  if (opts.highlight) {
    for (const part of String(opts.highlight).split(";")) {
      const [xy, label] = part.split(":");
      const [x, y] = (xy ?? "").split(",").map(Number);
      if (Number.isFinite(x) && Number.isFinite(y)) out.push({ x, y, label });
      else console.warn(`--highlight: skipping unparsable entry "${part}"`);
    }
  }
  if (opts.highlightFile) {
    const data = JSON.parse(readFileSync(opts.highlightFile, "utf8"));
    if (Array.isArray(data)) {
      for (const e of data) {
        if (e?.report?.runs) pushRuns(e.report.runs);
        else pushCoord(e);
      }
    } else if (data?.runs) {
      pushRuns(data.runs);
    } else {
      pushCoord(data);
    }
  }
  return out;
}

/**
 * Resolve the requested DEATH markers for `levelId`: inline `x,y[:label]`
 * pairs from --deaths (the label split on the FIRST colon only, so a
 * `hazard:asteroid` cause survives intact), plus a simulate-run --json dump
 * passed via --highlight-file — matching runs contribute their
 * `deathLog.areas`, each labelled with the area's dominant killer (prefixed
 * by difficulty when the dump spans several).
 */
function parseDeaths(opts, levelId) {
  const out = [];
  if (opts.deaths) {
    for (const part of String(opts.deaths).split(";")) {
      const sep = part.indexOf(":");
      const xy = sep >= 0 ? part.slice(0, sep) : part;
      const label = sep >= 0 ? part.slice(sep + 1) : undefined;
      const [x, y] = xy.split(",").map(Number);
      if (Number.isFinite(x) && Number.isFinite(y)) out.push({ x, y, label });
      else console.warn(`--deaths: skipping unparsable entry "${part}"`);
    }
  }
  if (opts.highlightFile) {
    const data = JSON.parse(readFileSync(opts.highlightFile, "utf8"));
    const pushRuns = (runs) => {
      for (const run of runs ?? []) {
        if (run.levelId !== levelId) continue;
        for (const a of run.deathLog?.areas ?? []) {
          const top = Object.entries(a.causes ?? {}).sort(
            ([, m], [, n]) => n - m,
          )[0];
          out.push({
            x: a.x,
            y: a.y,
            count: a.count,
            label: [run.difficulty, top?.[0]].filter(Boolean).join(" "),
          });
        }
      }
    };
    if (Array.isArray(data)) {
      for (const e of data) if (e?.report?.runs) pushRuns(e.report.runs);
    } else if (data?.runs) {
      pushRuns(data.runs);
    }
  }
  return out;
}

/** Draw the death markers: a † (grave cross) in a translucent disc (area ∝
 * deaths in the cluster), labelled D1, D2, … with the killer — drawn at the
 * same TOP priority as highlights: when deaths are on the render, "where and
 * why does the bot die?" is the question being asked. */
function drawDeaths(c, deaths) {
  const { surf } = c;
  deaths.forEach((d, i) => {
    const px = wx(c, d.x);
    const py = wy(c, d.y);
    const r = Math.round(
      Math.min(18, 7 + Math.sqrt(Math.max(1, d.count ?? 1)) * 1.6),
    );
    fillCircle(surf, px, py, r, [C.death[0], C.death[1], C.death[2], 56]);
    strokeCircle(surf, px, py, r, C.death, 1);
    drawLine(surf, px, py - 5, px, py + 5, C.death, 2);
    drawLine(surf, px - 3, py - 2, px + 3, py - 2, C.death, 2);
    const name = d.label ? `D${i + 1} ${d.label}` : `D${i + 1}`;
    queueLabel(c, px, py, name, C.death, 6, r, d);
  });
}

/** Draw the highlight markers: an X in a translucent disc (area ∝ count, like
 * the con discs), labelled X1, X2, … at TOP priority — when highlights are on
 * the render, they are the thing being looked at. */
function drawHighlights(c, highlights) {
  const { surf } = c;
  highlights.forEach((h, i) => {
    const px = wx(c, h.x);
    const py = wy(c, h.y);
    const r = Math.round(
      Math.min(18, 7 + Math.sqrt(Math.max(1, h.count ?? 1)) * 1.6),
    );
    fillCircle(surf, px, py, r, [C.stuck[0], C.stuck[1], C.stuck[2], 56]);
    strokeCircle(surf, px, py, r, C.stuck, 1);
    drawLine(surf, px - 4, py - 4, px + 4, py + 4, C.stuck, 2);
    drawLine(surf, px - 4, py + 4, px + 4, py - 4, C.stuck, 2);
    const name = h.label ? `X${i + 1} ${h.label}` : `X${i + 1}`;
    queueLabel(c, px, py, name, C.stuck, 6, r, h);
  });
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
  if (kind === "cross") {
    drawLine(surf, cx - 3, cy - 3, cx + 3, cy + 3, color, 1);
    drawLine(surf, cx - 3, cy + 3, cx + 3, cy - 3, color, 1);
    return;
  }
  if (kind === "dagger") {
    drawLine(surf, cx, cy - 3, cx, cy + 3, color, 1);
    drawLine(surf, cx - 2, cy - 1, cx + 2, cy - 1, color, 1);
    return;
  }
  if (kind === "line") return drawLine(surf, x, cy, x + 8, cy, color, 2);
  if (kind === "disc") {
    fillCircle(surf, cx, cy, 3, [color[0], color[1], color[2], 66]);
    return strokeCircle(surf, cx, cy, 3, color, 1);
  }
  return fillRect(surf, x, y, 7, 7, color); // swatch (zones/walls)
}

function buildKey(def, meta, diff, highlightCount = 0, deathCount = 0) {
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
  const proj = heroProjection(def, diff);
  if (proj) {
    R("line", `HERO IF CLEARED (from L${proj.start}):`, C.dim);
    R(
      "line",
      `  25%→L${proj.at[0]}  50%→L${proj.at[1]}  75%→L${proj.at[2]}  100%→L${proj.at[3]}`,
      C.faint,
    );
    R("line", "  mobs should keep pace + pull ahead (con up)", C.faint);
  }

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
  if (def.buildings?.length) R("legend", "swatch", C.building, "BUILDING");
  R("legend", "swatch", C.wall, "WALL");
  R("legend", "swatch", C.wallJump, "JUMPABLE WALL");
  if (def.doors?.length) R("legend", "swatch", C.door, "LOCKED DOOR");
  if (def.wells?.length) R("legend", "ring", C.well, "GRAVITY WELL");
  if (highlightCount > 0)
    R("legend", "cross", C.stuck, `HIGHLIGHT (X1-X${highlightCount})`);
  if (deathCount > 0)
    R("legend", "dagger", C.death, `DEATH (D1-D${deathCount})`);

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
  const highlights = parseHighlights(opts, def.id);
  const deaths = parseDeaths(opts, def.id);
  const rows = buildKey(
    def,
    { campaign, secret },
    diff,
    highlights.length,
    deaths.length,
  );
  const c = makeCanvas(def, opts.width, keyHeight(rows));
  c.labels = [];
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
  drawHighlights(c, highlights);
  drawDeaths(c, deaths);
  placeLabels(c);
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
    else if (a === "--highlight") opts.highlight = argv[++i];
    else if (a === "--deaths") opts.deaths = argv[++i];
    else if (a === "--highlight-file") opts.highlightFile = argv[++i];
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
