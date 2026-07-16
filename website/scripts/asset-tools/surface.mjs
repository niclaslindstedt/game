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

// ---- Vector primitives -----------------------------------------------------
// The overlay half of the toolkit — lines, circles, rects and arrows for
// annotated diagrams (the map renderer). Everything composites source-over via
// `blendPixel`, so translucent fills (zone tints, fog) layer correctly, while a
// solid stroke just passes alpha 255.

/** Source-over composite one [r,g,b,a] pixel onto the surface (alpha-aware). */
export function blendPixel(surface, x, y, [r, g, b, a]) {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= surface.width || y >= surface.height) return;
  if (a <= 0) return;
  const i = (y * surface.width + x) * 4;
  if (a >= 255) {
    surface.data[i] = r;
    surface.data[i + 1] = g;
    surface.data[i + 2] = b;
    surface.data[i + 3] = 255;
    return;
  }
  const sa = a / 255;
  const da = surface.data[i + 3] / 255;
  const oa = sa + da * (1 - sa);
  if (oa <= 0) return;
  const mix = (s, d) => Math.round((s * sa + d * da * (1 - sa)) / oa);
  surface.data[i] = mix(r, surface.data[i]);
  surface.data[i + 1] = mix(g, surface.data[i + 1]);
  surface.data[i + 2] = mix(b, surface.data[i + 2]);
  surface.data[i + 3] = Math.round(oa * 255);
}

/** A filled `w×h` dot centred on (x,y) — the nib every stroke paints with. */
function dot(surface, x, y, color, thickness) {
  const r = Math.max(0, Math.floor((thickness - 1) / 2));
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) blendPixel(surface, x + dx, y + dy, color);
}

/** Bresenham line from (x0,y0) to (x1,y1), `thickness` px wide. */
export function drawLine(surface, x0, y0, x1, y1, color, thickness = 1) {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    dot(surface, x0, y0, color, thickness);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

/** Stroke a circle outline (midpoint algorithm), `thickness` px. */
export function strokeCircle(surface, cx, cy, radius, color, thickness = 1) {
  let x = Math.round(radius);
  let y = 0;
  let err = 1 - x;
  const plot = (px, py) => dot(surface, px, py, color, thickness);
  while (x >= y) {
    plot(cx + x, cy + y);
    plot(cx - x, cy + y);
    plot(cx + x, cy - y);
    plot(cx - x, cy - y);
    plot(cx + y, cy + x);
    plot(cx - y, cy + x);
    plot(cx + y, cy - x);
    plot(cx - y, cy - x);
    y++;
    if (err < 0) err += 2 * y + 1;
    else {
      x--;
      err += 2 * (y - x) + 1;
    }
  }
}

/** Fill a disc of `radius` centred on (cx,cy). */
export function fillCircle(surface, cx, cy, radius, color) {
  const r2 = radius * radius;
  for (let dy = -radius; dy <= radius; dy++)
    for (let dx = -radius; dx <= radius; dx++)
      if (dx * dx + dy * dy <= r2) blendPixel(surface, cx + dx, cy + dy, color);
}

/** Stroke a rectangle outline, `thickness` px. */
export function strokeRect(surface, x, y, w, h, color, thickness = 1) {
  drawLine(surface, x, y, x + w, y, color, thickness);
  drawLine(surface, x, y + h, x + w, y + h, color, thickness);
  drawLine(surface, x, y, x, y + h, color, thickness);
  drawLine(surface, x + w, y, x + w, y + h, color, thickness);
}

/** Fill a rectangle (alpha-aware — the zone/fog tint pass). */
export function fillRect(surface, x, y, w, h, color) {
  x = Math.round(x);
  y = Math.round(y);
  for (let py = 0; py < Math.round(h); py++)
    for (let px = 0; px < Math.round(w); px++)
      blendPixel(surface, x + px, y + py, color);
}

/** A line from (x0,y0) to (x1,y1) capped with an arrowhead at the end. */
export function drawArrow(
  surface,
  x0,
  y0,
  x1,
  y1,
  color,
  thickness = 1,
  headLen = 8,
) {
  drawLine(surface, x0, y0, x1, y1, color, thickness);
  const ang = Math.atan2(y1 - y0, x1 - x0);
  const wing = Math.PI / 7;
  for (const s of [1, -1]) {
    const a = ang + Math.PI + s * wing;
    drawLine(
      surface,
      x1,
      y1,
      x1 + Math.cos(a) * headLen,
      y1 + Math.sin(a) * headLen,
      color,
      thickness,
    );
  }
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
