// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Pixel-grid utilities — parse the character-grid sprite format (see the
// `pixel-assets` skill and sprite-data.mjs) into RGBA surfaces, with strict
// validation so a mistyped row fails the generator instead of silently
// shipping a corrupt sprite.

import { createSurface, setPixel } from "./surface.mjs";

/**
 * Validate a grid: rectangular, non-empty, and every non-`.` char present in
 * the palette. Throws with the sprite name and row so errors point at the
 * exact line to fix.
 */
export function validateGrid(name, grid, palette) {
  if (!Array.isArray(grid) || grid.length === 0) {
    throw new Error(`sprite "${name}": grid is empty`);
  }
  const width = grid[0].length;
  grid.forEach((row, y) => {
    if (row.length !== width) {
      throw new Error(
        `sprite "${name}" row ${y}: width ${row.length}, expected ${width}`,
      );
    }
    for (const char of row) {
      if (char !== "." && !(char in palette)) {
        throw new Error(
          `sprite "${name}" row ${y}: char "${char}" not in palette`,
        );
      }
    }
  });
}

/** Render a validated grid to an RGBA surface. */
export function gridToSurface(grid, palette) {
  const surface = createSurface(grid[0].length, grid.length);
  grid.forEach((row, y) => {
    [...row].forEach((char, x) => {
      if (char !== ".") setPixel(surface, x, y, palette[char]);
    });
  });
  return surface;
}

/** Mirror a grid horizontally (edit-time transform for symmetric sprites). */
export function mirrorGridX(grid) {
  return grid.map((row) => [...row].reverse().join(""));
}

/**
 * Report grid statistics used by the quality checklist: color usage and
 * orphan pixels (a lit pixel with no lit 4-neighbor reads as noise at 1x).
 */
export function gridStats(grid) {
  const colors = new Map();
  const orphans = [];
  const lit = (x, y) =>
    y >= 0 &&
    y < grid.length &&
    x >= 0 &&
    x < grid[y].length &&
    grid[y][x] !== ".";
  grid.forEach((row, y) => {
    [...row].forEach((char, x) => {
      if (char === ".") return;
      colors.set(char, (colors.get(char) ?? 0) + 1);
      if (
        !lit(x - 1, y) &&
        !lit(x + 1, y) &&
        !lit(x, y - 1) &&
        !lit(x, y + 1)
      ) {
        orphans.push({ x, y, char });
      }
    });
  });
  return { colors, orphans };
}
