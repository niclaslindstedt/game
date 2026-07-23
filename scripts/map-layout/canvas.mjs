// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Canvas layout for the map-layout renderer: the fixed margins/panel metrics,
// the surface factory, and the world→image transform.

import { FONT_HEIGHT } from "../asset-tools/font.mjs";
import { createSurface, fill } from "../asset-tools/surface.mjs";

import { C } from "./palette.mjs";

// ---- canvas ----------------------------------------------------------------
export const PAD = 12;
export const TITLE_H = 12;
export const RULER = 22;
export const GAP = 12;
export const PANEL_W = 300;
export const LH = FONT_HEIGHT + 3;

export function makeCanvas(def, targetW, panelH) {
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
export const wx = (c, x) => Math.round(c.ox + x * c.S);
export const wy = (c, y) => Math.round(c.oy + y * c.S);
export const gridStep = (def) => (def.width > 2600 ? 400 : 200);
