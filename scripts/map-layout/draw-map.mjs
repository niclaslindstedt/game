// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The map drawers for the map-layout renderer: the coordinate grid, design
// zones, walls/buildings/doors/wells, the numbered hero path, spawn knots and
// packs as CON DISCS, every pinned encounter as a distinct shape — plus the
// two-pass label placer that keeps the picture readable, and the def helpers
// (`conFor`, `heroProjection`) the con colouring and the decode key read.

import { FONT_HEIGHT } from "../asset-tools/font.mjs";
import { measureHudText, HUD_FONT_HEIGHT } from "../asset-tools/font-hud.mjs";
import {
  drawArrow,
  drawLine,
  fillCircle,
  fillRect,
  strokeCircle,
  strokeRect,
} from "../asset-tools/surface.mjs";

import { C, conColor, DIFF_IDX, bandMid } from "./palette.mjs";
import { RULER, wx, wy, gridStep } from "./canvas.mjs";
import {
  text,
  label,
  mkCircle,
  mkRing,
  mkDiamond,
  mkTriangle,
  mkSquare,
  mkHollowSquare,
  mkStar,
  mkPlus,
  mkCluster,
  conDisc,
} from "./shapes.mjs";
import {
  roleOf,
  rarityOf,
  enemyName,
  mobLevelXp,
  xpToLevelUp,
} from "./engine.mjs";

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
export function heroProjection(def, diff) {
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

// ---- the map ---------------------------------------------------------------
export function drawGrid(c) {
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

export function drawZones(c) {
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

export function drawWalls(c) {
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

export function drawPath(c) {
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
export function queueLabel(
  c,
  ax,
  ay,
  str,
  color,
  prio,
  rad = 6,
  coordAt = null,
) {
  c.labels.push({ ax, ay, str, color, prio, rad, coordAt });
}

/** Place every queued label so NO text overlaps other text: for each (most
 * important first) try a ring of candidate offsets that clear the marker, take
 * the first that collides with nothing already placed and stays on the map, and
 * draw a thin LEADER LINE back to the marker when the label had to be pushed
 * away. The picture stays readable even where an elite guards a spawn knot. */
export function placeLabels(c) {
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

export function drawSpawners(c, diff) {
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

export function drawEncounters(c, diff) {
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
