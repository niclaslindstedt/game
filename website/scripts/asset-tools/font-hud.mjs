// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The HUD font — a taller (7px), rounder cousin of the workaday 3×5 UI font
// (font.mjs), for the small readouts that want a size BETWEEN the UI font's
// crisp 1× (5px) and 2× (10px) — e.g. the minimap strip's rampage stage and
// kill tally. A bitmap font only reads crisp at integer scales, so an
// in-between size needs its own native grid rather than a fractional scale of
// the 5px font (which shimmers). Packed into a white atlas + metrics the app
// tints at runtime, exactly like the UI font. `#` = lit pixel, `.` = blank.

import { createSurface, setPixel } from "./surface.mjs";

export const HUD_FONT_HEIGHT = 7;
/** Blank columns between glyphs when rendering text. */
export const HUD_LETTER_SPACING = 1;

/** Glyphs — uppercase caps, digits, and the punctuation the HUD needs. Every
 * row within a glyph must have the same width. Uppercase-only (the runtime and
 * renderer uppercase the text before lookup), matching the UI font. */
export const HUD_GLYPHS = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".###."],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: ["###", ".#.", ".#.", ".#.", ".#.", ".#.", "###"],
  J: ["..##", "...#", "...#", "...#", "#..#", "#..#", ".##."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  N: ["#...#", "##..#", "#.#.#", "#.#.#", "#..##", "#...#", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
  X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  0: [".##.", "#..#", "#..#", "#..#", "#..#", "#..#", ".##."],
  1: [".#.", "##.", ".#.", ".#.", ".#.", ".#.", "###"],
  2: [".##.", "#..#", "...#", "..#.", ".#..", "#...", "####"],
  3: ["###.", "...#", "...#", ".##.", "...#", "...#", "###."],
  4: ["..#.", ".##.", "#.#.", "####", "..#.", "..#.", "..#."],
  5: ["####", "#...", "###.", "...#", "...#", "#..#", ".##."],
  6: [".##.", "#...", "#...", "###.", "#..#", "#..#", ".##."],
  7: ["####", "...#", "..#.", "..#.", ".#..", ".#..", ".#.."],
  8: [".##.", "#..#", "#..#", ".##.", "#..#", "#..#", ".##."],
  9: [".##.", "#..#", "#..#", ".###", "...#", "...#", ".##."],
  " ": ["...", "...", "...", "...", "...", "...", "..."],
  ":": [".", ".", "#", ".", "#", ".", "."],
  ".": [".", ".", ".", ".", ".", ".", "#"],
  "-": ["....", "....", "....", "####", "....", "....", "...."],
  "/": ["...#", "...#", "..#.", ".#..", ".#..", "#...", "#..."],
  // Operator/separator glyphs for the map-layout labels (×count, +con, · sep).
  "×": [".....", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "....."],
  "+": [".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."],
  "·": [".", ".", ".", "#", ".", ".", "."],
};

/** Pixel width of one glyph (unknown chars fall back to "?" → space). */
function hudGlyphFor(char) {
  return HUD_GLYPHS[char.toUpperCase()] ?? HUD_GLYPHS[" "];
}

/** Pixel width of a rendered string. */
export function measureHudText(text) {
  let width = 0;
  for (const char of text) {
    width += hudGlyphFor(char)[0].length + HUD_LETTER_SPACING;
  }
  return Math.max(0, width - HUD_LETTER_SPACING);
}

/** Render a string to a new surface in the given color (for the specimen). */
export function renderHudText(text, color) {
  const surface = createSurface(
    Math.max(1, measureHudText(text)),
    HUD_FONT_HEIGHT,
  );
  let cursor = 0;
  for (const char of text) {
    const glyph = hudGlyphFor(char);
    glyph.forEach((row, y) => {
      [...row].forEach((cell, x) => {
        if (cell === "#") setPixel(surface, cursor + x, y, color);
      });
    });
    cursor += glyph[0].length + HUD_LETTER_SPACING;
  }
  return surface;
}

/**
 * Pack every glyph into a horizontal white atlas surface + metrics for the
 * runtime renderer: { height, spacing, glyphs: { char: { x, width } } }.
 */
export function buildHudFontAtlas() {
  const chars = Object.keys(HUD_GLYPHS);
  const totalWidth = chars.reduce((w, c) => w + HUD_GLYPHS[c][0].length + 1, 0);
  const atlas = createSurface(totalWidth, HUD_FONT_HEIGHT);
  const meta = {
    height: HUD_FONT_HEIGHT,
    spacing: HUD_LETTER_SPACING,
    glyphs: {},
  };

  let x = 0;
  for (const char of chars) {
    const glyph = HUD_GLYPHS[char];
    glyph.forEach((row, gy) => {
      [...row].forEach((cell, gx) => {
        if (cell === "#") setPixel(atlas, x + gx, gy, [255, 255, 255, 255]);
      });
    });
    meta.glyphs[char] = { x, width: glyph[0].length };
    x += glyph[0].length + 1;
  }
  return { atlas, meta };
}
