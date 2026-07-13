#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Screenshot-based correctness check for the main-menu solar-system Easter egg
// (see src/game/titleSky.ts). For a set of frozen progress values (each pinning
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
// Usage (from website/, dev server on :5199, playwright installed --no-save):
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
// call it wrong. Generous enough to absorb the moon face's own bright spot and
// pixel noise, tight enough to catch a terminator pointing the wrong way.
const MAX_ANGLE_ERR = 22;

// Progress values worth asserting: each pins the Moon to a different spot on
// its orbit around the Earth, so the sun sits at a varied azimuth relative to
// the Moon. The disc is always half-lit, so every frame leaves a clear
// terminator to read a direction from.
const SAMPLES = [
  { p: 0.1, note: "moon leading the earth" },
  { p: 0.2, note: "moon above the earth" },
  { p: 0.4, note: "moon trailing, sun to the lower right" },
  { p: 0.45, note: "moon trailing the earth" },
  { p: 0.5, note: "moon below the earth" },
  { p: 0.85, note: "moon leading, sun to the left" },
  { p: 0.9, note: "moon above-left of the earth" },
  { p: 0.94, note: "moon crossing toward the sun" },
];

// Only assert direction where the lit fraction leaves a clear terminator (the
// half-lit disc always does; the guard stays for robustness).
const CLEAR_MIN = 0.12;
const CLEAR_MAX = 0.88;

const VIEWPORTS = [
  { name: "landscape", width: 844, height: 390 },
  { name: "portrait", width: 390, height: 844 },
];

// Runs in the browser: measure the lit-pixel centroid of the moon screenshot.
const analyze = (b64) =>
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
      // Two centroids: the lit side and the shadowed side, each intensity
      // weighted. The vector from the shadow centroid to the lit centroid
      // points straight at the sun and stays strong at any phase — the moon
      // face's own texture biases both centroids alike and largely cancels.
      const THRESHOLD = 105;
      let lx = 0;
      let ly = 0;
      let lw = 0;
      let dxs = 0;
      let dys = 0;
      let dw = 0;
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
          if (lum >= THRESHOLD) {
            lit++;
            const wgt = lum - THRESHOLD + 1;
            lx += wgt * x;
            ly += wgt * y;
            lw += wgt;
          } else {
            const wgt = THRESHOLD - lum + 1;
            dxs += wgt * x;
            dys += wgt * y;
            dw += wgt;
          }
        }
      }
      if (lw <= 0 || dw <= 0) {
        resolve({ empty: true, litFrac: total > 0 ? lit / total : 0 });
        return;
      }
      resolve({
        dx: lx / lw - dxs / dw,
        dy: ly / lw - dys / dw,
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
  // The orbital look is a DEVELOPER feature flag (settings.ts `titleOrbits`),
  // off by default. Seed it on before the app boots so this harness verifies the
  // orbiting solar system, not the classic arcing-sun default.
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem(
        "gone-in-space:settings",
        JSON.stringify({ titleOrbits: "on" }),
      );
    } catch {
      /* private mode — the flag stays off, nothing to verify */
    }
  });
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
    const moonEl = await page.$(".title-moon");
    const buf = await moonEl.screenshot();
    const measured = await page.evaluate(analyze, buf.toString("base64"));

    if (saveShots) {
      await page.screenshot({
        path: `${shotDir}/${vp.name}-p${String(Math.round(sample.p * 100)).padStart(3, "0")}.png`,
      });
    }

    // Direction from the moon to the sun (page coords, y-down).
    const sunVX = state.sun.x - state.moon.x;
    const sunVY = state.sun.y - state.moon.y;
    const sunAng = Math.atan2(sunVY, sunVX);

    // Assert direction only where the terminator is legible (a clear
    // crescent/gibbous), not at near-full or near-new where it's pixel noise.
    const assert =
      !measured.empty &&
      measured.litFrac >= CLEAR_MIN &&
      measured.litFrac <= CLEAR_MAX;

    let err = null;
    let ok = true;
    if (assert) {
      const litAng = Math.atan2(measured.dy, measured.dx);
      let d = ((litAng - sunAng) * 180) / Math.PI;
      d = ((((d + 180) % 360) + 360) % 360) - 180;
      err = Math.abs(d);
      ok = err <= MAX_ANGLE_ERR;
    }
    if (!ok) failures++;

    rows.push({
      view: vp.name,
      p: sample.p,
      phase: Number(state.phase.toFixed(2)),
      sunUp: state.sunUp,
      litFrac: Number((measured.litFrac ?? 0).toFixed(2)),
      sunDeg: Math.round((sunAng * 180) / Math.PI),
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
      pad(r.errDeg == null ? "—" : `${r.errDeg}°`, 8) +
      pad(check, 7) +
      r.note,
  );
}

const asserted = rows.filter((r) => r.assert);
console.log(
  `\n${asserted.length - failures}/${asserted.length} directional checks passed (max allowed error ${MAX_ANGLE_ERR}°).`,
);
process.exit(failures > 0 ? 1 : 0);
