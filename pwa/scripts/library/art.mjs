// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The library's pictures. Two kinds, both taken from the pipeline the game
// already runs on — no new art, and nothing that can drift from what a player
// actually sees.
//
//   SPRITES are copied straight out of `make assets`' 8× per-sprite previews
//   (pwa/assets-preview/<name>@8x.png). Integer-scaled and drawn `pixelated`,
//   so the art stays art.
//
//   GROUND is not a file anywhere — the renderer tiles it live from the level's
//   own `tiles` spec. So the venue backgrounds are baked here by asking the
//   renderer's own rule (`groundTileName`) which sprite belongs in each cell of
//   a repeating block, and cutting those cells out of the sprite atlas. A level
//   that changes its ground changes its page's background on the next build.

import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import sharp from "sharp";

import { REPO } from "./catalogs.mjs";

const ASSETS = join(REPO, "pwa/src/game/assets");
const PREVIEWS = join(REPO, "pwa/assets-preview");

/** World units per ground tile — the renderer's `TILE`, read from its source. */
const TILE = 16;
/** Cells across a background block. Big enough that the repeat isn't a plaid. */
const BLOCK = 16;
/** Nearest-neighbour upscale baked into the background PNG. */
const BLOCK_SCALE = 2;

const atlasMeta = JSON.parse(readFileSync(join(ASSETS, "atlas.json"), "utf8"));

/** The atlas cell of a sprite name — `{ x, y, w, h }`, or undefined. The
 * manifest ships compact `[x, y, w, h]` tuples (it rides the app's
 * critical-path budget — see generate-assets.mjs); this is the one place
 * they widen back to named fields. */
export const spriteCell = (name) => {
  const cell = atlasMeta[name];
  return cell ? { x: cell[0], y: cell[1], w: cell[2], h: cell[3] } : undefined;
};

/**
 * The intrinsic size of a sprite's 8× preview file, for the `width`/`height`
 * every `<img>` needs (check-seo fails a build without them, and a page that
 * reflows as its images land is a page that scores badly).
 */
export function spriteSize(name) {
  const cell = spriteCell(name);
  return cell ? { width: cell.w * 8, height: cell.h * 8 } : null;
}

/** Copy the 8× previews of `names` into `<out>/sprites/`. Missing art throws —
 * a page with a hole in it should fail the build, not ship. */
export function copySprites(names, outDir) {
  const dir = join(outDir, "sprites");
  mkdirSync(dir, { recursive: true });
  const missing = [];
  for (const name of new Set(names)) {
    const from = join(PREVIEWS, `${name}@8x.png`);
    if (!existsSync(from)) {
      missing.push(name);
      continue;
    }
    copyFileSync(from, join(dir, `${name}.png`));
  }
  if (missing.length > 0) {
    throw new Error(
      `library: no 8× preview for ${missing.join(", ")} — run \`make assets\` first`,
    );
  }
}

let atlasRaw = null;
async function atlasPixels() {
  if (!atlasRaw) {
    atlasRaw = await sharp(join(ASSETS, "atlas.png"))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
  }
  return atlasRaw;
}

/**
 * Bake one venue's repeating ground block. The block is a real patch of that
 * level's floor: `groundTileName` picks each cell exactly as the renderer would
 * at the same coordinates, and the cells are cut from the atlas.
 */
export async function writeGroundTile(tiles, file, groundTileName) {
  const { data, info } = await atlasPixels();
  const size = BLOCK * TILE;
  const out = Buffer.alloc(size * size * 4);

  for (let ty = 0; ty < BLOCK; ty++) {
    for (let tx = 0; tx < BLOCK; tx++) {
      const cell = spriteCell(groundTileName(tiles, tx, ty));
      if (!cell) continue;
      for (let y = 0; y < TILE; y++) {
        const srcY = cell.y + (y % cell.h);
        const srcStart = (srcY * info.width + cell.x) * 4;
        const dstStart = ((ty * TILE + y) * size + tx * TILE) * 4;
        data.copy(
          out,
          dstStart,
          srcStart,
          srcStart + Math.min(TILE, cell.w) * 4,
        );
      }
    }
  }

  await sharp(out, { raw: { width: size, height: size, channels: 4 } })
    .resize(size * BLOCK_SCALE, size * BLOCK_SCALE, { kernel: "nearest" })
    .png({ compressionLevel: 9, palette: true })
    .toFile(file);
  return { size: size * BLOCK_SCALE };
}
