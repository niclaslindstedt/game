// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Image ingestion for authoring a sprite from a reference picture: decode a
// reference PNG into a raw RGBA surface, then resample it down to the sprite's
// target cell grid. The resample takes each cell's DOMINANT color (the mode),
// NOT an area average — pixel-art edges are hard, and averaging would smear a
// crisp two-color boundary into a muddy third color. A reference already at
// target resolution passes through exactly.

import sharp from "sharp";

import { createSurface } from "./surface.mjs";

/** Decode a PNG (or any sharp-readable image) into a straight-alpha RGBA surface. */
export async function loadImage(path) {
  const { data, info } = await sharp(path)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const surface = createSurface(info.width, info.height);
  // sharp hands back RGBA in the same byte order our surfaces use.
  surface.data.set(data.subarray(0, surface.data.length));
  return surface;
}

/** Pack an `[r,g,b,a]` into one integer so colors can key a Map cheaply. */
const packColor = (r, g, b, a) => ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;

/**
 * Resample a source surface to a `tw × th` cell grid, one color per cell.
 *
 * Each cell covers a rectangle of source pixels; the cell's color is the most
 * frequent opaque color in that rectangle (ties broken by lowest packed value,
 * for determinism). A cell is transparent (`null`) when at least half its
 * pixels are below `alphaThreshold`. When the source is already `tw × th` this
 * is an exact 1:1 copy.
 *
 * @returns `th`-long array of `tw`-long rows; each entry is `[r,g,b]` or `null`.
 */
export function resampleToCells(surface, tw, th, alphaThreshold = 128) {
  const { width, height, data } = surface;
  const rows = [];
  for (let cy = 0; cy < th; cy++) {
    const y0 = Math.floor((cy * height) / th);
    const y1 = Math.max(y0 + 1, Math.floor(((cy + 1) * height) / th));
    const row = [];
    for (let cx = 0; cx < tw; cx++) {
      const x0 = Math.floor((cx * width) / tw);
      const x1 = Math.max(x0 + 1, Math.floor(((cx + 1) * width) / tw));

      const counts = new Map(); // packedColor → { rgb, n }
      let opaque = 0;
      let total = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4;
          total++;
          if (data[i + 3] < alphaThreshold) continue;
          opaque++;
          const key = packColor(data[i], data[i + 1], data[i + 2], 255);
          const hit = counts.get(key);
          if (hit) hit.n++;
          else
            counts.set(key, { rgb: [data[i], data[i + 1], data[i + 2]], n: 1 });
        }
      }

      if (opaque * 2 < total) {
        row.push(null); // mostly transparent → transparent cell
        continue;
      }
      let best = null;
      let bestKey = Infinity;
      for (const [key, { rgb, n }] of counts) {
        if (best === null || n > best.n || (n === best.n && key < bestKey)) {
          best = { rgb, n };
          bestKey = key;
        }
      }
      row.push(best ? best.rgb : null);
    }
    rows.push(row);
  }
  return rows;
}
