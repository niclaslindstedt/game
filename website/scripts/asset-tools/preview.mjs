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

/** Encode a surface to a PNG file. */
export async function writePng(surface, path) {
  await sharp(Buffer.from(surface.data), {
    raw: { width: surface.width, height: surface.height, channels: 4 },
  })
    .png()
    .toFile(path);
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
