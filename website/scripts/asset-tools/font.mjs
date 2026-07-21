// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Programmatic pixel font — a hand-defined 3×5 (variable-width) glyph set
// rendered to surfaces at build time. The generator packs it into a white
// font atlas + metrics JSON that the app tints at runtime (see
// website/src/lib/pixel-font.ts), and the preview tooling uses `renderText`
// directly to label sheets. `#` = lit pixel, `.` = transparent.

import { createSurface, setPixel } from "./surface.mjs";

export const FONT_HEIGHT = 5;
/** Blank columns between glyphs when rendering text. */
export const LETTER_SPACING = 1;

/** Glyphs. Every row within a glyph must have the same width (1–5 px). */
export const GLYPHS = {
  A: ["###", "#.#", "###", "#.#", "#.#"],
  B: ["##.", "#.#", "##.", "#.#", "##."],
  C: ["###", "#..", "#..", "#..", "###"],
  D: ["##.", "#.#", "#.#", "#.#", "##."],
  E: ["###", "#..", "##.", "#..", "###"],
  F: ["###", "#..", "##.", "#..", "#.."],
  G: ["###", "#..", "#.#", "#.#", "###"],
  H: ["#.#", "#.#", "###", "#.#", "#.#"],
  I: ["###", ".#.", ".#.", ".#.", "###"],
  J: ["..#", "..#", "..#", "#.#", "###"],
  K: ["#.#", "#.#", "##.", "#.#", "#.#"],
  L: ["#..", "#..", "#..", "#..", "###"],
  M: ["#...#", "##.##", "#.#.#", "#...#", "#...#"],
  N: ["#..#", "##.#", "#.##", "#..#", "#..#"],
  O: ["###", "#.#", "#.#", "#.#", "###"],
  P: ["###", "#.#", "###", "#..", "#.."],
  Q: ["###", "#.#", "#.#", "###", "..#"],
  R: ["###", "#.#", "##.", "#.#", "#.#"],
  S: ["###", "#..", "###", "..#", "###"],
  T: ["###", ".#.", ".#.", ".#.", ".#."],
  U: ["#.#", "#.#", "#.#", "#.#", "###"],
  V: ["#.#", "#.#", "#.#", "#.#", ".#."],
  W: ["#...#", "#...#", "#.#.#", "##.##", "#...#"],
  X: ["#.#", "#.#", ".#.", "#.#", "#.#"],
  Y: ["#.#", "#.#", ".#.", ".#.", ".#."],
  Z: ["###", "..#", ".#.", "#..", "###"],
  // Ö — umlaut on the top row, a four-row O beneath, baseline-aligned like the
  // rest of the caps (there's no headroom for dots ABOVE a full-height O in a
  // 5px cell, so the O is squared to four rows). Used by MJÖLNIR.
  Ö: ["#.#", "###", "#.#", "#.#", "###"],
  0: ["###", "#.#", "#.#", "#.#", "###"],
  1: [".#.", "##.", ".#.", ".#.", "###"],
  2: ["###", "..#", "###", "#..", "###"],
  3: ["###", "..#", ".##", "..#", "###"],
  4: ["#.#", "#.#", "###", "..#", "..#"],
  5: ["###", "#..", "###", "..#", "###"],
  6: ["###", "#..", "###", "#.#", "###"],
  7: ["###", "..#", ".#.", ".#.", ".#."],
  8: ["###", "#.#", "###", "#.#", "###"],
  9: ["###", "#.#", "###", "..#", "###"],
  " ": ["..", "..", "..", "..", ".."],
  ".": [".", ".", ".", ".", "#"],
  "·": [".", ".", "#", ".", "."],
  ",": [".", ".", ".", "#", "#"],
  ":": [".", "#", ".", "#", "."],
  "!": ["#", "#", "#", ".", "#"],
  "?": ["###", "..#", ".##", "...", ".#."],
  "-": ["...", "...", "###", "...", "..."],
  // Em dash — a wider horizontal bar than the hyphen above, for parenthetical
  // asides in blurbs (e.g. "SILENCE ALL — SLIDERS KEEP THEIR LEVELS").
  "—": [".....", ".....", "#####", ".....", "....."],
  "+": ["...", ".#.", "###", ".#.", "..."],
  // Multiplication sign — a compact cross, vertically centered so it reads as
  // an operator (e.g. the "2×" balance multipliers) distinct from the
  // full-height letter X above.
  "×": ["...", "#.#", ".#.", "#.#", "..."],
  // Dollar sign — the coin store's price tags. An S whose center-column gaps
  // carry the vertical stroke's stubs (a 5px cell has no headroom for a bar
  // poking past the glyph, so the stroke lives inside the S).
  $: ["###", "##.", "###", ".##", "###"],
  "/": ["..#", "..#", ".#.", "#..", "#.."],
  "%": ["#.#", "..#", ".#.", "#..", "#.#"],
  "'": ["#", "#", ".", ".", "."],
  "(": [".#", "#.", "#.", "#.", ".#"],
  ")": ["#.", ".#", ".#", ".#", "#."],
  "&": [".##..", "#..#.", ".##..", "#..#.", ".##.#"],
  // Right arrow — a shaft with a ">" head, for "opens → destination" notes.
  "→": ["..#..", "...#.", "#####", "...#.", "..#.."],
  // Up triangle — a solid filled ▲, vertically centered like the operators
  // above, for the pickup card's "▲ UPGRADE" marker.
  "▲": [".....", "..#..", ".###.", "#####", "....."],
  "=": ["...", "###", "...", "###", "..."],
};

/** Pixel width of one glyph (unknown chars fall back to "?"). */
export function glyphWidth(char) {
  const glyph = GLYPHS[char.toUpperCase()] ?? GLYPHS["?"];
  return glyph[0].length;
}

/** Pixel width of a rendered string. */
export function measureText(text) {
  let width = 0;
  for (const char of text.toUpperCase()) {
    width += glyphWidth(char) + LETTER_SPACING;
  }
  return Math.max(0, width - LETTER_SPACING);
}

/** Render a string to a new surface in the given color. */
export function renderText(text, color) {
  const surface = createSurface(Math.max(1, measureText(text)), FONT_HEIGHT);
  let cursor = 0;
  for (const char of text.toUpperCase()) {
    const glyph = GLYPHS[char.toUpperCase()] ?? GLYPHS["?"];
    glyph.forEach((row, y) => {
      [...row].forEach((cell, x) => {
        if (cell === "#") setPixel(surface, cursor + x, y, color);
      });
    });
    cursor += glyph[0].length + LETTER_SPACING;
  }
  return surface;
}

/**
 * Pack every glyph into a horizontal white atlas surface + metrics for the
 * runtime renderer: { height, spacing, glyphs: { char: { x, width } } }.
 */
export function buildFontAtlas() {
  const chars = Object.keys(GLYPHS);
  const totalWidth = chars.reduce((w, c) => w + GLYPHS[c][0].length + 1, 0);
  const atlas = createSurface(totalWidth, FONT_HEIGHT);
  const meta = { height: FONT_HEIGHT, spacing: LETTER_SPACING, glyphs: {} };

  let x = 0;
  for (const char of chars) {
    const glyph = GLYPHS[char];
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
