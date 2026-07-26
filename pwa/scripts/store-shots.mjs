#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// App Store / Play Store screenshot harness. Drives the REAL game to each
// recipe in `store-shots/recipes.mjs`, captures it at that recipe's chosen
// `captureAtMs`, and composites a caption in the game's own pixel font —
// writing an upload-ready set into native/store/screenshots/.
//
// This script does NOT decide WHEN to shoot. That is the sweep's job
// (`store-shot-sweep.mjs`): it samples a matrix of delays over one staged run,
// contact-sheets them, and you pick the winner by eye and write it into the
// recipe. This one just reproduces the chosen frame. See the `store-shots`
// skill for the loop.
//
// Three things make the output trustworthy rather than a lucky screen-grab:
//
//  1. EXACT RASTERS, NOT RESIZES. Each device shoots at its real CSS viewport
//     with the real deviceScaleFactor, so 956×440 @3× IS 2868×1320 — the pixel
//     art is captured at device resolution instead of being scaled up to it.
//     Apple rejects a set whose dimensions are even one pixel off, and the
//     script asserts the final PNG.
//
//  2. STAGED, NOT PLAYED. Every shot is a `?scenario=` spec (the engine's own
//     display-case system — see the `test-scenario` skill) pinned to a `?seed=`.
//     Re-running reproduces the same frames, so a caption tweak doesn't mean
//     re-hunting for the moment.
//
//  3. THE CAPTION IS THE GAME'S OWN FONT, drawn from the same `GLYPHS` map the
//     in-game text renders from. A caption using a character the font lacks
//     FAILS loudly instead of rendering "?".
//
// Usage:
//   npm install --no-save playwright && npx playwright install chromium
//   cd pwa && npx vite --port 5199 &
//   node pwa/scripts/store-shots.mjs [--url http://localhost:5199]
//     [--only iphone|ipad] [--shot nuke,boss] [--layout framed|bleed]
//     [--no-captions]

// `window` below only appears inside page.evaluate / addInitScript callbacks,
// which execute in the browser page, not in Node.
/* global window */

import { mkdirSync, rmSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import sharp from "sharp";

import { compose } from "./store-shots/compose.mjs";
import {
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
const onlyDevice = opt("only", null);
const onlyShots = opt("shot", null)?.split(",");
const layout = opt("layout", "framed");
const captions = !has("no-captions");

const OUT = fileURLToPath(
  new URL("../../native/store/screenshots", import.meta.url),
);

const devices = DEVICES.filter(
  (d) => !onlyDevice || onlyDevice.split(",").includes(d.name.split("-")[0]),
);
assertRasters(devices);

const shots = SHOTS.filter((s) => !onlyShots || onlyShots.includes(s.id));

const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM }
    : {}),
});

let captured = 0;
let failed = 0;

for (const device of devices) {
  const dir = `${OUT}/${device.name}`;
  // A FULL run owns the directory: wipe it first, or a renamed or retired
  // recipe leaves its old frame sitting there and the staging step happily
  // ships it to App Store Connect alongside the current set. A `--shot` run is
  // iterating on one frame, so it must leave the others alone.
  if (!onlyShots) rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  console.log(
    `\n${device.label} → ${device.raster.width}×${device.raster.height}`,
  );

  const context = await browser.newContext({
    viewport: device.css,
    deviceScaleFactor: device.scale,
    hasTouch: true,
    reducedMotion: "no-preference",
  });
  // Mute audio and pre-unlock the developer menu (normally seven taps on the
  // title sun) — the recipes reach NIGHTMARE and the late maps through the
  // developer warp, since both are unlock-gated for a fresh hero.
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

  for (const [index, shot] of shots.entries()) {
    const n = String(index + 1).padStart(2, "0");
    const file = `${dir}/${n}-${shot.id}.png`;
    const page = await context.newPage();
    page.on("pageerror", (e) => console.error(`  PAGE ERROR: ${e.message}`));

    try {
      await stageRun(page, shot, url);

      // Time the shutter off the trigger, exactly as the sweep did when this
      // delay was chosen — otherwise the shipped frame isn't the frame that
      // was picked.
      const t0 = Date.now();
      if (shot.trigger) await shot.trigger(page);
      const wait = shot.captureAtMs - (Date.now() - t0);
      if (wait > 0) await page.waitForTimeout(wait);

      const raw = await page.screenshot();
      const framed = await compose(
        raw,
        device,
        captions ? shot.caption : null,
        layout,
      );
      await sharp(framed).toFile(file);

      const meta = await sharp(file).metadata();
      if (
        meta.width !== device.raster.width ||
        meta.height !== device.raster.height
      ) {
        throw new Error(
          `wrong raster ${meta.width}×${meta.height}, expected ` +
            `${device.raster.width}×${device.raster.height}`,
        );
      }
      console.log(
        `  ✓ ${n}-${shot.id}.png  @${shot.captureAtMs}ms  "${shot.caption}"`,
      );
      captured += 1;
    } catch (e) {
      console.error(`  ✗ ${n}-${shot.id}: ${e.message}`);
      failed += 1;
    } finally {
      await page.close();
    }
  }
  await context.close();
}

await browser.close();

console.log(
  `\nstore-shots: ${captured} captured, ${failed} failed → native/store/screenshots/`,
);
if (failed) process.exitCode = 1;
