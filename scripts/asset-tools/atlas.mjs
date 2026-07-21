// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Sprite-atlas packer — composes every rendered sprite surface into ONE
// texture plus a name → source-rect map, so the app ships (and the PWA
// precaches) two sprite files instead of hundreds. A simple shelf packer is
// plenty for a few hundred small sprites; what matters is that it is
// DETERMINISTIC (sorted input, no randomness) so regenerating assets is
// byte-identical and the atlas only diffs when a grid does.

import { blit, createSurface } from "./surface.mjs";

/**
 * Pack name → surface into one atlas surface.
 *
 * @returns `{ atlas, rects }` where `rects` maps each name to its
 *          `{ x, y, w, h }` source rect, keys sorted for stable JSON diffs.
 */
export function packAtlas(surfaces, { width = 256, gutter = 1 } = {}) {
  const names = Object.keys(surfaces).sort();
  // Tallest first so shelves stay dense; name breaks ties deterministically.
  const order = [...names].sort(
    (a, b) => surfaces[b].height - surfaces[a].height || (a < b ? -1 : 1),
  );

  const placed = {};
  let x = gutter;
  let y = gutter;
  let shelf = 0;
  for (const name of order) {
    const s = surfaces[name];
    if (s.width + 2 * gutter > width) {
      throw new Error(`atlas: sprite "${name}" wider than atlas (${width}px)`);
    }
    if (x + s.width + gutter > width) {
      x = gutter;
      y += shelf + gutter;
      shelf = 0;
    }
    placed[name] = { x, y, w: s.width, h: s.height };
    x += s.width + gutter;
    shelf = Math.max(shelf, s.height);
  }

  const atlas = createSurface(width, y + shelf + gutter);
  for (const name of order) {
    blit(atlas, surfaces[name], placed[name].x, placed[name].y);
  }
  const rects = Object.fromEntries(names.map((n) => [n, placed[n]]));
  return { atlas, rects };
}
