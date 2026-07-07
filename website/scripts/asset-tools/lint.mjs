// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Generation-time contrast lint — automates the two "look at it" checklist
// items that have burned us before (see the `pixel-assets` skill): a sprite
// whose edges vanish into its family's ground tile, and a derived wound
// overlay that barely changes the body it lands on (the invisible
// dark-on-dark wraith wound of #24). Both are WARNINGS, like the orphan
// check: they point eyes at a preview, they don't replace looking.
//
// Thresholds are calibrated against the shipped sprite set (the lowest
// passing values, with margin): every shipped sprite clears GROUND_CONTRAST
// at 84+, and every shipped wound visibly changes 6+ pixels while the #24
// wraith bug changed 5. Recalibrate the same way if a deliberate new style
// trips them.

/** Euclidean RGB distance — cheap, hue-aware color difference. */
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Mean [r,g,b] of a surface's opaque pixels. */
function meanColor(surface) {
  const sum = [0, 0, 0];
  let n = 0;
  for (let i = 0; i < surface.data.length; i += 4) {
    if (surface.data[i + 3] === 0) continue;
    sum[0] += surface.data[i];
    sum[1] += surface.data[i + 1];
    sum[2] += surface.data[i + 2];
    n++;
  }
  return n ? sum.map((v) => v / n) : [0, 0, 0];
}

/** A sprite reads against the ground through its boundary; below this mean
 * edge-vs-ground color distance the silhouette starts to dissolve. */
const GROUND_CONTRAST = 60;

/**
 * Mean color distance between a sprite's edge pixels (opaque pixels
 * touching transparency or the sprite border — the silhouette) and the
 * ground tile's mean color. Returns null when the sprite reads fine,
 * else the failing distance.
 */
export function groundContrast(surface, groundTile) {
  const groundMean = meanColor(groundTile);
  const { width, height, data } = surface;
  const opaque = (x, y) =>
    x >= 0 &&
    y >= 0 &&
    x < width &&
    y < height &&
    data[(y * width + x) * 4 + 3] !== 0;
  let sum = 0;
  let n = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] === 0) continue;
      if (
        opaque(x - 1, y) &&
        opaque(x + 1, y) &&
        opaque(x, y - 1) &&
        opaque(x, y + 1)
      ) {
        continue;
      }
      sum += dist([data[i], data[i + 1], data[i + 2]], groundMean);
      n++;
    }
  }
  if (n === 0) return null;
  const contrast = sum / n;
  return contrast < GROUND_CONTRAST ? contrast : null;
}

/** A wound pixel "shows" when it recolors the body by at least this much. */
const WOUND_VISIBLE_DELTA = 40;
/** Below this many visible pixels the hurt stage reads as unwounded. */
const WOUND_MIN_VISIBLE = 6;

/**
 * Count the pixels a wounded frame VISIBLY changed on its base frame: cells
 * whose char differs and whose color moved by at least WOUND_VISIBLE_DELTA.
 * A wound painted in colors the body already wears changes nothing the eye
 * can see — the #24 wraith bug. Returns null when the wound reads, else the
 * failing pixel count.
 */
export function woundVisibility(baseGrid, woundedGrid, palette) {
  let visible = 0;
  woundedGrid.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const before = baseGrid[y][x];
      const after = row[x];
      if (before === after || before === "." || after === ".") continue;
      if (dist(palette[before], palette[after]) >= WOUND_VISIBLE_DELTA) {
        visible++;
      }
    }
  });
  return visible < WOUND_MIN_VISIBLE ? visible : null;
}
