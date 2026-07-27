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
