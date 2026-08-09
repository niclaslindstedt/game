// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Preview builders — the "look at it" half of the asset iteration cycle (see
// the `pixel-assets` skill). These compose sprites onto realistic and
// worst-case backdrops at world scale, then upscale nearest-neighbor so the
// agent can Read the PNG and judge silhouette, contrast, and transparency.

import sharp from "sharp";

import {
  blit,
  checkerboard,
  createSurface,
  fill,
  tileSurface,
  upscale,
} from "./surface.mjs";

/** Encode a surface to a PNG file.
 *
 * `limitInputPixels: false` because the "input" is a raw RGBA buffer this
 * process built a line ago — sharp's default cap exists to stop a decoder being
 * handed a hostile file, and there is no decode here at all. The cap was
 * costing a real thing: the review sheets grew past it as the sprite roster did,
 * so `make assets` (the FULL previews, the art loop's own command) died on
 * "Input image exceeds pixel limit" while every other entry point, which draws
 * fewer previews, went on passing. */
export async function writePng(surface, path) {
  try {
    await sharp(Buffer.from(surface.data), {
      limitInputPixels: false,
      raw: { width: surface.width, height: surface.height, channels: 4 },
    })
      .png()
      .toFile(path);
  } catch (err) {
    // A FAILURE IS RE-THROWN WITH THE FILE AND THE SIZE ON IT, because the
    // encoder's own message is not: a run writes two thousand of these from a
    // worker pool, so a bare "…exceeds pixel limit" with a stack through
    // `Promise.all` names neither which preview blew up nor how big it had got.
    // That is the message the cap above was found through the hard way.
    const why = err instanceof Error ? err.message : String(err);
    throw new Error(
      `${path}: ${surface.width}×${surface.height} px failed to encode — ${why}`,
      { cause: err },
    );
  }
}

/**
 * A contact sheet at world scale (then upscaled): every sprite centered in a
 * cell over (a) the tiled ground, (b) a light checker, (c) a dark checker —
 * plus a tiled-ground strip at the bottom for seam checking.
 */
export function buildContactSheet(sprites, groundTile, opts = {}) {
  const cell = opts.cell ?? 24;
  const pad = 2;
  const scale = opts.scale ?? 4;
  const names = Object.keys(sprites);

  const cols = names.length;
  const rows = 3;
  const stripHeight = groundTile.height * 2;
  const width = cols * (cell + pad) + pad;
  const height = rows * (cell + pad) + pad + stripHeight + pad;

  const sheet = fill(createSurface(width, height), [24, 24, 28, 255]);
  const grounds = [
    tileSurface(groundTile, cell, cell),
    checkerboard(cell, cell, 4, [204, 204, 204, 255], [230, 230, 230, 255]),
    checkerboard(cell, cell, 4, [40, 40, 44, 255], [58, 58, 64, 255]),
  ];

  names.forEach((name, col) => {
    const sprite = sprites[name];
    grounds.forEach((ground, row) => {
      const cx = pad + col * (cell + pad);
      const cy = pad + row * (cell + pad);
      blit(sheet, ground, cx, cy);
      blit(
        sheet,
        sprite,
        cx + Math.floor((cell - sprite.width) / 2),
        cy + Math.floor((cell - sprite.height) / 2),
      );
    });
  });

  // Seam check: the ground tiled 2 rows tall across the full sheet width.
  blit(
    sheet,
    tileSurface(groundTile, width - 2 * pad, stripHeight),
    pad,
    rows * (cell + pad) + pad,
  );

  return upscale(sheet, scale);
}
