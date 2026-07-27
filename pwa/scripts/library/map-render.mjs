// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MISSION MAP — the level as it actually LOOKS, whole, shrunk to fit a page.
//
// A reader who searched a venue's name wants to see the place. The developer
// map (`scripts/map-layout.mjs`) is the wrong picture for that by design — it is
// a labelled coordinate grid with con circles sized by mob count and a decode
// key down the side, and none of that is what a level looks like.
//
// The right picture already exists: `scripts/level-render.mjs` composites the
// REAL in-game sprites at true world scale — the ground and patch tiles by the
// renderer's own rule, the scattered decor, every solid obstacle (walls, doors,
// buildings, crates), the landmarks, and the horde at its real spawn positions
// — out of a live `createGame`. This module is a thin adapter: render bare (no
// labels, no title strip — nothing on the image that is not the level), then
// shrink to a page width.
//
// The downscale is a real resample rather than a nearest-neighbour pick. Past
// about half scale, picking one pixel in n drops every thin wall and most of the
// rubble; averaging keeps the level's texture and reads as an aerial photograph
// of the place, which is what it is.
//
// One fixed seed, so a rebuild does not reshuffle every mission's picture for no
// reason — and the page's caption says plainly that the scatter is rolled fresh
// each run, so a reader takes the built geometry as fact and the rubble as a
// likeness.

import sharp from "sharp";

import { renderLevel } from "../../../scripts/level-render.mjs";

/** The seed the world is built with, and the rung it is built on. */
const MAP_SEED = 7;
const MAP_DIFFICULTY = "medium";

/**
 * How far the drop shots' backdrop is zoomed in. A ground tile is 16 world
 * units and the level renders at 1 px per unit, so 8× puts a tile at 128 px —
 * about nine across a 1200 px frame, which is what the game shows on the
 * reference phone. A power of two so the nearest-neighbour upscale is exact.
 */
const MAP_CROP_ZOOM = 8;

/**
 * Draw one level whole and write it scaled to `width`. Returns the emitted
 * image's intrinsic size, which the page needs on the `<img>` so the layout
 * does not jump as the picture lands.
 */
export async function writeMissionMap(levelDef, file, { width = 1200 } = {}) {
  const { surf } = renderLevel(levelDef, {
    seed: MAP_SEED,
    difficulty: MAP_DIFFICULTY,
    bare: true,
    // The sleeping packs and each spawn point's queued mobs too: those are the
    // bulk of what a player fights here, and a map that showed only the mobs
    // minted at creation would show a near-empty venue and call it a level.
    dormant: true,
  });

  const scale = Math.min(1, width / surf.width);
  const outWidth = Math.max(1, Math.round(surf.width * scale));
  const outHeight = Math.max(1, Math.round(surf.height * scale));
  await sharp(Buffer.from(surf.data), {
    raw: { width: surf.width, height: surf.height, channels: 4 },
  })
    .resize(outWidth, outHeight, { kernel: "lanczos3" })
    .png({ compressionLevel: 9 })
    .toFile(file);

  return { width: outWidth, height: outHeight };
}

/**
 * A PATCH of one level, at true scale — the backdrop the drop shots stand on.
 *
 * Deliberately a CROP of the full-resolution render rather than the shrunk map
 * the mission page shows. The shrunk one is the whole level in 1200 pixels, and
 * at that ratio a wall is a hairline and a crate is three pixels: laid behind a
 * card it reads as static. Cutting the same number of pixels out of the
 * unshrunk render instead gives a few tiles of REAL floor, with the real decor
 * and the real obstacles on it, at the size the game draws them.
 *
 * Taken from the middle of the map, and on the same fixed seed as the mission
 * map, so a rebuild does not reshuffle every picture.
 */
export function renderMapCrop(levelDef, { width, height, zoom = MAP_CROP_ZOOM }) {
  const { surf } = renderLevel(levelDef, {
    seed: MAP_SEED,
    difficulty: MAP_DIFFICULTY,
    bare: true,
    dormant: true,
  });

  // Cut a SMALL patch and blow it up, rather than cutting a big one 1:1. At 1:1
  // a 1200 px crop is about 75 tiles across and reads as a distant aerial —
  // every plate a smudge. At 8× it is nine tiles across, which is roughly what
  // the game itself shows on a phone: floor you could walk on, with the decor
  // and the plate seams at the size a player knows them.
  const cropW = Math.min(Math.round(width / zoom), surf.width);
  const cropH = Math.min(Math.round(height / zoom), surf.height);
  const left = Math.floor((surf.width - cropW) / 2);
  const top = Math.floor((surf.height - cropH) / 2);

  return sharp(Buffer.from(surf.data), {
    raw: { width: surf.width, height: surf.height, channels: 4 },
  })
    .extract({ left, top, width: cropW, height: cropH })
    // Nearest-neighbour, and `zoom` is a power of two, so every source pixel
    // becomes an exact square block instead of a smeared one.
    .resize(width, height, { fit: "cover", kernel: "nearest" })
    .png()
    .toBuffer();
}
