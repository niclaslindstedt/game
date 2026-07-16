#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Sprite preview sheets for description authoring (see the `pixel-assets`
// skill) — for writing or backfilling a sprite's `description`. Renders one
// labeled contact sheet per family: every sprite drawn large over a two-tone
// checker (so both light and dark pixels survive), captioned with its exact
// atlas name, and numbered to a plain-text legend. The point is a single PNG an
// agent can Read to SEE what a sprite looks like while it writes the target
// `description` into the sprite's YAML.
//
// Sheets render from the same sprite-data source as `make assets`, so they can
// never disagree with the shipped atlas.
//
//   node website/scripts/sprite-preview.mjs all               one sheet/family
//   node website/scripts/sprite-preview.mjs family moon       one family
//   node website/scripts/sprite-preview.mjs family moon mars  several families
//   node website/scripts/sprite-preview.mjs names wraith_0 ecto_0
//   node website/scripts/sprite-preview.mjs families          list family names
//
// Output lands in website/assets-preview/descriptions/ (gitignored): a
// <family>.png sheet (paged into <family>_pN.png past --chunk sprites) and a
// <family>.txt legend (number -> exact sprite name, per page).
// Flags: --out <dir>  --scale <n>  --cols <n>  --chunk <n>

import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { measureText, renderText } from "./asset-tools/font.mjs";
import { gridToSurface } from "./asset-tools/grid.mjs";
import { writePng } from "./asset-tools/preview.mjs";
import {
  blit,
  checkerboard,
  createSurface,
  fill,
  upscale,
} from "./asset-tools/surface.mjs";
import { FAMILIES, SPRITE_PALETTES, SPRITES } from "./sprite-data/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDefault = path.join(here, "../assets-preview/descriptions");

const BG = [24, 24, 28, 255];
const INK = [244, 244, 244, 255];
const LIGHT = [150, 150, 158, 255];
const DARK = [58, 58, 66, 255];

/** The pixel font has no "_" glyph — swap it for "-" so captions read. */
const cap = (s) => s.replace(/_/g, "-");

function surfaceFor(name) {
  return gridToSurface(SPRITES[name], SPRITE_PALETTES[name]);
}

/**
 * A labeled preview sheet: every named sprite gets a cell — the sprite centered
 * over a neutral light/dark checker (both halves, so no pixel can vanish into
 * the background), an index number at the top-left, and its name captioned
 * below. Row-major; the same order as the legend the caller prints.
 */
function buildSheet(names, opts = {}) {
  const scale = opts.scale ?? 4;
  // Pre-upscale small sprites so their pixels read: a 16px mob becomes ~48px,
  // while a large backdrop that already fills the target stays 1×.
  const target = 48;
  const surfaces = names.map((n) => {
    const s = surfaceFor(n);
    const z = Math.max(
      1,
      Math.min(4, Math.floor(target / Math.max(s.width, s.height))),
    );
    return z > 1 ? upscale(s, z) : s;
  });
  const spriteMax = Math.max(
    target,
    ...surfaces.map((s) => s.width),
    ...surfaces.map((s) => s.height),
  );
  const capH = 6; // font is 5 tall + 1 leading
  const captionMax = Math.max(...names.map((n) => measureText(cap(n))));
  const inner = Math.max(spriteMax, captionMax);
  const pad = 3;
  const cellW = inner + pad * 2;
  const cellH = capH + inner + pad * 3; // caption band + sprite band

  const cols = opts.cols ?? Math.min(6, names.length);
  const rows = Math.ceil(names.length / cols);
  const width = cols * cellW;
  const height = rows * cellH;

  const sheet = fill(createSurface(width, height), BG);
  const checker = () => {
    // Half light, half dark so a light sprite reads on the dark half and a
    // dark sprite reads on the light half — nothing disappears.
    const s = checkerboard(inner, inner, 4, LIGHT, DARK);
    return s;
  };

  names.forEach((name, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * cellW;
    const y = row * cellH;

    // Number, top-left.
    blit(sheet, renderText(String(i + 1), INK), x + pad, y + pad);

    // Sprite band: centered over the neutral checker.
    const bandY = y + pad + capH;
    const bg = checker();
    blit(sheet, bg, x + pad, bandY);
    const sprite = surfaces[i];
    blit(
      sheet,
      sprite,
      x + pad + Math.floor((inner - sprite.width) / 2),
      bandY + Math.floor((inner - sprite.height) / 2),
    );

    // Caption below the sprite band.
    const label = renderText(cap(name), INK);
    blit(sheet, label, x + pad, bandY + inner + pad);
  });

  return upscale(sheet, scale);
}

/** Write one family's sheet(s) + a number->name legend. Families larger than
 * `chunk` split into `_pN` pages so each PNG stays legible when Read; the
 * legend numbers each page from 1 so it lines up with that page's cells. */
async function writeFamily(family, names, dir, opts) {
  mkdirSync(dir, { recursive: true });
  const chunk = opts.chunk ?? 48;
  const pages =
    names.length > chunk
      ? Array.from({ length: Math.ceil(names.length / chunk) }, (_, p) =>
          names.slice(p * chunk, (p + 1) * chunk),
        )
      : [names];

  const legendLines = [`# ${family} — ${names.length} sprites`];
  for (const [p, page] of pages.entries()) {
    const tag = pages.length === 1 ? "" : `_p${p + 1}`;
    const png = path.join(dir, `${family}${tag}.png`);
    await writePng(buildSheet(page, opts), png);
    if (pages.length > 1) legendLines.push(`\n## ${family}${tag}`);
    page.forEach((n, i) => legendLines.push(`${i + 1}\t${n}`));
    console.log(`${png}  (${page.length} sprites)`);
  }
  const txt = path.join(dir, `${family}.txt`);
  writeFileSync(txt, `${legendLines.join("\n")}\n`);
  console.log(`${txt}`);
}

const spritesDir = path.join(here, "sprites");

/** The base sprites of a family that have a YAML file — i.e. exactly the
 * sprites that carry a `description` to author. Derived wound/worn variants
 * (`_hurt_*`, `worn_*`, …) live only in the atlas, never as files, so they are
 * excluded — their look is generated from the base, not described. */
function familySprites(family) {
  return readdirSync(path.join(spritesDir, family))
    .filter((f) => f.endsWith(".yaml") && f !== "_family.yaml")
    .map((f) => f.slice(0, -".yaml".length))
    .filter((n) => SPRITES[n])
    .sort();
}

// ---- CLI --------------------------------------------------------------------

const USAGE = `usage:
  sprite-preview.mjs all                 one sheet per family
  sprite-preview.mjs family <name...>    one or more families
  sprite-preview.mjs names <name...>     an arbitrary set of sprites
  sprite-preview.mjs families            list family names
flags: --out <dir>  --scale <n>  --cols <n>  --chunk <n>`;

const argv = process.argv.slice(2);
const flags = {};
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const m = /^--(out|scale|cols|chunk)$/.exec(argv[i]);
  if (m) flags[m[1]] = argv[++i];
  else positional.push(argv[i]);
}
const [cmd, ...rest] = positional;
const opts = {
  scale: flags.scale ? Number(flags.scale) : undefined,
  cols: flags.cols ? Number(flags.cols) : undefined,
  chunk: flags.chunk ? Number(flags.chunk) : undefined,
};
const dir = flags.out ?? outDefault;
const familyNames = FAMILIES.map((f) => f.name);

switch (cmd) {
  case "families":
    console.log(familyNames.join("\n"));
    break;

  case "all":
    for (const family of familyNames) {
      const names = familySprites(family);
      if (names.length) await writeFamily(family, names, dir, opts);
    }
    break;

  case "family": {
    const wanted = rest.length ? rest : familyNames;
    for (const family of wanted) {
      if (!familyNames.includes(family)) {
        console.warn(`! unknown family "${family}" — skipped`);
        continue;
      }
      await writeFamily(family, familySprites(family), dir, opts);
    }
    break;
  }

  case "names": {
    const names = rest.filter((n) => {
      if (SPRITES[n]) return true;
      console.warn(`! no sprite "${n}" — skipped`);
      return false;
    });
    if (!names.length) {
      console.error("no valid sprite names given");
      process.exit(1);
    }
    await writeFamily("names", names, dir, opts);
    break;
  }

  default:
    console.log(USAGE);
    process.exit(cmd ? 1 : 0);
}
