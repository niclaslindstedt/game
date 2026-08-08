// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The app icon, in the one format Tauri insists on.
//
// **Tauri refuses a paletted PNG at COMPILE time**, inside `generate_context!`,
// with `icon … is not RGBA` — and every icon the website ships is paletted,
// because that is what a 64×64 icon should be everywhere else. electron-builder
// takes them as they are, which is why `electron/` can point straight at
// `pwa/public/` and this tree cannot.
//
// So the icons are RE-ENCODED rather than re-drawn: one source raster, the same
// one the desktop shell and the manifest already use, widened to 8-bit RGBA at
// the sizes Tauri's bundler wants. Nothing here is a design decision — the art
// is `pwa/public/`, and a change to the icon happens there and lands here on
// the next build (OSS_SPEC §11.2: this output is generated and gitignored).
//
// Usage:
//   node scripts/icons.mjs            # write tauri/src-tauri/icons/
//   node scripts/icons.mjs --check    # fail if they are missing or stale

import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_DIR = resolve(APP_DIR, "..");

/** The one raster everything else is derived from — the same file
 * `electron-builder.config.cjs` names as the desktop icon. */
const SOURCE = join(REPO_DIR, "pwa/public/maskable-icon-512x512.png");
const OUT_DIR = join(APP_DIR, "src-tauri/icons");

/** The sizes `tauri.conf.json` lists, and nothing beyond them: an icon nobody
 * reads is a file that goes stale without anyone noticing. */
const SIZES = [32, 128, 256, 512];

const check = process.argv.includes("--check");

function outputs() {
  return SIZES.map((size) => ({
    size,
    path: join(OUT_DIR, `${size}x${size}.png`),
  }));
}

function newerThanSource(path) {
  try {
    return statSync(path).mtimeMs >= statSync(SOURCE).mtimeMs;
  } catch {
    return false;
  }
}

if (check) {
  const stale = outputs().filter(({ path }) => !newerThanSource(path));
  if (stale.length) {
    console.error(
      `✗ ${stale.length} icon(s) missing or older than ${SOURCE}. Run ` +
        `\`npm run icons --prefix tauri\`.`,
    );
    process.exit(1);
  }
  console.log(`✓ ${SIZES.length} icons are current`);
} else {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const { size, path } of outputs()) {
    const png = await sharp(SOURCE)
      .resize(size, size, { fit: "cover", kernel: "nearest" })
      // `ensureAlpha` plus `palette: false` is the whole point of this script:
      // together they are what makes the output 8-bit-per-channel RGBA rather
      // than an indexed image with a transparency chunk.
      .ensureAlpha()
      .png({ palette: false, compressionLevel: 9 })
      .toBuffer();
    writeFileSync(path, png);
  }
  console.log(`✓ ${SIZES.length} icons → ${OUT_DIR}`);
}
