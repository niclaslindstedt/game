#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Screenshot-based correctness check for the main-menu solar-system Easter egg
// (see src/game/title-sky.ts). For a set of frozen progress values (each pinning
// the Moon to a different point on its orbit around the Earth), in both
// landscape and portrait, it:
//
//   1. pins the orbits to a fixed progress (window.__skyFreeze),
//   2. reads the sun and moon centres back (window.__skyState),
//   3. screenshots the moon element and measures the luminance-weighted
//      centroid of its *lit* pixels in the browser (a canvas, no image deps),
//   4. checks that the lit limb actually points at the sun — i.e. the angle
//      between (litCentroid − moonCentre) and (sun − moonCentre) is small.
//
// This is the geometric law the effect must obey ("a body is lit from the
// sun's side") and it must hold at every orbital position and orientation.
// Prints a table and exits non-zero if any directional frame is off.
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

// Angle (deg) the lit limb may stray from the moon→sun direction before we
// The sunward half must beat the anti-sunward half by at least this luminance
// asymmetry (see `contrast` in analyze). A correctly lit clear phase scores far
// higher (~0.4–0.9); a terminator pointing the wrong way scores ≤0. Low enough
// to pass a modest crescent, high enough that "no directional lighting" fails.
const MIN_CONTRAST = 0.15;

// Progress values worth asserting: each pins the Moon to a different spot on its
// orbit around the Earth, so the sun sits at a varied azimuth relative to the
// Moon. The Moon now waxes and wanes with its depth (see litFractionFor in
// title-sky.ts), so a frame's lit fraction varies; the CLEAR guard below skips
// the near-new/near-full frames where there is too little terminator to read a
// direction from. Each spot is chosen to ride clear of both the sun's glare and
// the Earth's disc (against the tilted-orbit geometry in title-sky.ts).
const SAMPLES = [
  { p: 0.09, note: "gibbous, clear of the sun" },
  { p: 0.23, note: "half, near side" },
  { p: 0.35, note: "half, near side, sun below" },
  { p: 0.37, note: "gibbous flank" },
  { p: 0.49, note: "gibbous flank" },
  { p: 0.64, note: "gibbous, near side" },
  { p: 0.76, note: "gibbous flank" },
  { p: 0.9, note: "gibbous, clear of the sun" },
];

// Only assert direction where the lit fraction leaves a clear terminator to
// read: a textured thin crescent (or near-full disc) has too little contrast
// boundary and the centroid measure gets noisy, so those frames are reported
// but not asserted.
const CLEAR_MIN = 0.2;
const CLEAR_MAX = 0.85;

const VIEWPORTS = [
  { name: "landscape", width: 844, height: 390 },
  { name: "portrait", width: 390, height: 844 },
];

// Runs in the browser: split the moon disc along the terminator (the line
// perpendicular to the moon→sun direction) and compare the MEAN luminance of
// the sunward half against the anti-sunward half. Averaging over a whole half
// washes out the globe's rotating surface texture (continents, maria) that
// wrecks a pixel-centroid on a small disc, so what remains is the lighting: the
// sunward half must be markedly brighter. `contrast` ∈ [−1, 1] is that
// asymmetry (≈1 a clean crescent facing the sun, ≈0 no directional lighting,
// <0 lit the WRONG way). A luminance centroid is also returned, for the
// human-readable angle in the report only.
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
      const LIT_THRESHOLD = 105;
      let sunSum = 0;
      let sunN = 0;
      let antiSum = 0;
      let antiN = 0;
      let bx = 0;
      let by = 0;
      let bw = 0;
      let lit = 0;
      let total = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const px = x - cx;
          const py = y - cy;
          if (px * px + py * py > r * r) continue;
          total++;
          const i = (y * w + x) * 4;
          const lum =
            0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          if (lum >= LIT_THRESHOLD) lit++;
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
        litFrac: total > 0 ? lit / total : 0,
      });
    };
    img.src = `data:image/png;base64,${b64}`;
  });

const browser = await chromium.launch({
  executablePath:
    process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium",
});

let failures = 0;
const rows = [];

for (const vp of VIEWPORTS) {
  const page = await browser.newPage({
    viewport: { width: vp.width, height: vp.height },
  });
  // The orbiting solar system is the shipped title backdrop, so nothing needs
  // to be seeded — the app boots straight into it.
  await page.goto(url);
  await page.getByRole("button", { name: "play", exact: true }).waitFor();

  for (const sample of SAMPLES) {
    await page.evaluate((p) => {
      window.__skyFreeze = p;
    }, sample.p);
    // Let a couple of rAF frames apply the frozen state.
    await page.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        ),
    );

    const state = await page.evaluate(() => window.__skyState);
    // Direction from the moon to the sun (page coords, y-down).
    const sunVX = state.sun.x - state.moon.x;
    const sunVY = state.sun.y - state.moon.y;
    const sunAng = Math.atan2(sunVY, sunVX);

    // Isolate the Moon: with the bodies on their real (differently-tilted)
    // orbits the Moon can ride over the Earth, the glare or the menu text, and
    // an element screenshot composites whatever overlaps its box — which would
    // corrupt the measurement. Hide every sibling for the shot, then restore.
    await page.evaluate(() => {
      const s = document.createElement("style");
      s.id = "sky-solo-moon";
      s.textContent =
        ".title-screen > *:not(.title-moon){visibility:hidden !important;}";
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
        path: `${shotDir}/${vp.name}-p${String(Math.round(sample.p * 100)).padStart(3, "0")}.png`,
      });
    }

    // Assert only where the terminator is legible (a clear crescent/gibbous),
    // not at near-full or near-new where either half is uniformly bright/dark.
    const assert =
      measured.litFrac >= CLEAR_MIN && measured.litFrac <= CLEAR_MAX;

    // The law: the sunward half is brighter than the anti-sunward half.
    const ok = !assert || measured.contrast >= MIN_CONTRAST;
    // Angle of the brightness centroid off the sun direction — reported only.
    let err = null;
    if (assert) {
      const litAng = Math.atan2(measured.dy, measured.dx);
      let d = ((litAng - sunAng) * 180) / Math.PI;
      d = ((((d + 180) % 360) + 360) % 360) - 180;
      err = Math.abs(d);
    }
    if (!ok) failures++;

    rows.push({
      view: vp.name,
      p: sample.p,
      phase: Number(state.phase.toFixed(2)),
      sunUp: state.sunUp,
      litFrac: Number((measured.litFrac ?? 0).toFixed(2)),
      sunDeg: Math.round((sunAng * 180) / Math.PI),
      contrast: Number((measured.contrast ?? 0).toFixed(2)),
      errDeg: err == null ? null : Number(err.toFixed(1)),
      assert,
      ok,
      note: sample.note,
    });
  }
  await page.close();
}

await browser.close();

// Report.
const pad = (s, n) => String(s).padEnd(n);
console.log(
  pad("view", 10) +
    pad("p", 6) +
    pad("phase", 7) +
    pad("sunUp", 7) +
    pad("litFrac", 9) +
    pad("sunDeg", 8) +
    pad("contrast", 10) +
    pad("errDeg", 8) +
    pad("check", 7) +
    "note",
);
for (const r of rows) {
  const check = !r.assert ? "-" : r.ok ? "PASS" : "FAIL";
  console.log(
    pad(r.view, 10) +
      pad(r.p, 6) +
      pad(r.phase, 7) +
      pad(r.sunUp ? "yes" : "no", 7) +
      pad(r.litFrac, 9) +
      pad(`${r.sunDeg}°`, 8) +
      pad(r.contrast, 10) +
      pad(r.errDeg == null ? "—" : `${r.errDeg}°`, 8) +
      pad(check, 7) +
      r.note,
  );
}

const asserted = rows.filter((r) => r.assert);
console.log(
  `\n${asserted.length - failures}/${asserted.length} directional checks passed (min sunward-half contrast ${MIN_CONTRAST}).`,
);
process.exit(failures > 0 ? 1 : 0);
