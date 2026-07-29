#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The store screenshot TIME MATRIX — the tool that finds the magnificent frame
// instead of guessing at it.
//
// A screenshot of a 200 ms explosion is luck. This stages a recipe ONCE, then
// samples the same live run at a schedule of delays, and composites every
// sample into one numbered contact sheet. You LOOK at the sheet, pick the frame
// that reads best, and re-run narrowly around it:
//
//   # 1. coarse: where in the first couple of seconds does this look good?
//   node pwa/scripts/store-shot-sweep.mjs --shot nuke
//
//   # 2. fine: nine frames in a tight window around the winner
//   node pwa/scripts/store-shot-sweep.mjs --shot nuke --around 260 --span 200
//
//   # 3. write the winning delay into `captureAtMs` in store-shots/recipes.mjs,
//   #    then `make store-shots` captures exactly that moment.
//
// Sheets land in pwa/assets-preview/store-sweep/<shot>/ — `sheet.png` is the
// one to open; the individual frames sit beside it.
//
// Sampling happens on ONE staged run, so the frames are a real timeline of a
// single detonation/fight rather than a dozen re-rolls of the scenario.
//
// Options:
//   --shot <id[,id]>   which recipes to sweep (default: all)
//   --around <ms>      centre of a fine sweep
//   --span <ms>        width of the fine sweep window (default 240)
//   --frames <n>       samples in a fine sweep (default 9)
//   --device <name>    device to sweep on (default iphone-6.9 — sweeping the
//                      iPad too doubles the time and the framing barely differs)
//   --raw              skip the caption band (judge the gameplay alone)
//   --url <url>        dev server (default http://localhost:5199)

// `window` below only appears inside page.evaluate / addInitScript callbacks,
// which execute in the browser page, not in Node.
/* global window */

import { mkdirSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import sharp from "sharp";

import { BRAND_BG, captionBand, compose } from "./store-shots/compose.mjs";
import {
  COARSE_MS,
  DEVICES,
  SETTINGS_KEY,
  SHOTS,
  assertRasters,
  stageRun,
} from "./store-shots/recipes.mjs";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);

const url = opt("url", "http://localhost:5199");
const onlyShots = opt("shot", null)?.split(",");
const around = opt("around", null);
const span = Number(opt("span", 240));
const frameCount = Number(opt("frames", 9));
const deviceName = opt("device", "iphone-6.9");
const raw = has("raw");

const device = DEVICES.find((d) => d.name === deviceName);
if (!device) {
  console.error(
    `store-shot-sweep: unknown device '${deviceName}' — have ${DEVICES.map((d) => d.name).join(", ")}`,
  );
  process.exit(2);
}
assertRasters([device]);

const shots = SHOTS.filter((s) => !onlyShots || onlyShots.includes(s.id));
if (shots.length === 0) {
  console.error(`store-shot-sweep: no recipe matched --shot ${onlyShots}`);
  process.exit(2);
}

const OUT = fileURLToPath(
  new URL("../assets-preview/store-sweep", import.meta.url),
);

/** The sample schedule for one recipe: a fine window if `--around` was given,
 * otherwise the recipe's own coarse schedule. */
function schedule(shot) {
  if (around !== null) {
    const centre = Number(around);
    const step = span / Math.max(1, frameCount - 1);
    return Array.from({ length: frameCount }, (_, i) =>
      Math.max(0, Math.round(centre - span / 2 + i * step)),
    );
  }
  return shot.sweepMs ?? COARSE_MS;
}

/**
 * Stack the samples into one contact sheet — a column of frames, each labelled
 * with its delay in the game's own pixel font, so picking a winner is reading a
 * number off the sheet. Downscaled: the sheet is for judging composition and
 * whether the effect is ON SCREEN, not for pixel-peeping.
 */
async function contactSheet(frames, shot, dir) {
  const width = 900;
  const scale = width / device.raster.width;
  const frameHeight = Math.round(device.raster.height * scale);
  const labelHeight = 44;
  const cellHeight = frameHeight + labelHeight;

  const composites = [];
  for (const [i, frame] of frames.entries()) {
    const img = await sharp(frame.buffer)
      .resize(width, frameHeight, { kernel: "nearest" })
      .toBuffer();
    const label = await captionBand(
      `${i + 1} - ${frame.atMs} MS`,
      width,
      labelHeight,
    );
    composites.push(
      { input: label, top: i * cellHeight, left: 0 },
      { input: img, top: i * cellHeight + labelHeight, left: 0 },
    );
  }

  await sharp({
    create: {
      width,
      height: cellHeight * frames.length,
      channels: 4,
      background: { r: BRAND_BG[0], g: BRAND_BG[1], b: BRAND_BG[2], alpha: 1 },
    },
  })
    .composite(composites)
    .png()
    .toFile(`${dir}/sheet.png`);
}

const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM }
    : {}),
});

const context = await browser.newContext({
  viewport: device.css,
  deviceScaleFactor: device.scale,
  // The device's own pointer type, not a blanket touch: the menu cursor is
  // pointer-type-dependent, so sweeping a desktop raster with touch on would
  // compose a frame the real capture never produces.
  hasTouch: device.touch ?? true,
  reducedMotion: "no-preference",
});
await context.addInitScript(
  ([key]) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        developerUnlocked: true,
        musicVolume: 0,
        sfxVolume: 0,
      }),
    );
  },
  [SETTINGS_KEY],
);

for (const shot of shots) {
  const times = schedule(shot);
  const dir = `${OUT}/${shot.id}`;
  mkdirSync(dir, { recursive: true });
  console.log(
    `\n${shot.id} — ${times.length} samples ` +
      `[${times[0]}..${times[times.length - 1]}ms] on ${device.name}`,
  );

  const page = await context.newPage();
  page.on("pageerror", (e) => console.error(`  PAGE ERROR: ${e.message}`));

  try {
    await stageRun(page, shot, url);

    // The clock starts at the trigger (or right after prepare, if there is
    // none), and every sample is timed off that one instant — so the sheet is a
    // real timeline of one event, not a dozen re-staged approximations.
    const t0 = Date.now();
    if (shot.trigger) await shot.trigger(page);

    const frames = [];
    for (const atMs of times) {
      const wait = atMs - (Date.now() - t0);
      if (wait > 0) await page.waitForTimeout(wait);
      const shotBuf = await page.screenshot();
      const buffer = raw
        ? shotBuf
        : await compose(shotBuf, device, shot.caption, device.layout);
      frames.push({ atMs, buffer });
      await sharp(buffer).toFile(
        `${dir}/${String(atMs).padStart(5, "0")}ms.png`,
      );
      process.stdout.write(`  ${atMs}ms`);
    }
    process.stdout.write("\n");

    await contactSheet(frames, shot, dir);
    console.log(
      `  sheet -> pwa/assets-preview/store-sweep/${shot.id}/sheet.png`,
    );
  } catch (e) {
    console.error(`  ✗ ${shot.id}: ${e.message}`);
    process.exitCode = 1;
  } finally {
    await page.close();
  }
}

await context.close();
await browser.close();

console.log(
  `\nstore-shot-sweep: LOOK at the sheets, pick the best frame, then either ` +
    `re-run with --around <ms> --span 200 to narrow, or write the winning ` +
    `delay into that recipe's \`captureAtMs\` in store-shots/recipes.mjs.`,
);
