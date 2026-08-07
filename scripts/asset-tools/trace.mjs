// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Trace a decoded reference image into a sprite object — the body of
// `sprite-author analyze`, factored out so the round-trip it promises can be
// asserted without spawning the CLI 1,400 times (tests/sprite_png_roundtrip_test.ts).
//
// Two steps, both deterministic: resample the image down to the target cell
// grid (image.mjs takes each cell's DOMINANT color, not an average), then
// quantize those cells into a palette + char grid (quantize.mjs). The result
// is the sprite YAML's whole field set MINUS the prompt fields — a picture
// carries pixels, never the words that asked for them.

import { resampleToCells } from "./image.mjs";
import { quantizeGrid } from "./quantize.mjs";

/**
 * @param {{width: number, height: number, data: Uint8Array}} image decoded reference
 * @param {{name: string, family: string, size: [number, number],
 *          colors?: number, description?: string}} fields
 * @returns the sprite object `sprite-author analyze` emits, ready for `toYaml`.
 */
export function traceImage(image, { name, family, size, colors, description }) {
  const cells = resampleToCells(image, size[0], size[1]);
  const { palette, grid } = quantizeGrid(cells, colors ?? 16);
  return { name, family, size, description: description ?? "", palette, grid };
}
