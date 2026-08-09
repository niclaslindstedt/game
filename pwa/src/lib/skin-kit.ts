// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The kit every world's paint recipe is written with — the noise, the colour
// arithmetic and the crater scatter, in one import-free leaf.
//
// It was extracted from planet-skins.ts when the satellites arrived: the
// planets' recipes and the moons' recipes are two large tables that both need
// this and must not import each other, and a shared leaf is the only shape that
// does not end in a cycle. Nothing here knows what a planet is — it is sphere
// arithmetic, and that is why it can sit in the @ui/lib pool.
//
// THE ONE RULE THAT IS NOT OBVIOUS: no `Math.random`, anywhere, ever. A skin is
// baked once and cached, so a body that re-craters itself between two reloads
// is un-reviewable — you cannot tell a change you made from a change the
// generator made. Every scatter here runs off `lcg`, seeded by its caller.

import type { Blob } from "./planet-maps.ts";

/** An RGB triple, 0–255, kept as plain numbers so `mix` stays cheap. */
export type Rgb = [number, number, number];

/** An equirectangular surface texture: `w×h` RGB triples, row-major. */
export type Skin = { w: number; h: number; rgb: Uint8ClampedArray };

/** A cloud deck: `w×h` RGBA, where alpha is how much of the ground it hides. */
export type CloudSkin = { w: number; h: number; rgba: Uint8ClampedArray };

// ---------------------------------------------------------------------------
// The noise kit: seamless on the sphere, because it is sampled in 3D.
// ---------------------------------------------------------------------------

function hash3(x: number, y: number, z: number): number {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263 + (z | 0) * 1274126177;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function vnoise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = fade(x - xi);
  const yf = fade(y - yi);
  const zf = fade(z - zi);
  const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
  return lerp(
    lerp(
      lerp(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), xf),
      lerp(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), xf),
      yf,
    ),
    lerp(
      lerp(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), xf),
      lerp(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), xf),
      yf,
    ),
    zf,
  );
}

/** Fractal Brownian motion — layered noise, in 3D so it never seams. */
export function fbm3(
  x: number,
  y: number,
  z: number,
  octaves: number,
  seed: number,
): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * vnoise3(x * freq + seed, y * freq - seed, z * freq + seed * 2);
    freq *= 2;
    amp *= 0.5;
  }
  return sum;
}

export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/** A deterministic little generator, so a scattered crater field is the same
 * on every device and every reload. Never `Math.random` — the sky is shared
 * geometry, and a body that re-craters itself between two screenshots is
 * un-reviewable. */
export function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** The unit sphere point of an equirectangular texel, for the noise fields. */
export function spherePoint(i: number, j: number, w: number, h: number): Rgb {
  const lat = (0.5 - (j + 0.5) / h) * Math.PI;
  const lon = ((i + 0.5) / w) * Math.PI * 2;
  const cl = Math.cos(lat);
  return [cl * Math.cos(lon), Math.sin(lat), cl * Math.sin(lon)];
}

/** Latitude (deg) of an equirectangular row. */
export function rowLat(j: number, h: number): number {
  return 90 - ((j + 0.5) * 180) / h;
}

/** Scatter `count` craters over a sphere with radii falling off as a power law
 * (many small, few large) — the real size distribution of an old surface. */
export function craterField(seed: number, count: number, maxR: number): Blob[] {
  const rnd = lcg(seed);
  const out: Blob[] = [];
  for (let i = 0; i < count; i++) {
    // Uniform on the sphere: latitude from asin, not from a flat lat draw, or
    // the poles end up carpeted.
    const lat = (Math.asin(rnd() * 2 - 1) * 180) / Math.PI;
    const lon = rnd() * 360 - 180;
    const r = maxR * (0.12 + 0.88 * Math.pow(rnd(), 2.6));
    out.push({ lon, lat, r, amount: 0.35 + 0.5 * rnd(), hard: 0.5 });
  }
  return out;
}
