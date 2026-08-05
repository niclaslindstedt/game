// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE BADGE COMPOSITOR — how one achievement sprite becomes one portal raster
// (scripts/achievement-art.mjs). Two operations, both small and both load-
// bearing enough to be worth testing on their own:
//
//   `lockedBadge`  the shelf's unearned treatment, pixel for pixel.
//   `badgeCanvas`  the sprite centered on the portal's square, upscaled by a
//                  WHOLE number — pixel art scales by whole pixels or not at
//                  all, and a store shows this art bigger than the game ever
//                  does.

import { blit, createSurface, fill, upscale } from "./surface.mjs";

/**
 * The backdrop a badge sits on: the shelf's own icon cell, which is
 * `rgba(255, 255, 255, 0.04)` over the panel's `#0b0d10`, flattened. Both
 * portals want an image with no alpha channel, and a transparent badge would
 * otherwise land on whatever the store happens to draw behind it.
 */
export const BADGE_BACKDROP = [0x15, 0x17, 0x1a, 0xff];

/**
 * The shelf's LOCKED treatment: `grayscale(1)` then `brightness(0.55)` — the
 * pair styles.css applies to an unearned badge
 * (`.achievement-row.locked .achievement-cell .pixel-img`). Both are CSS filter
 * shorthands, which the Filter Effects spec pins to sRGB, so the luminance
 * matrix and the multiply both run on the stored bytes exactly as a browser
 * runs them.
 *
 * Alpha is untouched: a locked badge is dimmed, not faded out.
 */
export function lockedBadge(surface) {
  const out = createSurface(surface.width, surface.height);
  out.data.set(surface.data);
  for (let i = 0; i < out.data.length; i += 4) {
    const luma =
      0.2126 * out.data[i] +
      0.7152 * out.data[i + 1] +
      0.0722 * out.data[i + 2];
    const value = Math.min(255, Math.round(luma * 0.55));
    out.data[i] = value;
    out.data[i + 1] = value;
    out.data[i + 2] = value;
  }
  return out;
}

/**
 * Center a sprite on a `size × size` canvas at the largest INTEGER scale that
 * still fits the content box (`margin` is the fraction of the canvas kept clear
 * on each side, for a portal that rounds the corners of what it is given).
 *
 * Never below 1×: a sprite taller than the box — Steam's 64px chip against a
 * 32×48 rocket — ships at native size rather than being squeezed onto a
 * half-pixel grid.
 */
export function badgeCanvas(sprite, { size, margin = 0 }) {
  const box = Math.max(1, Math.round(size * (1 - 2 * margin)));
  const factor = Math.max(
    1,
    Math.min(Math.floor(box / sprite.width), Math.floor(box / sprite.height)),
  );
  const scaled = factor === 1 ? sprite : upscale(sprite, factor);
  const canvas = fill(createSurface(size, size), BADGE_BACKDROP);
  return blit(
    canvas,
    scaled,
    Math.round((size - scaled.width) / 2),
    Math.round((size - scaled.height) / 2),
  );
}
