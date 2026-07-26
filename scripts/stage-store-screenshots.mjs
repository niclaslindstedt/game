#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Stage the captured store screenshots into the layout `fastlane deliver`
// uploads from: native/store/screenshots/<device>/NN-<id>.png →
// native/fastlane/screenshots/<locale>/.
//
// Two things about deliver's conventions drive the naming:
//
//  1. DEVICE IS DETECTED FROM THE IMAGE RESOLUTION, not the folder or the
//     filename — so every device's shots live together in one locale folder.
//     That means the numeric prefixes would COLLIDE (two `01-nuke.png`), hence
//     the device prefix below.
//
//  2. ORDER IS FILENAME ORDER within a device family, and the order is the
//     store page's carousel order. The recipe index is already baked into the
//     `NN-` prefix by the capture script, so it just has to survive the copy.
//
// Run via `npm run store:stage` (which compiles the listing first), or:
//   node scripts/stage-store-screenshots.mjs [--locale en-US]

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

const args = process.argv.slice(2);
const localeIdx = args.indexOf("--locale");
const locale = localeIdx >= 0 ? args[localeIdx + 1] : "en-US";

const SRC = here("../native/store/screenshots");
const DEST = join(here("../native/fastlane/screenshots"), locale);

if (!existsSync(SRC)) {
  console.error(
    "stage-store-screenshots: native/store/screenshots is missing — run " +
      "`make store-shots` first (it is a gitignored build output).",
  );
  process.exit(1);
}

// Wipe rather than merge: a renamed or retired recipe would otherwise leave its
// old frame behind, and `overwrite_screenshots` would faithfully upload it.
rmSync(DEST, { recursive: true, force: true });
mkdirSync(DEST, { recursive: true });

let staged = 0;
const perDevice = {};

for (const device of readdirSync(SRC, { withFileTypes: true })) {
  if (!device.isDirectory()) continue;
  const files = readdirSync(join(SRC, device.name))
    .filter((f) => f.endsWith(".png"))
    .sort();
  for (const file of files) {
    // `iphone-6.9-01-nuke.png` — device first so a family's frames stay
    // contiguous, then the capture index so the carousel order is preserved.
    copyFileSync(
      join(SRC, device.name, file),
      join(DEST, `${device.name}-${file}`),
    );
    staged += 1;
  }
  perDevice[device.name] = files.length;
}

if (staged === 0) {
  console.error(
    "stage-store-screenshots: no PNGs found under native/store/screenshots — " +
      "run `make store-shots`.",
  );
  process.exit(1);
}

const summary = Object.entries(perDevice)
  .map(([d, n]) => `${d} ${n}`)
  .join(", ");
console.log(
  `stage-store-screenshots: staged ${staged} screenshot(s) (${summary}) ` +
    `→ native/fastlane/screenshots/${locale}/`,
);
