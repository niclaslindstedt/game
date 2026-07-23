// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The decode key (right panel) for the map-layout renderer: the row model
// (`buildKey` → `keyHeight` → `drawKey`) and the legend glyphs — the same
// marker functions the map draws with, so the key is exact.

import {
  drawLine,
  fillCircle,
  fillRect,
  strokeCircle,
  strokeRect,
} from "../asset-tools/surface.mjs";

import { C, CON_STOPS, conColor } from "./palette.mjs";
import { PAD, PANEL_W, LH } from "./canvas.mjs";
import {
  text,
  wrap,
  mkCircle,
  mkRing,
  mkDiamond,
  mkTriangle,
  mkSquare,
  mkHollowSquare,
  mkStar,
  mkPlus,
  mkCluster,
} from "./shapes.mjs";
import { heroProjection } from "./draw-map.mjs";

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

export function buildKey(def, meta, diff, highlightCount = 0, deathCount = 0) {
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

export const keyHeight = (rows) =>
  rows.reduce((h, r) => h + (ROW_H[r[0]] ?? LH), 0) + 12;

export function drawKey(c, rows) {
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
