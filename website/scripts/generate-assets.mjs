#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The asset pipeline (see the `pixel-assets` skill). Renders everything the
// game draws from its programmatic sources of truth:
//   sprite-data.mjs grids → website/src/game/assets/*.png     (committed)
//   asset-tools/font.mjs  → font atlas PNG + metrics JSON      (committed)
//   previews (8x sprites, contact sheet, film strips, animated WebPs,
//   palette sheet, font specimen) → website/assets-preview/    (gitignored)

import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { buildFilmStrip, writeAnimatedWebp } from "./asset-tools/animation.mjs";
import { buildFontAtlas, renderText } from "./asset-tools/font.mjs";
import { gridStats, gridToSurface, validateGrid } from "./asset-tools/grid.mjs";
import { buildPalette } from "./asset-tools/palette.mjs";
import { buildContactSheet, writePng } from "./asset-tools/preview.mjs";
import { blit, createSurface, fill, upscale } from "./asset-tools/surface.mjs";
import { CORE_PALETTE } from "./sprite-data/core.mjs";
import {
  ANIMATIONS,
  FAMILIES,
  SPRITE_PALETTES,
  SPRITES,
} from "./sprite-data/index.mjs";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const assetsDir = here("../src/game/assets");
const previewDir = here("../assets-preview");
mkdirSync(assetsDir, { recursive: true });
mkdirSync(previewDir, { recursive: true });

// ---- Sprites: validate, render, write 1x + previews ------------------------

const surfaces = {};
for (const [name, grid] of Object.entries(SPRITES)) {
  validateGrid(name, grid, SPRITE_PALETTES[name]);
  surfaces[name] = gridToSurface(grid, SPRITE_PALETTES[name]);

  // Orphan pixels read as noise at 1x — flag them for the checklist. Ground
  // tiles are exempt: their speckles are deliberately scattered single px.
  const { orphans } = gridStats(grid);
  const speckledTile = /^(grass|moon|gravel)_/.test(name);
  if (orphans.length > 0 && !speckledTile) {
    console.warn(
      `! ${name}: orphan pixel(s) at ${orphans
        .map((o) => `(${o.x},${o.y} "${o.char}")`)
        .join(", ")}`,
    );
  }
}

for (const [name, surface] of Object.entries(surfaces)) {
  await writePng(surface, `${assetsDir}/${name}.png`);
  await writePng(upscale(surface, 8), `${previewDir}/${name}@8x.png`);
}

await writePng(
  buildContactSheet(surfaces, surfaces.moon_0),
  `${previewDir}/sheet.png`,
);

// ---- Animations: film strips (frame + anchor check) + motion previews ------

for (const [name, anim] of Object.entries(ANIMATIONS)) {
  const frames = anim.frames.map((f) => {
    if (!surfaces[f]) throw new Error(`animation "${name}": no sprite "${f}"`);
    return surfaces[f];
  });
  await writePng(buildFilmStrip(frames), `${previewDir}/${name}_strip.png`);
  await writeAnimatedWebp(frames, anim.delayMs, `${previewDir}/${name}.webp`);
}

// ---- Pixel font: committed atlas + metrics, preview specimen ---------------

const { atlas, meta } = buildFontAtlas();
await writePng(atlas, `${assetsDir}/font.png`);
writeFileSync(`${assetsDir}/font.json`, JSON.stringify(meta));

const specimenLines = [
  "THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG",
  "0123456789 .,:!?-+/%'()",
  "YOU DIED! LEVEL CLEAR: 8/8 KILLS IN 1:23",
];
const specimen = fill(
  createSurface(200, specimenLines.length * 8 + 4),
  [24, 24, 28, 255],
);
specimenLines.forEach((line, i) => {
  blit(specimen, renderText(line, [244, 244, 244, 255]), 2, 2 + i * 8);
});
await writePng(upscale(specimen, 4), `${previewDir}/font-specimen.png`);

// ---- Palette sheet: every scope's chars as labeled swatches -----------------
// One section per palette scope: the shared core first, then each family
// with local chars — so a free char is checked per scope, not globally.

const swatch = 12;
const scopes = [
  ["CORE", buildPalette(CORE_PALETTE)],
  ...FAMILIES.filter((f) => Object.keys(f.localPalette).length > 0).map((f) => [
    f.name.toUpperCase(),
    f.localPalette,
  ]),
];
const rows = scopes.reduce((n, [, map]) => n + 1 + Object.keys(map).length, 0);
const paletteSheet = fill(
  createSurface(84, rows * (swatch + 2) + 2, 4),
  [24, 24, 28, 255],
);
let row = 0;
for (const [scope, map] of scopes) {
  blit(
    paletteSheet,
    renderText(scope, [244, 244, 244, 255]),
    2,
    2 + row * (swatch + 2) + 3,
  );
  row++;
  for (const [char, color] of Object.entries(map)) {
    const y = 2 + row * (swatch + 2);
    blit(paletteSheet, fill(createSurface(swatch, swatch), color), 2, y);
    const label = `${char} ${color.slice(0, 3).join(",")}`;
    blit(
      paletteSheet,
      renderText(label, [244, 244, 244, 255]),
      swatch + 6,
      y + 3,
    );
    row++;
  }
}
await writePng(upscale(paletteSheet, 4), `${previewDir}/palette.png`);

console.log(
  `wrote ${Object.keys(surfaces).length} sprites + font atlas → ${assetsDir}`,
);
console.log(`previews → ${previewDir}`);
