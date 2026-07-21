// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Quantize a resampled cell grid (image.mjs) into a sprite's palette + char
// grid — the core of turning a reference image into an authorable sprite.
//
// Two-stage, and DETERMINISTIC end to end (no RNG — that is what makes the
// emitted YAML byte-stable across re-runs):
//   1. Gather the distinct opaque colors. If there are already few enough,
//      they ARE the palette — a clean pixel-art reference passes through with
//      zero quantization loss.
//   2. Only when the color count exceeds the cap do we median-cut in OKLab
//      down to `maxColors` representatives and remap every cell to its nearest.
// Keys are assigned by OKLab lightness→hue (oklab.labSortKey) and mapped to
// `A-Za-z0-9`, so the same image always yields the same palette letters.

import { labSortKey, oklabDistance, rgbToOklab } from "./oklab.mjs";
import { rgbaToHex } from "./sprite-yaml.mjs";

/** The single-char key alphabet, in assignment order (`.` stays transparent). */
const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

const packRgb = (r, g, b) => ((r << 16) | (g << 8) | b) >>> 0;

/**
 * Median-cut a list of `{ rgb, lab, weight }` points down to `k` clusters,
 * splitting in OKLab space. The box with the widest axis range is split at its
 * points' median along that axis; ties break on box index for determinism.
 * @returns array of representative `[r,g,b]` colors (cluster OKLab means).
 */
function medianCut(points, k) {
  let boxes = [points];
  while (boxes.length < k) {
    // Pick the splittable box with the largest single-axis OKLab range.
    let target = -1;
    let targetAxis = 0;
    let targetRange = 0;
    boxes.forEach((box, bi) => {
      if (box.length < 2) return;
      for (let axis = 0; axis < 3; axis++) {
        let lo = Infinity;
        let hi = -Infinity;
        for (const p of box) {
          if (p.lab[axis] < lo) lo = p.lab[axis];
          if (p.lab[axis] > hi) hi = p.lab[axis];
        }
        if (hi - lo > targetRange) {
          targetRange = hi - lo;
          target = bi;
          targetAxis = axis;
        }
      }
    });
    if (target < 0) break; // every box is a single color — cannot split further

    const box = boxes[target];
    const sorted = [...box].sort(
      (a, b) => a.lab[targetAxis] - b.lab[targetAxis],
    );
    const mid = Math.floor(sorted.length / 2);
    boxes = [
      ...boxes.slice(0, target),
      sorted.slice(0, mid),
      sorted.slice(mid),
      ...boxes.slice(target + 1),
    ];
  }

  return boxes.map((box) => {
    // Weighted OKLab mean → back to sRGB is perceptually centered, but for a
    // faithful pixel-art palette we snap to the box's most-used actual color.
    let best = box[0];
    for (const p of box) if (p.weight > best.weight) best = p;
    return best.rgb;
  });
}

/**
 * Turn a resampled cell grid (`[r,g,b] | null` per cell) into a sprite's
 * `palette` (char → hex) and `grid` (block-scalar rows). Caps the palette at
 * `maxColors` via median-cut; `.` is the reserved transparent cell.
 *
 * @returns `{ palette, grid }` — `palette` a char→hex map, `grid` a `\n`-joined
 *          string with a trailing newline (the block-scalar shape the YAML
 *          loader expects).
 */
export function quantizeGrid(cells, maxColors = 16) {
  if (maxColors > ALPHABET.length) {
    throw new Error(
      `maxColors ${maxColors} exceeds the ${ALPHABET.length}-key alphabet`,
    );
  }

  // Distinct opaque colors, with usage weight (for the median-cut snap).
  const seen = new Map(); // packed → { rgb, lab, weight }
  for (const row of cells) {
    for (const cell of row) {
      if (!cell) continue;
      const key = packRgb(cell[0], cell[1], cell[2]);
      const hit = seen.get(key);
      if (hit) hit.weight++;
      else seen.set(key, { rgb: cell, lab: rgbToOklab(cell), weight: 1 });
    }
  }

  const points = [...seen.values()];
  const reps =
    points.length <= maxColors
      ? points.map((p) => p.rgb)
      : medianCut(points, maxColors);

  // Deduplicate reps (median-cut can converge two boxes onto one snap color)
  // and order them by OKLab lightness→hue so the key letters are stable.
  const uniqueReps = [];
  const repSeen = new Set();
  for (const rgb of reps) {
    const key = packRgb(rgb[0], rgb[1], rgb[2]);
    if (repSeen.has(key)) continue;
    repSeen.add(key);
    uniqueReps.push({ rgb, lab: rgbToOklab(rgb) });
  }
  uniqueReps.sort((a, b) => {
    const ka = labSortKey(a.lab);
    const kb = labSortKey(b.lab);
    return ka[0] - kb[0] || ka[1] - kb[1];
  });

  const palette = {};
  uniqueReps.forEach((rep, i) => {
    rep.char = ALPHABET[i];
    palette[rep.char] = rgbaToHex(rep.rgb);
  });

  // Map every cell to the nearest representative in OKLab.
  const nearest = (rgb) => {
    const lab = rgbToOklab(rgb);
    let best = uniqueReps[0];
    let bestD = Infinity;
    for (const rep of uniqueReps) {
      const d = oklabDistance(lab, rep.lab);
      if (d < bestD) {
        bestD = d;
        best = rep;
      }
    }
    return best.char;
  };

  const rows = cells.map((row) =>
    row.map((cell) => (cell ? nearest(cell) : ".")).join(""),
  );
  return { palette, grid: `${rows.join("\n")}\n` };
}
