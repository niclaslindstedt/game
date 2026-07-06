// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Raw RGBA surface utilities — the low-level half of the asset toolkit (see
// the `pixel-assets` skill). A "surface" is { width, height, data } with
// `data` a Uint8Array of width*height*4 bytes, straight-alpha RGBA. All
// compositing here is simple source-over; sprites are hard-edged pixel art
// so nothing fancier is needed.

/** An empty (fully transparent) surface. */
export function createSurface(width, height) {
  return { width, height, data: new Uint8Array(width * height * 4) };
}

/** Fill the whole surface with an [r,g,b,a] color. */
export function fill(surface, [r, g, b, a]) {
  for (let i = 0; i < surface.data.length; i += 4) {
    surface.data[i] = r;
    surface.data[i + 1] = g;
    surface.data[i + 2] = b;
    surface.data[i + 3] = a;
  }
  return surface;
}

/** Set one pixel (no-op outside bounds). */
export function setPixel(surface, x, y, [r, g, b, a]) {
  if (x < 0 || y < 0 || x >= surface.width || y >= surface.height) return;
  const i = (y * surface.width + x) * 4;
  surface.data[i] = r;
  surface.data[i + 1] = g;
  surface.data[i + 2] = b;
  surface.data[i + 3] = a;
}

/**
 * Draw `src` onto `dst` at (dx, dy), source-over. Transparent source pixels
 * leave the destination untouched; pixel art has no partial alpha, so a
 * simple opacity test is exact.
 */
export function blit(dst, src, dx, dy) {
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const si = (y * src.width + x) * 4;
      if (src.data[si + 3] === 0) continue;
      setPixel(dst, dx + x, dy + y, [
        src.data[si],
        src.data[si + 1],
        src.data[si + 2],
        src.data[si + 3],
      ]);
    }
  }
  return dst;
}

/** Nearest-neighbor integer upscale — the only correct scaling for pixel art. */
export function upscale(surface, factor) {
  const out = createSurface(surface.width * factor, surface.height * factor);
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      const si =
        (Math.floor(y / factor) * surface.width + Math.floor(x / factor)) * 4;
      const di = (y * out.width + x) * 4;
      out.data[di] = surface.data[si];
      out.data[di + 1] = surface.data[si + 1];
      out.data[di + 2] = surface.data[si + 2];
      out.data[di + 3] = surface.data[si + 3];
    }
  }
  return out;
}

/** Tile `tile` to cover a width×height surface (for seam checks and grounds). */
export function tileSurface(tile, width, height) {
  const out = createSurface(width, height);
  for (let y = 0; y < height; y += tile.height) {
    for (let x = 0; x < width; x += tile.width) {
      blit(out, tile, x, y);
    }
  }
  return out;
}

/** A checkerboard surface — the standard backdrop for judging transparency. */
export function checkerboard(width, height, cell, colorA, colorB) {
  const out = createSurface(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const even = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0;
      setPixel(out, x, y, even ? colorA : colorB);
    }
  }
  return out;
}

/** Mirror a surface horizontally (cheap second facing for characters). */
export function mirrorX(surface) {
  const out = createSurface(surface.width, surface.height);
  for (let y = 0; y < surface.height; y++) {
    for (let x = 0; x < surface.width; x++) {
      const si = (y * surface.width + (surface.width - 1 - x)) * 4;
      const di = (y * surface.width + x) * 4;
      out.data.set(surface.data.subarray(si, si + 4), di);
    }
  }
  return out;
}
