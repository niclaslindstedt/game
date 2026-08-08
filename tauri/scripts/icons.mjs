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

/** WINDOWS NEEDS AN `.ico`, AND NOTHING ELSE IN THIS TREE MAKES ONE.
 *
 * `tauri-build` embeds a Windows Resource file into the executable and looks
 * for `icons/icon.ico` to do it — on a Windows target it FAILS THE BUILD
 * without one ("required for generating a Windows Resource file"). The four
 * PNGs above do not satisfy it, so a fresh checkout could not build for Windows
 * at all; a machine that had once run `cargo tauri icon` happened to have one
 * lying in the gitignored output directory, which is exactly the shape of bug
 * that only ever fails on somebody else's computer.
 *
 * The sizes are Windows' own ladder: 16 and 32 are the ones actually drawn (the
 * title bar, the taskbar, Explorer's small views), 48 is the shell's medium
 * icon, and 256 is what a large-icon view scales from. */
const ICO_PATH = join(OUT_DIR, "icon.ico");
const ICO_SIZES = [16, 32, 48, 256];

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

/**
 * One icon directory entry, as a classic DIB (the BMP-in-ICO format).
 *
 * Bottom-up BGRA under a `BITMAPINFOHEADER` whose height is DOUBLED, because
 * the format still describes two stacked bitmaps — the colour one and a 1-bit
 * AND mask. The mask is all zeroes (every pixel opaque as far as it is
 * concerned) and the alpha channel does the real work, which is what every
 * 32-bit icon since Windows XP does. Its rows are still padded to four bytes,
 * and a parser that reads the header will read them.
 */
async function dibEntry(size) {
  const { data } = await sharp(SOURCE)
    .resize(size, size, { fit: "cover", kernel: "nearest" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0); // biSize
  header.writeInt32LE(size, 4); // biWidth
  header.writeInt32LE(size * 2, 8); // biHeight — colour + mask
  header.writeUInt16LE(1, 12); // biPlanes
  header.writeUInt16LE(32, 14); // biBitCount

  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    // Bottom-up: the last row of the image is the first row of the DIB.
    const from = (size - 1 - y) * size * 4;
    for (let x = 0; x < size; x += 1) {
      const at = from + x * 4;
      const to = (y * size + x) * 4;
      pixels[to] = data[at + 2]; // B
      pixels[to + 1] = data[at + 1]; // G
      pixels[to + 2] = data[at]; // R
      pixels[to + 3] = data[at + 3]; // A
    }
  }

  const maskStride = Math.ceil(size / 32) * 4;
  return Buffer.concat([header, pixels, Buffer.alloc(maskStride * size)]);
}

/** The whole `.ico` — a 6-byte header, one 16-byte directory entry per size,
 * then the images. 256 is written as `0`, which is how the format spells it. */
async function icoFile() {
  const images = await Promise.all(ICO_SIZES.map(dibEntry));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(ICO_SIZES.length, 4);

  let offset = 6 + ICO_SIZES.length * 16;
  const directory = ICO_SIZES.map((size, at) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bit count
    entry.writeUInt32LE(images[at].length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += images[at].length;
    return entry;
  });

  return Buffer.concat([header, ...directory, ...images]);
}

if (check) {
  const stale = [...outputs(), { path: ICO_PATH }].filter(
    ({ path }) => !newerThanSource(path),
  );
  if (stale.length) {
    console.error(
      `✗ ${stale.length} icon(s) missing or older than ${SOURCE}. Run ` +
        `\`npm run icons --prefix tauri\`.`,
    );
    process.exit(1);
  }
  console.log(`✓ ${SIZES.length} icons and the Windows .ico are current`);
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
  writeFileSync(ICO_PATH, await icoFile());
  console.log(
    `✓ ${SIZES.length} icons and a ${ICO_SIZES.length}-size .ico → ${OUT_DIR}`,
  );
}
