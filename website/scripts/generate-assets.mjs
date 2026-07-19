#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The asset pipeline (see the `pixel-assets` skill). Renders everything the
// game draws from its programmatic sources of truth:
//   sprite-data/ grids → sprite atlas PNG + source-rect JSON   (committed)
//   asset-tools/font.mjs → font atlas PNG + metrics JSON       (committed)
//   previews (8x sprites, contact sheets — one per family plus the full
//   strip — film strips, animated WebPs, palette sheet, font specimen)
//   → website/assets-preview/                                  (gitignored)

import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { buildFilmStrip, writeAnimatedWebp } from "./asset-tools/animation.mjs";
import { packAtlas } from "./asset-tools/atlas.mjs";
import { buildFontAtlas, renderText } from "./asset-tools/font.mjs";
import { buildHudFontAtlas, renderHudText } from "./asset-tools/font-hud.mjs";
import {
  buildRelicFonts,
  RELIC_TIERS,
  renderRelicText,
} from "./asset-tools/relic-font.mjs";
import { gridStats, gridToSurface, validateGrid } from "./asset-tools/grid.mjs";
import { groundContrast, woundVisibility } from "./asset-tools/lint.mjs";
import { buildPalette } from "./asset-tools/palette.mjs";
import { buildContactSheet, writePng } from "./asset-tools/preview.mjs";
import { blit, createSurface, fill, upscale } from "./asset-tools/surface.mjs";
import {
  ANIMATIONS,
  CORE_PALETTE,
  FAMILIES,
  SPRITE_FAMILY,
  SPRITE_PALETTES,
  SPRITES,
  WOUND_PLANS,
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
  await writePng(upscale(surface, 8), `${previewDir}/${name}@8x.png`);
}

// One committed atlas + source rects instead of one PNG per sprite — the
// app slices it at load time (website/src/game/assets.ts).
const { atlas, rects } = packAtlas(surfaces);
await writePng(atlas, `${assetsDir}/atlas.png`);
writeFileSync(`${assetsDir}/atlas.json`, `${JSON.stringify(rects, null, 2)}\n`);

// Contact sheets: one per family over ITS ground tile (the reviewable
// unit — wounded variants included), plus the full strip for cross-family
// sweeps. Cells grow to the family's biggest sprite so bosses don't
// overflow their neighbors. The contrast lint runs alongside: a silhouette
// dissolving into the family's ground is flagged here instead of during
// playtesting.
for (const family of FAMILIES) {
  const names = Object.keys(SPRITES).filter(
    (name) => SPRITE_FAMILY[name] === family.name,
  );
  const familySurfaces = Object.fromEntries(
    names.map((name) => [name, surfaces[name]]),
  );
  const cell = Math.max(
    24,
    ...names.map((n) => Math.max(surfaces[n].width, surfaces[n].height) + 4),
  );
  await writePng(
    buildContactSheet(familySurfaces, surfaces[family.ground], { cell }),
    `${previewDir}/family_${family.name}.png`,
  );
  for (const name of names) {
    if (family.contrastExempt.includes(name)) continue;
    const failing = groundContrast(surfaces[name], surfaces[family.ground]);
    if (failing !== null) {
      console.warn(
        `! ${name}: edge contrast ${failing.toFixed(0)} vs ${family.ground} — check family_${family.name}.png`,
      );
    }
  }
}

// Wound visibility: a wound painted in colors the body already wears is
// invisible (the #24 wraith case) — flag it before anyone squints at 200
// previews.
for (const [sprite, plan] of Object.entries(WOUND_PLANS)) {
  const failing = woundVisibility(
    SPRITES[`${sprite}_0`],
    SPRITES[`${sprite}_hurt_0`],
    // The wounded frame's palette (full family scope) — it covers both the
    // body chars and the gore chars the overlay paints, where the base
    // sprite's own per-sprite palette carries only its used keys.
    SPRITE_PALETTES[`${sprite}_hurt_0`],
  );
  if (failing !== null) {
    console.warn(
      `! ${sprite}: hurt overlay visibly changes only ${failing} px — pick a splat char that separates from the body (style: ${JSON.stringify(plan.style)})`,
    );
  }
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

const { atlas: fontAtlas, meta } = buildFontAtlas();
await writePng(fontAtlas, `${assetsDir}/font.png`);
writeFileSync(`${assetsDir}/font.json`, `${JSON.stringify(meta, null, 2)}\n`);

const specimenLines = [
  "THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG",
  "0123456789 .,:!?-+×/%'()→▲=",
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

// ---- HUD font: taller 7px atlas + metrics for the small HUD readouts --------
// (the minimap strip's rampage stage + kill tally). White, tinted at runtime
// like the UI font. Both gitignored, rebuilt on build.

const hud = buildHudFontAtlas();
await writePng(hud.atlas, `${assetsDir}/font-hud.png`);
writeFileSync(
  `${assetsDir}/font-hud.json`,
  `${JSON.stringify(hud.meta, null, 2)}\n`,
);

const hudSpecimenLines = [
  "THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG",
  "0123456789 .:-/×+·",
  "RAMPAGE 6    128 KILLS    1:23",
];
const hudSpecimen = fill(
  createSurface(220, hudSpecimenLines.length * 10 + 4),
  [24, 24, 28, 255],
);
hudSpecimenLines.forEach((line, i) => {
  blit(hudSpecimen, renderHudText(line, [244, 244, 244, 255]), 2, 2 + i * 10);
});
await writePng(upscale(hudSpecimen, 4), `${previewDir}/font-hud-specimen.png`);

// ---- Relic font: one shared metrics JSON + one pre-colored atlas per tier --
// (unique/legendary/artifact item names). Both gitignored, rebuilt on build.

const relic = buildRelicFonts();
writeFileSync(
  `${assetsDir}/font-relic.json`,
  `${JSON.stringify(relic.meta, null, 2)}\n`,
);
for (const tier of RELIC_TIERS) {
  await writePng(relic.atlases[tier], `${assetsDir}/font-relic-${tier}.png`);
}

// Specimen: the alphabet plus a real name of each tier, struck in that tier's
// own metal, over the card's dark ground — the surface to judge the font on.
const relicSpecimen = [
  { text: "UNIQUE ABCDEFG MUSKRAT'S TOOTH", tier: "unique" },
  { text: "LEGENDARY HIJKLMN DRAGON'S BREATH", tier: "legendary" },
  { text: "ARTIFACT OPQRSTU WORLDSPLITTER", tier: "artifact" },
  { text: "MJÖLNIR EXCALIBUR THE PANOPTICON", tier: "unique" },
  { text: "MJÖLNIR EXCALIBUR THE PANOPTICON", tier: "legendary" },
  { text: "MJÖLNIR EXCALIBUR THE PANOPTICON", tier: "artifact" },
];
const relicSheet = fill(
  createSurface(230, relicSpecimen.length * 10 + 4, 4),
  [18, 18, 22, 255],
);
relicSpecimen.forEach(({ text, tier }, i) => {
  blit(relicSheet, renderRelicText(text, tier), 3, 3 + i * 10);
});
await writePng(upscale(relicSheet, 4), `${previewDir}/font-relic-specimen.png`);

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
  `wrote ${Object.keys(surfaces).length}-sprite atlas (${atlas.width}x${atlas.height}) + font atlas → ${assetsDir}`,
);
console.log(`previews → ${previewDir}`);
