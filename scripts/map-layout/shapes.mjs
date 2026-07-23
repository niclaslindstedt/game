// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Text primitives + marker shapes for the map-layout renderer. The map and the
// decode-key legend share these marker functions, so the key is exact.

import { renderText } from "../asset-tools/font.mjs";
import { renderHudText } from "../asset-tools/font-hud.mjs";
import {
  blit,
  drawLine,
  fillCircle,
  fillRect,
  strokeCircle,
  strokeRect,
} from "../asset-tools/surface.mjs";

import { C } from "./palette.mjs";

// ---- text helpers ----------------------------------------------------------
export function text(surf, str, x, y, color = C.ink) {
  blit(surf, renderText(String(str).replace(/_/g, " "), color), x, y);
}
/** Map label — taller HUD font (7px) + 1px drop shadow, clean over any ground. */
export function label(surf, str, x, y, color = C.ink) {
  const clean = String(str).replace(/_/g, " ");
  blit(surf, renderHudText(clean, [0, 0, 0, 230]), x + 1, y + 1);
  blit(surf, renderHudText(clean, color), x, y);
}
export function wrap(str, cols, maxRows = 40) {
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
export const mkCircle = (s, cx, cy, r, c) => fillCircle(s, cx, cy, r, c);
export function mkRing(s, cx, cy, r, c) {
  strokeCircle(s, cx, cy, r, c, 1);
  fillRect(s, cx, cy, 1, 1, c);
}
export function mkDiamond(s, cx, cy, r, c) {
  for (let dy = -r; dy <= r; dy++) {
    const w = r - Math.abs(dy);
    for (let dx = -w; dx <= w; dx++) fillRect(s, cx + dx, cy + dy, 1, 1, c);
  }
}
export function mkTriangle(s, cx, cy, r, c) {
  for (let dy = -r; dy <= r; dy++) {
    const w = Math.round(((dy + r) / (2 * r)) * r);
    for (let dx = -w; dx <= w; dx++) fillRect(s, cx + dx, cy + dy, 1, 1, c);
  }
}
export const mkSquare = (s, cx, cy, r, c) =>
  fillRect(s, cx - r, cy - r, r * 2 + 1, r * 2 + 1, c);
export const mkHollowSquare = (s, cx, cy, r, c) =>
  strokeRect(s, cx - r, cy - r, r * 2 + 1, r * 2 + 1, c, 1);
export function mkStar(s, cx, cy, r, c) {
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
export function mkPlus(s, cx, cy, r, c) {
  fillRect(s, cx - r, cy, r * 2 + 1, 1, c);
  fillRect(s, cx, cy - r, 1, r * 2 + 1, c);
}
export function mkCluster(s, cx, cy, r, c) {
  mkTriangle(s, cx, cy - 1, Math.max(1, r - 1), c);
  fillRect(s, cx - r, cy + r - 1, 1, 1, c);
  fillRect(s, cx + r, cy + r - 1, 1, 1, c);
}
/** A CON DISC: a translucent con-coloured fill + solid outline, its area ∝ the
 * mob count, with a small kind glyph at the centre. */
export function conDisc(surf, cx, cy, count, color, centre) {
  const r = Math.round(Math.min(20, 4 + Math.sqrt(Math.max(1, count)) * 0.85));
  fillCircle(surf, cx, cy, r, [color[0], color[1], color[2], 66]);
  strokeCircle(surf, cx, cy, r, color, 1);
  centre(cx, cy);
  return r;
}
