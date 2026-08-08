#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Correctness check for the main-menu solar system (see src/game/title-sky.ts).
// It asserts the ONE law the whole effect has to obey — a body is lit from the
// sun's side — at two levels, because each catches what the other cannot:
//
//   PASS 1 — THE GEOMETRY, for every body at every sampled moment, in both
//     orientations. The driver publishes the exact 3D light vector it handed
//     the globe shader (window.__skyState.bodies[…].lx/ly/lz); projected to the
//     screen it must point AT the sun, to within a degree. This is cheap,
//     exact, and covers all nine worlds rather than just the one that is easy
//     to photograph.
//
//   PASS 2 — THE RENDERING, for the Moon: screenshot it and measure that the
//     sunward half of the disc is genuinely brighter than the anti-sunward
//     half. Pass 1 proves the driver computed the right vector; only pass 2
//     proves the shader USED it. (A shader that ignored the light entirely
//     would sail through pass 1.)
//
// The moments for pass 2 are CHOSEN BY MEASUREMENT, not hard-coded: the script
// scans for frames where the Moon shows a legible terminator (a clear crescent
// through gibbous) and asserts on those. Hard-coded sample points rot the
// moment the orbits change, and silently — they keep passing on frames that no
// longer mean anything.
//
// Usage (from pwa/, dev server on :5199, playwright installed --no-save):
//   node scripts/verify-sky.mjs [--url http://localhost:5199] [--shots]
/* global window, document, Image, requestAnimationFrame */

import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const url = opt("url", "http://localhost:5199");
const saveShots = args.includes("--shots");

const shotDir = fileURLToPath(
  new URL("../assets-preview/sky", import.meta.url),
);
mkdirSync(shotDir, { recursive: true });

/** Pass 1: how far the light may stray from the body→sun screen direction. */
const MAX_LIGHT_DEG = 1;

/** Pass 2: the sunward half must beat the anti-sunward half by at least this
 * luminance asymmetry. A correctly lit crescent scores far higher (~0.4–0.9);
 * a terminator pointing the wrong way scores ≤ 0. */
const MIN_CONTRAST = 0.15;

/** Pass 2 only asserts where there is a terminator to read: a near-full or
 * near-new disc has no boundary and the measure is just noise. */
const CLEAR_MIN = 0.25;
const CLEAR_MAX = 0.75;
/** How many legible frames to insist on finding and checking. */
const WANT_FRAMES = 6;

/** Pins swept for both passes — a fine, even walk of the master cycle. */
const PINS = Array.from({ length: 40 }, (_, i) => Number((i / 40).toFixed(3)));

const VIEWPORTS = [
  { name: "landscape", width: 844, height: 390 },
  { name: "portrait", width: 390, height: 844 },
];

// Runs in the browser: split the moon disc along the terminator (the line
// perpendicular to the moon→sun direction) and compare the MEAN luminance of
// the sunward half against the anti-sunward half. Averaging over a whole half
// washes out the globe's rotating surface texture (maria, ray craters) that
// wrecks a pixel-centroid on a small disc, so what remains is the lighting.
// `contrast` ∈ [−1, 1] is that asymmetry (≈1 a clean crescent facing the sun,
// ≈0 no directional lighting, <0 lit the WRONG way).
const analyze = ({ b64, sunAng }) =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const g = canvas.getContext("2d");
      g.drawImage(img, 0, 0);
      const data = g.getImageData(0, 0, w, h).data;
      const cx = w / 2;
      const cy = h / 2;
      const r = Math.min(w, h) / 2 - 1;
      const ca = Math.cos(sunAng);
      const sa = Math.sin(sunAng);
      let sunSum = 0;
      let sunN = 0;
      let antiSum = 0;
      let antiN = 0;
      let bx = 0;
      let by = 0;
      let bw = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const px = x - cx;
          const py = y - cy;
          if (px * px + py * py > r * r) continue;
          const i = (y * w + x) * 4;
          const lum =
            0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          // Signed distance along the sun direction: ≥0 is the sunward half.
          if (px * ca + py * sa >= 0) {
            sunSum += lum;
            sunN++;
          } else {
            antiSum += lum;
            antiN++;
          }
          bx += lum * px;
          by += lum * py;
          bw += lum;
        }
      }
      const meanSun = sunN > 0 ? sunSum / sunN : 0;
      const meanAnti = antiN > 0 ? antiSum / antiN : 0;
      resolve({
        contrast: (meanSun - meanAnti) / (meanSun + meanAnti + 1),
        dx: bw > 0 ? bx / bw : 0,
        dy: bw > 0 ? by / bw : 0,
      });
    };
    img.src = `data:image/png;base64,${b64}`;
  });

const browser = await chromium.launch({
  executablePath:
    process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium",
});

let lightFailures = 0;
let renderFailures = 0;
let lightChecks = 0;
let worstLightDeg = 0;
const rows = [];

for (const vp of VIEWPORTS) {
  const page = await browser.newPage({
    viewport: { width: vp.width, height: vp.height },
  });
  // The orbiting solar system is the shipped title backdrop, so nothing needs
  // to be seeded — the app boots straight into it. ?skytest strips the menu
  // chrome so nothing overlaps the bodies.
  await page.goto(`${url}/?skytest`);
  await page.waitForFunction(() => !!window.__skyState);
  // Every body builds its globe on a later frame (the bakes are staggered), so
  // wait until they all have one.
  await page.waitForTimeout(1500);

  const settle = () =>
    page.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        ),
    );

  // ---- Pass 1: the light vector points at the sun, for every body. --------
  const legible = [];
  for (const p of PINS) {
    await page.evaluate((x) => {
      window.__skyFreeze = x;
    }, p);
    await settle();
    const state = await page.evaluate(() => window.__skyState);
    for (const [label, b] of Object.entries(state.bodies ?? {})) {
      const dx = state.sun.x - b.x;
      const dy = state.sun.y - b.y;
      const dl = Math.hypot(dx, dy);
      const ll = Math.hypot(b.lx, b.ly);
      // A body sitting exactly on the sun's screen position has no direction
      // to check — it is at conjunction, and the light is along the view axis.
      if (dl < 1 || ll < 1e-3) continue;
      lightChecks++;
      const cos = (dx * b.lx + dy * b.ly) / (dl * ll);
      const deg = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
      if (deg > worstLightDeg) worstLightDeg = deg;
      if (deg > MAX_LIGHT_DEG) {
        lightFailures++;
        console.log(
          `  light FAIL ${vp.name} p=${p} body=${label}: ${deg.toFixed(2)}° off`,
        );
      }
    }
    // Note the frames where the Moon shows a readable terminator, for pass 2.
    // It must also be WHOLLY inside the viewport: an element screenshot of a
    // body hanging off the edge returns only the visible strip, and the
    // analysis assumes a disc centred in its image — a clipped Moon scores a
    // flat 0 and looks exactly like a lighting bug.
    const m = state.bodies?.M;
    if (m) {
      const box = await page.evaluate(() => {
        const el = document.querySelector(".title-moon");
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      });
      const inFrame =
        box &&
        box.w > 8 &&
        box.x >= 0 &&
        box.y >= 0 &&
        box.x + box.w <= vp.width &&
        box.y + box.h <= vp.height;
      const lit = (1 + m.lz) / 2;
      if (inFrame && lit >= CLEAR_MIN && lit <= CLEAR_MAX) {
        legible.push({ p, lit });
      }
    }
  }

  // ---- Pass 2: the shader actually used it. -------------------------------
  // Spread the chosen frames across the cycle rather than taking the first few.
  const step = Math.max(1, Math.floor(legible.length / WANT_FRAMES));
  const chosen = legible.filter((_, i) => i % step === 0).slice(0, WANT_FRAMES);
  for (const sample of chosen) {
    await page.evaluate((x) => {
      window.__skyFreeze = x;
    }, sample.p);
    await settle();
    const state = await page.evaluate(() => window.__skyState);
    const sunAng = Math.atan2(
      state.sun.y - state.moon.y,
      state.sun.x - state.moon.x,
    );

    // Isolate the Moon: on their real orbits the bodies can ride over each
    // other, the glare or the menu text, and an element screenshot composites
    // whatever overlaps its box — which would corrupt the measurement. Hide
    // every sibling for the shot, and undo the driver's phase DIMMING so the
    // measurement reads the shading rather than the opacity.
    await page.evaluate(() => {
      const s = document.createElement("style");
      s.id = "sky-solo-moon";
      s.textContent =
        ".title-screen > *:not(.title-moon){visibility:hidden !important;}" +
        ".title-moon{opacity:1 !important;}";
      document.head.appendChild(s);
    });
    const moonEl = await page.$(".title-moon");
    const buf = await moonEl.screenshot();
    await page.evaluate(() =>
      document.getElementById("sky-solo-moon")?.remove(),
    );
    const measured = await page.evaluate(analyze, {
      b64: buf.toString("base64"),
      sunAng,
    });

    if (saveShots) {
      await page.screenshot({
        path: `${shotDir}/${vp.name}-p${String(Math.round(sample.p * 1000)).padStart(4, "0")}.png`,
      });
    }

    const ok = measured.contrast >= MIN_CONTRAST;
    if (!ok) renderFailures++;
    const litAng = Math.atan2(measured.dy, measured.dx);
    let d = ((litAng - sunAng) * 180) / Math.PI;
    d = ((((d + 180) % 360) + 360) % 360) - 180;

    rows.push({
      view: vp.name,
      p: sample.p,
      lit: Number(sample.lit.toFixed(2)),
      sunDeg: Math.round((sunAng * 180) / Math.PI),
      contrast: Number(measured.contrast.toFixed(2)),
      errDeg: Number(Math.abs(d).toFixed(1)),
      ok,
    });
  }
  await page.close();
}

await browser.close();

// Report.
const pad = (s, n) => String(s).padEnd(n);
console.log(
  `\nPASS 1 — light direction, every body: ${lightChecks - lightFailures}/${lightChecks} within ${MAX_LIGHT_DEG}° (worst ${worstLightDeg.toFixed(2)}°)\n`,
);
console.log(
  `PASS 2 — the Moon, rendered:\n${pad("view", 11)}${pad("p", 8)}${pad("lit", 7)}${pad("sunDeg", 9)}${pad("contrast", 10)}${pad("errDeg", 9)}check`,
);
for (const r of rows) {
  console.log(
    pad(r.view, 11) +
      pad(r.p, 8) +
      pad(r.lit, 7) +
      pad(`${r.sunDeg}°`, 9) +
      pad(r.contrast, 10) +
      pad(`${r.errDeg}°`, 9) +
      (r.ok ? "PASS" : "FAIL"),
  );
}
console.log(
  `\n${rows.length - renderFailures}/${rows.length} rendered frames lit from the sunward side (min contrast ${MIN_CONTRAST}).`,
);
process.exit(lightFailures > 0 || renderFailures > 0 ? 1 : 0);
