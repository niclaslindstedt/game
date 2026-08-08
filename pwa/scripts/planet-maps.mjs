#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// LOOK at the worlds in the title sky — the iterate loop for the planet maps
// (pwa/src/lib/planet-maps.ts) and the skins baked from them
// (pwa/src/lib/planet-skins.ts).
//
// For every body it writes two PNGs an agent can Read and judge:
//
//   <kind>-map.png     the equirectangular skin, with a 30° graticule and the
//                      equator/prime meridian marked, so a coastline can be
//                      checked against an atlas
//   <kind>-globe.png   the same skin shaded onto spheres at four rotations,
//                      lit from the left — what the title screen actually
//                      shows, at a size a phone actually draws
//
// Neither the bakers nor the shading maths need a DOM, which is the point of
// keeping them out of the canvas class.
//
//   node pwa/scripts/planet-maps.mjs            every world
//   node pwa/scripts/planet-maps.mjs earth mars  just those
//
// Output lands in pwa/assets-preview/planets/ (gitignored).

import { mkdirSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("../../scripts/game-alias-loader.mjs", import.meta.url);

const { surfaceSkin, cloudSkin } = await import("../src/lib/planet-skins.ts");
const { SATURN_RINGS } = await import("../src/lib/planet-maps.ts");
const { writePng } = await import("../../scripts/asset-tools/preview.mjs");
const { createSurface, fill } =
  await import("../../scripts/asset-tools/surface.mjs");

const KINDS = [
  "mercury",
  "venus",
  "earth",
  "moon",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
];

/** Tilt of each spin axis from ECLIPTIC north, in degrees — the same frame and
 * the same numbers the shipped renderer uses (see STYLES in
 * pwa/src/lib/planet-globe.ts), NOT the textbook tilt-to-own-orbit. Keep the
 * two in step or these sheets stop being previews of the real thing. */
const OBLIQUITY = {
  mercury: 7.01,
  venus: 1.24,
  earth: 23.44,
  moon: 1.54,
  mars: 26.71,
  jupiter: 2.21,
  saturn: 28.05,
  uranus: 82.28,
  neptune: 28.03,
};

/** Matches DEFAULT_CAM_PITCH in planet-globe.ts. */
const CAM_PITCH = 17;

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, "../assets-preview/planets");
mkdirSync(outDir, { recursive: true });

const pick = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const kinds = pick.length ? pick : KINDS;

const DEG = Math.PI / 180;

/** The equirectangular skin at 2×, with a graticule over it. */
function mapSheet(skin, deck) {
  const scale = 2;
  const w = skin.w * scale;
  const h = skin.h * scale;
  const s = createSurface(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = (x / scale) | 0;
      const sy = (y / scale) | 0;
      const k = (sy * skin.w + sx) * 3;
      let r = skin.rgb[k];
      let g = skin.rgb[k + 1];
      let b = skin.rgb[k + 2];
      if (deck) {
        const dx = ((x / w) * deck.w) | 0;
        const dy = ((y / h) * deck.h) | 0;
        const d = (dy * deck.w + dx) * 4;
        const a = deck.rgba[d + 3] / 255;
        r += (deck.rgba[d] - r) * a;
        g += (deck.rgba[d + 1] - g) * a;
        b += (deck.rgba[d + 2] - b) * a;
      }
      // Graticule: every 30°, brighter on the equator and prime meridian.
      const lon = (x / w) * 360 - 180;
      const lat = 90 - (y / h) * 180;
      const onLon = Math.abs(((lon + 180) % 30) - 0) < 360 / w;
      const onLat = Math.abs(((lat + 90) % 30) - 0) < 180 / h;
      const axis = Math.abs(lon) < 360 / w || Math.abs(lat) < 180 / h;
      const grid = axis ? 0.55 : onLon || onLat ? 0.25 : 0;
      const i = (y * w + x) * 4;
      s.data[i] = r + (255 - r) * grid;
      s.data[i + 1] = g + (255 - g) * grid;
      s.data[i + 2] = b + (255 - b) * grid;
      s.data[i + 3] = 255;
    }
  }
  return s;
}

/** Shade one sphere into the surface at (ox, oy) with diameter `d`. */
function drawGlobe(surf, ox, oy, d, skin, deck, kind, spin, cloudSpin) {
  const ob = (OBLIQUITY[kind] ?? 0) * DEG;
  const pitch = CAM_PITCH * DEG;
  // North pole in view space: leaned by the obliquity, then pitched toward us.
  const nx = Math.sin(ob);
  const ny = -Math.cos(ob) * Math.cos(pitch);
  const nz = Math.cos(ob) * Math.sin(pitch);
  let ex = -ny;
  let ey = nx;
  const el = Math.hypot(ex, ey) || 1;
  ex /= el;
  ey /= el;
  const fx = ny * 0 - nz * ey;
  const fy = nz * ex - nx * 0;
  const fz = nx * ey - ny * ex;
  // Sunlight from the upper left, a little in front.
  const L = [-0.72, -0.28, 0.63];
  const r = d / 2;
  for (let py = 0; py < d; py++) {
    for (let px = 0; px < d; px++) {
      const dx = (px + 0.5 - r) / r;
      const dy = (py + 0.5 - r) / r;
      const q = dx * dx + dy * dy;
      if (q > 1) continue;
      const pz = Math.sqrt(1 - q);
      const lat = Math.asin(
        Math.max(-1, Math.min(1, dx * nx + dy * ny + pz * nz)),
      );
      const lon = Math.atan2(
        dx * ex + dy * ey + pz * 0,
        dx * fx + dy * fy + pz * fz,
      );
      const lam = dx * L[0] + dy * L[1] + pz * L[2];
      const day = Math.max(0, Math.min(1, (lam + 0.12) / 0.24));
      const shade = (0.04 + 0.96 * day) * (0.62 + 0.38 * pz);
      const v = Math.max(0, Math.min(0.999, 0.5 - lat / Math.PI));
      let u = lon / (Math.PI * 2) + spin;
      u -= Math.floor(u);
      const k = (((v * skin.h) | 0) * skin.w + ((u * skin.w) | 0)) * 3;
      let cr = skin.rgb[k];
      let cg = skin.rgb[k + 1];
      let cb = skin.rgb[k + 2];
      if (deck) {
        let cu = lon / (Math.PI * 2) + cloudSpin;
        cu -= Math.floor(cu);
        const dk = (((v * deck.h) | 0) * deck.w + ((cu * deck.w) | 0)) * 4;
        const a = deck.rgba[dk + 3] / 255;
        cr += (deck.rgba[dk] - cr) * a;
        cg += (deck.rgba[dk + 1] - cg) * a;
        cb += (deck.rgba[dk + 2] - cb) * a;
      }
      const x = ox + px;
      const y = oy + py;
      if (x < 0 || y < 0 || x >= surf.width || y >= surf.height) continue;
      const i = (y * surf.width + x) * 4;
      surf.data[i] = cr * shade;
      surf.data[i + 1] = cg * shade;
      surf.data[i + 2] = cb * shade;
      surf.data[i + 3] = 255;
    }
  }
}

/** Saturn's rings, flat-shaded, so the band table can be judged too. */
function drawRings(surf, ox, oy, d) {
  const ob = OBLIQUITY.saturn * DEG;
  const pitch = CAM_PITCH * DEG;
  const nx = Math.sin(ob);
  const ny = -Math.cos(ob) * Math.cos(pitch);
  const nz = Math.cos(ob) * Math.sin(pitch);
  const r = d / 2;
  const outer = SATURN_RINGS[SATURN_RINGS.length - 1].to;
  const span = Math.ceil(r * outer);
  for (let py = -span; py < span; py++) {
    for (let px = -span; px < span; px++) {
      const dx = px / r;
      const dy = py / r;
      if (Math.abs(nz) < 1e-3) continue;
      const z = -(nx * dx + ny * dy) / nz;
      const rad = Math.hypot(dx, dy, z);
      const band = SATURN_RINGS.find((b) => rad >= b.from && rad < b.to);
      if (!band) continue;
      // Behind the sphere? Skip — the front half is drawn after the globe.
      const q = dx * dx + dy * dy;
      if (q < 1 && z < Math.sqrt(1 - q)) continue;
      const x = ox + r + px;
      const y = oy + r + py;
      if (x < 0 || y < 0 || x >= surf.width || y >= surf.height) continue;
      const i = (y * surf.width + x) * 4;
      const c = 210 * band.tint;
      const a = band.alpha;
      surf.data[i] += (c - surf.data[i]) * a;
      surf.data[i + 1] += (c * 0.96 - surf.data[i + 1]) * a;
      surf.data[i + 2] += (c * 0.84 - surf.data[i + 2]) * a;
      surf.data[i + 3] = 255;
    }
  }
}

for (const kind of kinds) {
  const t0 = Date.now();
  const skin = surfaceSkin(kind);
  const deck = cloudSkin(kind);
  const ms = Date.now() - t0;

  await writePng(
    mapSheet(skin, undefined),
    path.join(outDir, `${kind}-map.png`),
  );
  if (deck) {
    await writePng(
      mapSheet(skin, deck),
      path.join(outDir, `${kind}-map-clouds.png`),
    );
  }

  // Four rotations, at the size the phone draws plus a big one to judge detail.
  const sizes = [156, 156, 156, 156];
  const pad = 16;
  const sheet = createSurface(
    pad + sizes.reduce((a, s) => a + s + pad, 0),
    156 + pad * 2,
  );
  fill(sheet, [18, 20, 26, 255]);
  let x = pad;
  for (let i = 0; i < sizes.length; i++) {
    const spin = i / sizes.length;
    if (kind === "saturn") drawRings(sheet, x, pad, sizes[i]);
    drawGlobe(sheet, x, pad, sizes[i], skin, deck, kind, spin, spin * 1.25);
    if (kind === "saturn") drawRings(sheet, x, pad, sizes[i]);
    x += sizes[i] + pad;
  }
  await writePng(sheet, path.join(outDir, `${kind}-globe.png`));
  console.log(
    `${kind.padEnd(9)} ${String(skin.w).padStart(4)}×${skin.h}  bake ${ms} ms${deck ? "  + clouds" : ""}`,
  );
}

console.log(`\nwrote ${kinds.length * 2} sheets to ${outDir}`);
