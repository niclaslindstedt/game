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
//     [--only iphone|ipad|steam] [--shot nuke,boss] [--layout framed|bleed]
//     [--no-captions] [--safe]
//
// `--safe` captures the SAME recipes with the game's mature-content gate shut —
// the switch a guardian throws in iOS Settings, thrown by the harness (see
// SAFE_POLICY in store-shots/recipes.mjs). Use it for a storefront, a rating
// board or a press kit that will not take blood. It is a whole-set property
// rather than a per-frame one: the output directory carries the mode it was
// shot in, and a run in the other mode clears it rather than half-replacing it,
// because a listing with four bloody frames and two clean ones is the one
// outcome nobody asked for.
//
// The Apple rasters land in native/store/screenshots/; the Steam one writes to
// electron/store/screenshots/ instead, because the staging step ships whatever
// it finds under native/store/screenshots to App Store Connect and a 16:9
// desktop frame is not a valid iPhone screenshot.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import sharp from "sharp";

import { compose } from "./store-shots/compose.mjs";
import {
  DEVICES,
  SHOTS,
  assertRasters,
  prepareContext,
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
// A device may prefer its own layout (Steam shoots full-bleed); an explicit
// --layout still wins, so the flag stays the override it reads as.
const layoutFlag = opt("layout", null);
const captions = !has("no-captions");
const safe = has("safe");
const mode = safe ? "safe" : "full";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const outDirFor = (device) =>
  path.join(repoRoot, device.out ?? "native/store/screenshots", device.name);

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

/** The content mode a directory's frames were shot in, or null for an empty or
 * never-captured one. Written beside the PNGs, and not a PNG itself, so the
 * staging step never mistakes it for a screenshot. */
const MODE_FILE = ".content-mode";
const modeOf = (dir) => {
  try {
    return readFileSync(path.join(dir, MODE_FILE), "utf8").trim();
  } catch {
    return null;
  }
};

for (const device of devices) {
  const dir = outDirFor(device);
  const layout = layoutFlag ?? device.layout ?? "framed";
  // A FULL run owns the directory: wipe it first, or a renamed or retired
  // recipe leaves its old frame sitting there and the staging step happily
  // ships it to App Store Connect alongside the current set. A `--shot` run is
  // iterating on one frame, so it must leave the others alone — UNLESS the
  // content mode changed under it, because half a safe set is not a safe set.
  const previous = modeOf(dir);
  const stale = previous !== null && previous !== mode;
  if (!onlyShots || stale) rmSync(dir, { recursive: true, force: true });
  if (stale && onlyShots) {
    console.log(`  (cleared a ${previous} set — this run is ${mode})`);
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, MODE_FILE), `${mode}\n`);
  console.log(
    `\n${device.label} → ${device.raster.width}×${device.raster.height}` +
      (safe ? "  [safe: mature content off]" : ""),
  );

  const context = await browser.newContext({
    viewport: device.css,
    deviceScaleFactor: device.scale,
    hasTouch: device.touch ?? true,
    reducedMotion: "no-preference",
  });
  await prepareContext(context, { safe });

  for (const [index, shot] of shots.entries()) {
    const n = String(index + 1).padStart(2, "0");
    const file = `${dir}/${n}-${shot.id}.png`;
    const page = await context.newPage();
    page.on("pageerror", (e) => console.error(`  PAGE ERROR: ${e.message}`));

    try {
      await stageRun(page, shot, url);

      // Time the shutter off the trigger, exactly as the sweep did when this
      // delay was chosen — otherwise the shipped frame isn't the frame that
      // was picked. The clock starts when the trigger RETURNS, so a trigger
      // that WAITS for something the recipe staged (the boss's windup, the
      // boss falling) can take as long as it needs without spending the delay
      // it is supposed to be measured from.
      if (shot.trigger) await shot.trigger(page);
      await page.waitForTimeout(shot.captureAtMs);

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
  `\nstore-shots [${mode}]: ${captured} captured, ${failed} failed → ` +
    [...new Set(devices.map((d) => d.out ?? "native/store/screenshots"))].join(
      ", ",
    ),
);
if (failed) process.exitCode = 1;
