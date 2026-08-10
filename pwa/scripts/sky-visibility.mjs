#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHICH WORLDS ARE ACTUALLY ON SCREEN, and for how much of the time.
//
// The sky is drawn at true distances (`ORBIT_AU`), so most of the solar system
// is outside the viewport at any one moment and the OUTER four are outside it
// almost always. That is by design — see CAM_AU in `title-sky.ts` — but "almost
// always" is a number, and until this script existed nobody had it. The two
// constants that decide it (`ECLIPTIC_PITCH` and `EPOCH_MS`) were therefore
// being tuned against a guess and a couple of screenshots.
//
// THE GEOMETRY IT IS MEASURING, in one paragraph. A superior world is only ever
// seen near CONJUNCTION — the far half of its orbit, because the near half is
// behind the viewer — and at conjunction it sits `r·sin(pitch)` above the sun
// on screen. The sun's seat leaves `SUN_Y` of the short side above it, and in
// LANDSCAPE the short side IS the height, so that is the entire allowance. A
// world whose conjunction wants more than the allowance is not cropped, it is
// RETIRED: there is no moment in its orbit when any of it is in frame. This
// script reports both halves — the geometric verdict (can it ever be seen?) and
// the measured one (how much of the opening window is it actually up for?).
//
// Usage (from pwa/, dev server on :5199):
//   node scripts/sky-visibility.mjs [--url http://localhost:5199] [--steps 240]
/* global window, document, getComputedStyle, requestAnimationFrame */

import { chromium } from "playwright";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const url = opt("url", "http://localhost:5199");
const steps = Number(opt("steps", 240));

/** The bodies, by the label the driver publishes them under. */
const BODIES = [
  ["1", "Mercury", ".title-mercury"],
  ["2", "Venus", ".title-venus"],
  ["3", "Earth", ".title-earth"],
  ["4", "Mars", ".title-mars"],
  ["5", "Jupiter", ".title-jupiter"],
  ["6", "Saturn", ".title-saturn"],
  ["7", "Uranus", ".title-uranus"],
  ["8", "Neptune", ".title-neptune"],
];

const VIEWPORTS = [
  { name: "landscape", width: 844, height: 390 },
  { name: "portrait", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
];

const browser = await chromium.launch({
  executablePath:
    process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium",
});

const pad = (s, n) => String(s).padEnd(n);
const report = {};

for (const vp of VIEWPORTS) {
  const page = await browser.newPage({
    viewport: { width: vp.width, height: vp.height },
  });
  await page.goto(`${url}/?skytest`);
  await page.waitForFunction(() => !!window.__skyState);
  await page.waitForTimeout(1200);

  const seen = Object.fromEntries(BODIES.map(([, name]) => [name, 0]));
  const widest = Object.fromEntries(BODIES.map(([, name]) => [name, 0]));

  for (let i = 0; i < steps; i++) {
    await page.evaluate((x) => {
      window.__skyFreeze = x;
      window.__skyZoom?.(1);
    }, i / steps);
    await page.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        ),
    );
    const frame = await page.evaluate((list) => {
      const out = {};
      for (const [, name, sel] of list) {
        const el = document.querySelector(sel);
        if (!el) continue;
        const cs = getComputedStyle(el);
        if (cs.display === "none" || Number(cs.opacity) < 0.02) continue;
        const r = el.getBoundingClientRect();
        // HOW MUCH OF IT IS IN THE VIEWPORT, not whether any of it is. The
        // difference is the whole point of this script: Saturn's box is 629 px
        // across on a desktop and its top edge sits 575 px ABOVE the frame, so
        // "any part in frame" scored it 43% while what a player saw was a
        // sliver of its outer ring creeping along the top edge. A body is only
        // WORTH counting when most of it is actually there.
        const vis =
          Math.max(
            0,
            Math.min(r.right, window.innerWidth) - Math.max(r.left, 0),
          ) *
          Math.max(
            0,
            Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0),
          );
        const frac = vis / Math.max(1, r.width * r.height);
        if (frac > 0.6) out[name] = r.width;
      }
      return out;
    }, BODIES);
    for (const [name, w] of Object.entries(frame)) {
      seen[name] += 1;
      if (w > widest[name]) widest[name] = w;
    }
  }

  report[vp.name] = { seen, widest };
  await page.close();
}

await browser.close();

console.log(
  `\nHow much of the opening window each world is on screen for (${steps} samples of the master cycle):\n`,
);
console.log(
  pad("world", 10) + VIEWPORTS.map((v) => pad(v.name, 22)).join("") + "verdict",
);
for (const [, name] of BODIES) {
  let row = pad(name, 10);
  let everSeen = false;
  for (const vp of VIEWPORTS) {
    const { seen, widest } = report[vp.name];
    const pct = (seen[name] / steps) * 100;
    if (seen[name] > 0) everSeen = true;
    row += pad(
      `${pct.toFixed(0).padStart(3)}%  (max ${widest[name].toFixed(0)}px)`,
      22,
    );
  }
  console.log(row + (everSeen ? "" : "NEVER IN FRAME"));
}
console.log(
  "\nA world at 0% is RETIRED rather than rare: its conjunction sits higher\n" +
    "above the sun than SUN_Y leaves room for, so no moment of its orbit is in\n" +
    "frame. That is ECLIPTIC_PITCH's budget — see the note on it in title-sky.ts.\n",
);
