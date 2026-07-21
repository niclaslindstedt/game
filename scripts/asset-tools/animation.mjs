// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Animation preview utilities. Frame-by-frame quality is judged on a film
// strip (all frames side by side, plus an onion-skin overlay that exposes
// anchor drift between frames); motion timing is judged in the browser via
// the animated WebP the generator also emits.

import sharp from "sharp";

import { blit, createSurface, fill, upscale } from "./surface.mjs";

/**
 * A film strip: every frame side by side at `scale`, followed by an
 * onion-skin cell where all frames are stacked half-transparent — if the
 * character's anchor drifts between frames, the stack shows a double image.
 */
export function buildFilmStrip(frames, { scale = 8, pad = 2 } = {}) {
  const w = frames[0].width;
  const h = frames[0].height;
  const strip = fill(
    createSurface((w + pad) * (frames.length + 1) + pad, h + 2 * pad),
    [24, 24, 28, 255],
  );
  frames.forEach((frame, i) => blit(strip, frame, pad + i * (w + pad), pad));

  const onion = createSurface(w, h);
  for (const frame of frames) {
    for (let i = 0; i < frame.data.length; i += 4) {
      if (frame.data[i + 3] === 0) continue;
      // Average onto whatever earlier frames put here (crude but readable).
      const lit = onion.data[i + 3] > 0;
      onion.data[i] = lit
        ? (onion.data[i] + frame.data[i]) >> 1
        : frame.data[i];
      onion.data[i + 1] = lit
        ? (onion.data[i + 1] + frame.data[i + 1]) >> 1
        : frame.data[i + 1];
      onion.data[i + 2] = lit
        ? (onion.data[i + 2] + frame.data[i + 2]) >> 1
        : frame.data[i + 2];
      onion.data[i + 3] = Math.max(onion.data[i + 3], 160);
    }
  }
  blit(strip, onion, pad + frames.length * (w + pad), pad);

  return upscale(strip, scale);
}

/** Encode frames as a looping animated WebP (equal `delayMs` per frame). */
export async function writeAnimatedWebp(
  frames,
  delayMs,
  path,
  { scale = 8 } = {},
) {
  const scaled = frames.map((f) => upscale(f, scale));
  const { width, height } = scaled[0];
  const joined = Buffer.concat(scaled.map((f) => Buffer.from(f.data)));
  await sharp(joined, {
    raw: { width, height, channels: 4, pages: scaled.length },
  })
    .webp({ delay: frames.map(() => delayMs), loop: 0, lossless: true })
    .toFile(path);
}
