#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Quick sprite peek: render one or more named sprites (space/comma separated),
// upscaled, side by side on a checkerboard, so a freshly-authored grid can be
// eyeballed without a full `make assets`. Usage:
//   node website/scripts/sprite-peek.mjs doge_1_0 doge_1_1 [--zoom 8]
import { register } from "node:module";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writePng } from "./asset-tools/preview.mjs";
import { gridToSurface } from "./asset-tools/grid.mjs";
import { blit, createSurface, fillRect, upscale } from "./asset-tools/surface.mjs";
import { SPRITES, SPRITE_PALETTES } from "./sprite-data/index.mjs";

register("../../scripts/game-alias-loader.mjs", import.meta.url);
const previewDir = fileURLToPath(new URL("../assets-preview", import.meta.url));
mkdirSync(previewDir, { recursive: true });

let zoom = 8;
const names = [];
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--zoom") zoom = Number(argv[++i]);
  else names.push(...argv[i].split(",").filter(Boolean));
}

const pad = 4;
const tiles = names.map((n) => {
  const key = SPRITES[n] ? n : SPRITES[`${n}_0`] ? `${n}_0` : null;
  if (!key) throw new Error(`unknown sprite "${n}"`);
  return { n, s: gridToSurface(SPRITES[key], SPRITE_PALETTES[key]) };
});
const h = Math.max(...tiles.map((t) => t.s.height));
const w = tiles.reduce((a, t) => a + t.s.width + pad, pad);
const surf = createSurface(w, h + pad * 2);
// magenta checkerboard so transparency reads
for (let y = 0; y < surf.height; y++)
  for (let x = 0; x < surf.width; x++)
    if (((x >> 2) + (y >> 2)) & 1) fillRect(surf, x, y, 1, 1, [40, 40, 48, 255]);
    else fillRect(surf, x, y, 1, 1, [60, 60, 70, 255]);
let cx = pad;
for (const t of tiles) {
  blit(surf, t.s, cx, pad + (h - t.s.height));
  cx += t.s.width + pad;
}
const out = `${previewDir}/peek_${names.join("_")}.png`;
await writePng(upscale(surf, zoom), out);
console.log(`wrote ${out} (${surf.width * zoom}x${surf.height * zoom})`);
