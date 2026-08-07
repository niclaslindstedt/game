// SPDX-License-Identifier: LicenseRef-GoneInSpace-Mod-SDK-1.0
// PNG → RAW PIXELS, decoded HERE rather than in the game.
//
// A mod may draw its art in an editor and drop the .png in
// (`sprites/<family>/<id>.png`), which is the whole point of this module: a
// pixel artist's work is a picture, and asking them to re-enter it as a
// character grid with a palette legend is asking them to throw their tools
// away. But the game must still be handed `width × height × RGBA` bytes and
// nothing else — that contract is deliberate and predates this file:
//
//   * The page builds an `ImageBitmap` out of a flat byte array whose size it
//     already knows. That is synchronous, infallible and has no format to get
//     wrong. Handing it a stranger's PNG instead would put an image decoder on
//     the untrusted side of the wall, in the process that holds the player's
//     save.
//   * Every OTHER sprite already arrives that way (a YAML grid is rasterized in
//     `build.mjs`), so decoding here means the renderer keeps ONE input shape
//     rather than two, and a mod's PNG art and its grid art are indistinguishable
//     the moment they leave this toolchain.
//
// So the decode is a compile step, and this is it: the non-interlaced PNG
// spec, in about two hundred lines, on `node:zlib` and nothing else. The mod
// toolchain ships outside the app's asar and installs no packages of its own
// (see `mod/package.json`), which rules out `sharp` and every other native
// decoder — and is a good thing here, because a decoder we can read end to end
// is a decoder whose refusals we can explain to the author by line.
//
// WHAT IT REFUSES, IT REFUSES OUT LOUD. An interlaced file, a 16-bit file, a
// truncated one: each throws with what is wrong and what to do about it, at
// compile time, with the file name attached by the caller. The one thing this
// module must never do is guess — a silently mis-decoded sprite is a mod that
// looks broken with every check green.

import { inflateSync } from "node:zlib";

/** The eight bytes every PNG opens with (spec §5.2). */
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Is this file a PNG at all? Cheap enough to ask before anything else, and it
 * is what lets the compiler tell an author "you renamed a JPEG" rather than
 * "unexpected byte". */
export function isPng(bytes) {
  return bytes.length >= 8 && bytes.subarray(0, 8).equals(SIGNATURE);
}

/** How many samples one pixel carries, per PNG colour type (spec §6.1). An
 * entry that is not here is a colour type that does not exist. */
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/** What each colour type is called when the refusal has to name it. */
const COLOR_TYPE_NAME = {
  0: "greyscale",
  2: "truecolour",
  3: "indexed",
  4: "greyscale+alpha",
  6: "truecolour+alpha",
};

/**
 * The largest picture this will decode, per side.
 *
 * A guard on the HEADER, checked before a single byte is inflated — which is
 * the only place it can do any good. A PNG's pixel count is declared in 13
 * bytes at a fixed offset while its compressed size says nothing at all, so a
 * 4 KB file can legitimately declare 30000×30000 and ask for 3.6 GB of
 * scanlines. Reading the declaration first turns that from an out-of-memory
 * crash in somebody's game into an error message about a file that is too big.
 *
 * 512 is far past anything this game draws — the largest shipped sprite is a
 * boss at a few dozen pixels a side, and a sprite's pixels ARE world units, so
 * a 512-px body would be six screens tall. It is a backstop, not a style guide;
 * `build.mjs` warns from 96 up, where the art stops looking like this game.
 */
export const MAX_PNG_SIDE = 512;

/**
 * Decode a non-interlaced PNG into straight-alpha RGBA.
 *
 * @param {Buffer} bytes  the file, whole
 * @returns {{ width: number, height: number, rgba: Buffer }}
 * @throws {Error} with a message written for the mod author, never a stack
 */
export function decodePng(bytes) {
  if (!isPng(bytes)) {
    throw new Error(
      "not a PNG — the first bytes are something else, so it was probably " +
        "renamed rather than exported",
    );
  }

  const { header, palette, transparency, data } = readChunks(bytes);
  const { width, height, depth, colorType, interlace } = header;

  if (interlace !== 0) {
    throw new Error(
      "interlaced (Adam7) — re-export it without interlacing, which is the " +
        "default in every editor and smaller besides",
    );
  }
  if (depth === 16) {
    throw new Error(
      "16 bits per channel — re-export it at 8, which is what the screen " +
        "shows and a quarter of the bytes",
    );
  }
  if (![1, 2, 4, 8].includes(depth)) {
    throw new Error(`${depth} bits per channel is not a PNG bit depth`);
  }
  if (!(colorType in CHANNELS)) {
    throw new Error(`colour type ${colorType} is not a PNG colour type`);
  }
  if (depth < 8 && colorType !== 0 && colorType !== 3) {
    throw new Error(
      `${depth}-bit ${COLOR_TYPE_NAME[colorType]} — under 8 bits, PNG allows ` +
        "only greyscale and indexed colour",
    );
  }
  if (colorType === 3 && palette === null) {
    throw new Error("indexed colour with no palette (no PLTE chunk)");
  }
  if (data.length === 0) throw new Error("no image data (no IDAT chunk)");

  const channels = CHANNELS[colorType];
  const bitsPerPixel = channels * depth;
  // Rounded UP: a sub-byte row is padded to a whole byte, and the padding bits
  // are not pixels. Getting this wrong shears the picture one pixel further
  // every row, which is the classic tell of a hand-written PNG reader.
  const stride = Math.ceil((width * bitsPerPixel) / 8);
  // The filter works on whole BYTES, so a sub-byte pixel's "previous pixel" is
  // one byte back (spec §9.2 — bpp is rounded up to 1 for those).
  const filterBytes = Math.max(1, Math.ceil(bitsPerPixel / 8));

  let raw;
  try {
    raw = inflateSync(data);
  } catch {
    throw new Error(
      "the image data will not decompress — the file is truncated or corrupt",
    );
  }
  const expected = (stride + 1) * height;
  if (raw.length < expected) {
    throw new Error(
      `the image data is short (${raw.length} bytes for a ${width}×${height} ` +
        `picture that needs ${expected}) — the file is truncated`,
    );
  }

  const lines = unfilter(raw, height, stride, filterBytes);
  return {
    width,
    height,
    rgba: toRgba(lines, {
      width,
      height,
      depth,
      colorType,
      channels,
      stride,
      palette,
      transparency,
    }),
  };
}

/**
 * Walk the chunk stream, keeping the four chunks that carry a picture.
 *
 * Every other chunk — the colour profiles, the text, the timestamps, the
 * editor's own private notes — is skipped by its declared length without being
 * looked at, which is both what the spec asks for and the only sane posture
 * toward metadata somebody else's tool wrote. The CRCs go unchecked on purpose:
 * a corrupt file fails at the inflate a few lines above with a better message
 * than "chunk 7 has a bad checksum" would be.
 */
function readChunks(bytes) {
  let header = null;
  let palette = null;
  let transparency = null;
  const idat = [];

  let at = 8;
  while (at + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(at);
    const type = bytes.toString("latin1", at + 4, at + 8);
    const start = at + 8;
    const end = start + length;
    if (end + 4 > bytes.length) {
      throw new Error(
        `the "${type}" chunk runs past the end of the file — it is ` +
          "truncated or corrupt",
      );
    }
    if (type === "IHDR") {
      if (length < 13) throw new Error("the header chunk (IHDR) is short");
      header = {
        width: bytes.readUInt32BE(start),
        height: bytes.readUInt32BE(start + 4),
        depth: bytes[start + 8],
        colorType: bytes[start + 9],
        interlace: bytes[start + 12],
      };
      // Checked HERE, before anything is allocated or inflated — see
      // MAX_PNG_SIDE. A zero side is not a small picture, it is not a picture.
      const { width, height } = header;
      if (width === 0 || height === 0) {
        throw new Error(
          `it declares a ${width}×${height} picture, which is none`,
        );
      }
      if (width > MAX_PNG_SIDE || height > MAX_PNG_SIDE) {
        throw new Error(
          `${width}×${height} is past the ${MAX_PNG_SIDE}×${MAX_PNG_SIDE} a ` +
            "sprite may be — a sprite's pixels are world units, so this one " +
            "would stand several screens tall",
        );
      }
    } else if (type === "PLTE") {
      palette = bytes.subarray(start, end);
    } else if (type === "tRNS") {
      transparency = bytes.subarray(start, end);
    } else if (type === "IDAT") {
      idat.push(bytes.subarray(start, end));
    } else if (type === "IEND") {
      break;
    }
    at = end + 4; // …past the chunk's CRC
  }

  if (header === null) throw new Error("no header chunk (IHDR)");
  return { header, palette, transparency, data: Buffer.concat(idat) };
}

/**
 * Undo the per-scanline filters, in place, into one contiguous buffer of rows.
 *
 * Each row arrives prefixed with its filter type and is reconstructed from the
 * bytes to its left (`a`), the row above (`b`) and that row's left (`c`) —
 * spec §9.2. The reconstruction is sequential by nature: row N needs row N-1
 * already undone, and byte i needs byte i-1.
 */
function unfilter(raw, height, stride, bpp) {
  const out = Buffer.alloc(stride * height);
  let at = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[at];
    at += 1;
    const row = y * stride;
    const prev = row - stride;
    for (let i = 0; i < stride; i += 1) {
      const x = raw[at + i];
      const a = i >= bpp ? out[row + i - bpp] : 0;
      const b = y > 0 ? out[prev + i] : 0;
      const c = y > 0 && i >= bpp ? out[prev + i - bpp] : 0;
      let value;
      switch (filter) {
        case 0:
          value = x;
          break;
        case 1:
          value = x + a;
          break;
        case 2:
          value = x + b;
          break;
        case 3:
          value = x + ((a + b) >> 1);
          break;
        case 4:
          value = x + paeth(a, b, c);
          break;
        default:
          throw new Error(`row ${y} names filter ${filter}, which is not one`);
      }
      out[row + i] = value & 0xff;
    }
    at += stride;
  }
  return out;
}

/** The Paeth predictor (spec §9.4): whichever of left/above/upper-left the
 * linear estimate `a + b - c` lands nearest, ties going left then up. */
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** Read the `index`-th sample of a row at a sub-byte depth. */
function sampleAt(lines, rowStart, index, depth) {
  const perByte = 8 / depth;
  const byte = lines[rowStart + Math.floor(index / perByte)];
  const shift = 8 - depth * ((index % perByte) + 1);
  return (byte >> shift) & ((1 << depth) - 1);
}

/** Expand a `depth`-bit greyscale sample to the full 0..255 range. `0b01` at
 * two bits is one third of white, not 1 — so it is scaled, never shifted. */
const scaleGrey = (value, depth) =>
  Math.round((value * 255) / ((1 << depth) - 1));

/** The reconstructed rows → straight-alpha RGBA, one 4-byte pixel each. */
function toRgba(lines, spec) {
  const { width, height, depth, colorType, channels, stride } = spec;
  const { palette, transparency } = spec;
  const out = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * stride;
    for (let x = 0; x < width; x += 1) {
      let r;
      let g;
      let b;
      let a = 255;

      if (depth === 8) {
        const at = rowStart + x * channels;
        if (colorType === 0) {
          r = g = b = lines[at];
          if (transparency && transparency.length >= 2) {
            // A greyscale tRNS names ONE fully transparent shade, as a 16-bit
            // value whose low byte is the 8-bit one.
            if (lines[at] === transparency[1]) a = 0;
          }
        } else if (colorType === 2) {
          r = lines[at];
          g = lines[at + 1];
          b = lines[at + 2];
          if (
            transparency &&
            transparency.length >= 6 &&
            r === transparency[1] &&
            g === transparency[3] &&
            b === transparency[5]
          ) {
            a = 0;
          }
        } else if (colorType === 3) {
          [r, g, b, a] = fromPalette(lines[at], palette, transparency);
        } else if (colorType === 4) {
          r = g = b = lines[at];
          a = lines[at + 1];
        } else {
          r = lines[at];
          g = lines[at + 1];
          b = lines[at + 2];
          a = lines[at + 3];
        }
      } else if (colorType === 3) {
        const index = sampleAt(lines, rowStart, x, depth);
        [r, g, b, a] = fromPalette(index, palette, transparency);
      } else {
        // Sub-byte greyscale — a 1-bit mask, a 4-bit ramp.
        const value = sampleAt(lines, rowStart, x, depth);
        r = g = b = scaleGrey(value, depth);
        if (transparency && transparency.length >= 2) {
          const clear = (transparency[0] << 8) | transparency[1];
          if (value === clear) a = 0;
        }
      }

      const i = (y * width + x) * 4;
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
      out[i + 3] = a;
    }
  }
  return out;
}

/** One palette entry, with its tRNS alpha when the file gave it one. An index
 * past the palette's end is a malformed file; it reads as transparent rather
 * than as whatever happened to follow in memory. */
function fromPalette(index, palette, transparency) {
  const at = index * 3;
  if (palette === null || at + 2 >= palette.length) return [0, 0, 0, 0];
  const alpha =
    transparency && index < transparency.length ? transparency[index] : 255;
  return [palette[at], palette[at + 1], palette[at + 2], alpha];
}
