#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The asset pipeline (see the `pixel-assets` skill). Renders everything the
// game draws from its programmatic sources of truth:
//   sprite-data/ grids → sprite atlas PNG + source-rect JSON   (committed)
//   asset-tools/font.mjs → font atlas PNG + metrics JSON       (committed)
//   previews (8x sprites, contact sheets — one per family plus the full
//   strip — film strips, animated WebPs, palette sheet, font specimen)
//   → pwa/assets-preview/                                  (gitignored)
//
// HOW MUCH OF THE PREVIEW SET TO DRAW IS AN ARGUMENT, because the previews cost
// ~6x what the game's own art does and almost nothing needs them. `--previews`:
//
//   full     (default) everything above — the art-iteration loop (`make assets`)
//   sprites  only the per-sprite `@8x.png` files, which the LIBRARY's page
//            builder copies as its sprite art (pwa/scripts/library/art.mjs) —
//            the website build needs these and none of the rest
//   none     no previews at all — a typecheck/lint/test run rebuilds the
//            catalogs and the atlas to check them, and looks at no picture
//
// The LINTS (orphan pixels, ground contrast, wound visibility) run in every
// mode: they are the reason a warning is a build signal rather than something
// you notice while squinting at a contact sheet.

import { mkdirSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
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
  SPRITE_PLANES,
  SPRITES,
  WOUND_PLANS,
} from "./sprite-data/index.mjs";

const PREVIEW_MODES = ["full", "sprites", "none"];
const previewArg = process.argv
  .slice(2)
  .find((a) => a.startsWith("--previews="));
const previews = previewArg ? previewArg.slice("--previews=".length) : "full";
if (!PREVIEW_MODES.includes(previews)) {
  console.error(
    `generate-assets: --previews=${previews} — expected one of ${PREVIEW_MODES.join(", ")}`,
  );
  process.exit(2);
}
/** The per-sprite 8x previews — the library build's sprite art. */
const wantSpritePreviews = previews !== "none";
/** The sheets, strips, specimens and swatches — the human's review surfaces. */
const wantReviewPreviews = previews === "full";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const assetsDir = here("../pwa/src/game/assets");
const previewDir = here("../pwa/assets-preview");
mkdirSync(assetsDir, { recursive: true });
if (wantSpritePreviews) mkdirSync(previewDir, { recursive: true });

// PNG encoding is the pipeline's whole cost — ~1800 sprite previews plus the
// sheets — and every file is independent of every other. sharp hands the encode
// to libuv's threadpool, so awaiting them one at a time left the machine idle;
// a bounded queue keeps every core busy without holding 1800 upscaled surfaces
// in memory at once (each is built by its thunk only when its slot opens).
// Capped at 8 rather than the core count: the encode is I/O-bound past a
// handful of workers, and the review sheets are single surfaces hundreds of
// megabytes wide — a queue as wide as a 32-core machine would hold all of them
// live at once for no gain.
const PNG_WORKERS = Math.min(8, Math.max(2, availableParallelism()));
const pngQueue = [];
const queuePng = (build, path) =>
  pngQueue.push(async () => writePng(build(), path));
const drainPngs = async () => {
  const tasks = pngQueue.splice(0);
  const width = Math.min(tasks.length, PNG_WORKERS);
  let next = 0;
  await Promise.all(
    Array.from({ length: width }, async () => {
      while (next < tasks.length) await tasks[next++]();
    }),
  );
};

// Sprites whose ISOLATED pixels are authored rather than accidental, gathered
// from every family's `speckleExempt`. See the orphan check below.
const speckleExempt = new Set(FAMILIES.flatMap((f) => f.speckleExempt ?? []));

// ---- Sprites: validate, render, write 1x + previews ------------------------

const surfaces = {};
for (const [name, grid] of Object.entries(SPRITES)) {
  validateGrid(name, grid, SPRITE_PALETTES[name]);
  surfaces[name] = gridToSurface(grid, SPRITE_PALETTES[name]);

  // Orphan pixels read as noise at 1x — flag them for the checklist. The
  // exemption is for art whose SUBJECT IS SCATTER, where a lone pixel is the
  // drawing rather than a slip: the ground tiles' speckle, and the blood
  // family's spray (`blood_burst_*` is authored as "a scatter of pieces flung
  // well clear"), its pools' jitter (`blood_tile_*`) and the droplets petering
  // out past a pool's lip (`blood_fringe_*`). `blood_hit_*` is NOT exempt — it
  // is a compact ring, so a stray pixel there really is one.
  //
  // WHICH sprites those are is DATA (`speckleExempt` in the family manifest)
  // rather than a name pattern in this file: a pattern means every future
  // sprite whose scatter is intentional has to come back and edit the build,
  // and — worse — that `blood_hit_*` distinction above survives only as long as
  // nobody widens the regex by one character.
  const { orphans } = gridStats(grid);
  if (orphans.length > 0 && !speckleExempt.has(name)) {
    console.warn(
      `! ${name}: orphan pixel(s) at ${orphans
        .map((o) => `(${o.x},${o.y} "${o.char}")`)
        .join(", ")}`,
    );
  }
}

if (wantSpritePreviews) {
  for (const [name, surface] of Object.entries(surfaces)) {
    queuePng(() => upscale(surface, 8), `${previewDir}/${name}@8x.png`);
  }
}

// One committed atlas + source rects instead of one PNG per sprite — the
// app slices it at load time (pwa/src/game/assets.ts). The rects ship as
// COMPACT `[x, y, w, h]` tuples, one per line: the manifest rides the app's
// critical-path budget (pwa/scripts/check-seo.mjs), and the keyed-object
// pretty print cost ~1.7 KB gzipped (85 KB raw) for nothing a reader needs —
// while one entry per line keeps the committed file's diffs per-sprite.
const { atlas, rects } = packAtlas(surfaces);
queuePng(() => atlas, `${assetsDir}/atlas.png`);
const rectLines = Object.entries(rects).map(
  ([name, r]) => `  ${JSON.stringify(name)}: [${r.x}, ${r.y}, ${r.w}, ${r.h}]`,
);
writeFileSync(`${assetsDir}/atlas.json`, `{\n${rectLines.join(",\n")}\n}\n`);

// WHICH SPRITES LIE DOWN — the art drawn in plan rather than in elevation, so
// the renderer projects it onto the floor instead of standing it up (see
// `pwa/src/game/render/tilt.ts`). A SEPARATE manifest rather than a field on
// the atlas rects: `SpriteName` is `keyof typeof atlas.json`, and widening
// every entry to carry a plane would make the atlas a record of records for the
// sake of a property a few dozen sprites set. Sorted, so the file diffs.
const floorSprites = Object.entries(SPRITE_PLANES)
  .filter(([, plane]) => plane === "floor")
  .map(([name]) => name)
  .sort();
writeFileSync(
  `${assetsDir}/sprite-planes.json`,
  `${JSON.stringify({ floor: floorSprites }, null, 2)}\n`,
);

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
  if (wantReviewPreviews) {
    const familySurfaces = Object.fromEntries(
      names.map((name) => [name, surfaces[name]]),
    );
    const cell = Math.max(
      24,
      ...names.map((n) => Math.max(surfaces[n].width, surfaces[n].height) + 4),
    );
    queuePng(
      () =>
        buildContactSheet(familySurfaces, surfaces[family.ground], { cell }),
      `${previewDir}/family_${family.name}.png`,
    );
  }
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
if (wantReviewPreviews) {
  queuePng(
    () => buildContactSheet(surfaces, surfaces.moon_0),
    `${previewDir}/sheet.png`,
  );
}

// ---- Animations: film strips (frame + anchor check) + motion previews ------

// The frame lookup is the CHECK — an animation naming a sprite that does not
// exist must fail the build in every mode, not only when somebody asked for
// pictures. Only the drawing of it is a preview.
const animFrames = Object.entries(ANIMATIONS).map(([name, anim]) => [
  name,
  anim,
  anim.frames.map((f) => {
    if (!surfaces[f]) throw new Error(`animation "${name}": no sprite "${f}"`);
    return surfaces[f];
  }),
]);
if (wantReviewPreviews) {
  for (const [name, anim, frames] of animFrames) {
    queuePng(() => buildFilmStrip(frames), `${previewDir}/${name}_strip.png`);
    await writeAnimatedWebp(frames, anim.delayMs, `${previewDir}/${name}.webp`);
  }
}

// ---- Pixel font: committed atlas + metrics, preview specimen ---------------

const { atlas: fontAtlas, meta } = buildFontAtlas();
queuePng(() => fontAtlas, `${assetsDir}/font.png`);
writeFileSync(`${assetsDir}/font.json`, `${JSON.stringify(meta, null, 2)}\n`);

if (wantReviewPreviews) {
  const specimenLines = [
    "THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG",
    "0123456789 .,:!?-–—+×/%°'()→▲=≠$ ▶»≡■",
    "YOU DIED! LEVEL CLEAR: 8/8 KILLS IN 1:23",
  ];
  const specimen = fill(
    createSurface(200, specimenLines.length * 8 + 4),
    [24, 24, 28, 255],
  );
  specimenLines.forEach((line, i) => {
    blit(specimen, renderText(line, [244, 244, 244, 255]), 2, 2 + i * 8);
  });
  queuePng(() => upscale(specimen, 4), `${previewDir}/font-specimen.png`);
}

// ---- HUD font: taller 7px atlas + metrics for the small HUD readouts --------
// (the minimap strip's rampage stage + kill tally). White, tinted at runtime
// like the UI font. Both gitignored, rebuilt on build.

const hud = buildHudFontAtlas();
queuePng(() => hud.atlas, `${assetsDir}/font-hud.png`);
writeFileSync(
  `${assetsDir}/font-hud.json`,
  `${JSON.stringify(hud.meta, null, 2)}\n`,
);

if (wantReviewPreviews) {
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
  queuePng(
    () => upscale(hudSpecimen, 4),
    `${previewDir}/font-hud-specimen.png`,
  );
}

// ---- Relic font: one shared metrics JSON + one pre-colored atlas per tier --
// (unique/legendary/artifact item names). Both gitignored, rebuilt on build.

const relic = buildRelicFonts();
writeFileSync(
  `${assetsDir}/font-relic.json`,
  `${JSON.stringify(relic.meta, null, 2)}\n`,
);
for (const tier of RELIC_TIERS) {
  queuePng(() => relic.atlases[tier], `${assetsDir}/font-relic-${tier}.png`);
}

// Specimen: the alphabet plus a real name of each tier, struck in that tier's
// own metal, over the card's dark ground — the surface to judge the font on.
if (wantReviewPreviews) {
  const relicSpecimen = [
    { text: "UNIQUE ABCDEFG PROTOTYPE FANG", tier: "unique" },
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
  queuePng(
    () => upscale(relicSheet, 4),
    `${previewDir}/font-relic-specimen.png`,
  );
}

// ---- Palette sheet: every scope's chars as labeled swatches -----------------
// One section per palette scope: the shared core first, then each family
// with local chars — so a free char is checked per scope, not globally.

if (wantReviewPreviews) {
  const swatch = 12;
  const scopes = [
    ["CORE", buildPalette(CORE_PALETTE)],
    ...FAMILIES.filter((f) => Object.keys(f.localPalette).length > 0).map(
      (f) => [f.name.toUpperCase(), f.localPalette],
    ),
  ];
  const rows = scopes.reduce(
    (n, [, map]) => n + 1 + Object.keys(map).length,
    0,
  );
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
  queuePng(() => upscale(paletteSheet, 4), `${previewDir}/palette.png`);
}

await drainPngs();

console.log(
  `wrote ${Object.keys(surfaces).length}-sprite atlas (${atlas.width}x${atlas.height}) + font atlas → ${assetsDir}`,
);
console.log(
  wantReviewPreviews
    ? `previews → ${previewDir}`
    : wantSpritePreviews
      ? `sprite previews only (--previews=sprites) → ${previewDir}`
      : "previews skipped (--previews=none)",
);
