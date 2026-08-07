// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE PNG DECODER, against pictures it did not write.
//
// A decoder is the one kind of module where "it works on my file" means
// nothing: the format has five row filters, five colour types and five bit
// depths, an encoder picks among them per image to get its file small, and a
// reader that gets any combination wrong produces a picture rather than an
// error — sheared, mis-hued, or off by one row. So the fixtures here are
// ENCODED BY SHARP, the same library the game's own asset pipeline draws with,
// and the assertion is that our bytes and its bytes agree exactly.
//
// `adaptiveFiltering` is the load-bearing option: it lets libpng choose a
// filter per scanline, which is what puts Sub, Up, Average and Paeth into one
// small file. Without it a "passing" suite would only ever have exercised
// filter 0.
//
// The refusals are tested for their MESSAGE as much as their throwing. Every
// one of them reaches a mod author as a compile error with their filename on
// it, and "interlaced (Adam7) — re-export it without interlacing" is a minute
// of their evening where "decode failed" is an afternoon.

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { decodePng, isPng, MAX_PNG_SIDE } from "../../mod/tools/png.mjs";

/** A picture with hard edges, a full-range gradient and holes in its alpha —
 * the three things a filter bug shows up in. Deliberately not square and not a
 * multiple of anything, so a stride mistake cannot cancel out. */
const W = 23;
const H = 17;
function fixture(): Buffer {
  const px = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const i = (y * W + x) * 4;
      px[i] = (x * 11) % 256;
      px[i + 1] = (y * 23) % 256;
      px[i + 2] = x < W / 2 ? 0 : 255; // a hard vertical edge
      px[i + 3] = (x + y) % 5 === 0 ? 0 : 255;
    }
  }
  return px;
}

const raw = { width: W, height: H, channels: 4 as const };

/** What sharp itself reads back out of `png` — the reference every case is
 * measured against, so the test asserts AGREEMENT rather than our own guess. */
async function reference(png: Buffer): Promise<Buffer> {
  return sharp(png).ensureAlpha().raw().toBuffer();
}

describe("decodePng", () => {
  it("matches sharp on 8-bit RGBA", async () => {
    const png = await sharp(fixture(), { raw }).png().toBuffer();
    const out = decodePng(png);
    expect([out.width, out.height]).toEqual([W, H]);
    expect(out.rgba.equals(await reference(png))).toBe(true);
  });

  it("matches sharp when every row filter is in play", async () => {
    // The whole reason this suite exists — see the header.
    const png = await sharp(fixture(), { raw })
      .png({ adaptiveFiltering: true, compressionLevel: 6 })
      .toBuffer();
    expect(decodePng(png).rgba.equals(await reference(png))).toBe(true);
  });

  it("matches sharp on an indexed palette with transparency", async () => {
    const png = await sharp(fixture(), { raw })
      .png({ palette: true, colours: 64 })
      .toBuffer();
    expect(decodePng(png).rgba.equals(await reference(png))).toBe(true);
  });

  it("matches sharp on greyscale", async () => {
    const png = await sharp(fixture(), { raw })
      .greyscale()
      .removeAlpha()
      .png()
      .toBuffer();
    const out = decodePng(png);
    expect(out.rgba.equals(await reference(png))).toBe(true);
  });

  it("reads a one-pixel picture", async () => {
    const one = Buffer.from([12, 34, 56, 78]);
    const png = await sharp(one, { raw: { width: 1, height: 1, channels: 4 } })
      .png()
      .toBuffer();
    const out = decodePng(png);
    expect([out.width, out.height]).toEqual([1, 1]);
    expect([...out.rgba]).toEqual([12, 34, 56, 78]);
  });

  it("refuses an interlaced file, and says how to fix it", async () => {
    const png = await sharp(fixture(), { raw })
      .png({ progressive: true })
      .toBuffer();
    expect(() => decodePng(png)).toThrow(/interlaced.*re-export/i);
  });

  it("refuses 16 bits per channel, and says how to fix it", async () => {
    const png = await sharp(fixture(), { raw })
      .toColourspace("rgb16")
      .png()
      .toBuffer();
    expect(() => decodePng(png)).toThrow(/16 bits per channel.*re-export/i);
  });

  it("refuses a file that is not a PNG at all", () => {
    const jpegish = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0]);
    expect(isPng(jpegish)).toBe(false);
    expect(() => decodePng(jpegish)).toThrow(/not a PNG/);
  });

  it("refuses a truncated file rather than drawing half a picture", async () => {
    const png = await sharp(fixture(), { raw }).png().toBuffer();
    // Cut the image data in half but leave the header intact — the shape a
    // half-finished download or a truncated zip entry actually has.
    const cut = png.subarray(0, Math.floor(png.length * 0.6));
    expect(() => decodePng(cut)).toThrow(/truncated|corrupt/i);
  });

  it("refuses an enormous picture from its HEADER, before inflating", async () => {
    // The decompression-bomb case: a tiny file that declares a huge picture.
    // Built by rewriting the width in a real file's IHDR, so nothing but the
    // declaration is large — if the guard ran after the inflate, this would
    // allocate gigabytes instead of throwing.
    const png = await sharp(fixture(), { raw }).png().toBuffer();
    const bomb = Buffer.from(png);
    bomb.writeUInt32BE(30_000, 16); // IHDR width
    expect(() => decodePng(bomb)).toThrow(
      new RegExp(`30000.*${MAX_PNG_SIDE}`, "s"),
    );
    expect(bomb.length).toBeLessThan(4096);
  });

  it("refuses a zero-sized picture", async () => {
    const png = await sharp(fixture(), { raw }).png().toBuffer();
    const empty = Buffer.from(png);
    empty.writeUInt32BE(0, 20); // IHDR height
    expect(() => decodePng(empty)).toThrow(/which is none/);
  });
});
