// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Caption compositing for the store screenshots — shared by `store-shots.mjs`
// (the real capture) and `store-shot-sweep.mjs` (the time-matrix explorer), so
// a swept frame is composed exactly like the one that ships.

import sharp from "sharp";

import {
  GLYPHS,
  measureText,
  renderText,
} from "../../../scripts/asset-tools/font.mjs";
import {
  blit,
  createSurface,
  fill,
  upscale,
} from "../../../scripts/asset-tools/surface.mjs";

// ---------------------------------------------------------------------------
// Caption compositing. The band is drawn in the game's palette: the brand
// background, an amber rule, and the pixel font at an integer scale.
// ---------------------------------------------------------------------------
export const BRAND_BG = [11, 13, 16, 255]; // #0b0d10 — game.config theme_color
const AMBER = [255, 176, 64, 255];
const AMBER_DIM = [120, 78, 28, 255];

/** Fail loudly on a caption the pixel font can't spell (it would render "?"). */
export function assertSpellable(text) {
  const missing = [...text.toUpperCase()].filter(
    (c) => c !== " " && !GLYPHS[c],
  );
  if (missing.length) {
    throw new Error(
      `caption "${text}" uses characters the pixel font lacks: ` +
        `${[...new Set(missing)].join(" ")} — add them to GLYPHS in ` +
        `scripts/asset-tools/font.mjs and rerun \`make assets\``,
    );
  }
}

/**
 * Render one caption as an RGBA PNG buffer sized `width × height`, the text
 * centred on the brand background with an amber underline.
 */
export async function captionBand(text, width, height) {
  assertSpellable(text);
  const band = createSurface(width, height);
  fill(band, BRAND_BG);

  // Largest integer scale whose text still leaves a comfortable margin — an
  // integer factor is the only correct scaling for pixel type.
  const textWidth = measureText(text);
  const scale = Math.max(
    1,
    Math.min(
      Math.floor((width * 0.86) / Math.max(1, textWidth)),
      Math.floor((height * 0.42) / 5),
    ),
  );
  const glyphs = upscale(renderText(text, AMBER), scale);
  blit(
    band,
    glyphs,
    Math.round((width - glyphs.width) / 2),
    Math.round((height - glyphs.height) / 2),
  );

  // A dim amber rule along the bottom edge, so the band reads as part of the
  // game's UI rather than a sticker on top of it.
  const rule = fill(
    createSurface(Math.round(width * 0.5), Math.max(2, scale)),
    AMBER_DIM,
  );
  blit(
    band,
    rule,
    Math.round((width - rule.width) / 2),
    height - rule.height * 3,
  );

  return sharp(Buffer.from(band.data), {
    raw: { width: band.width, height: band.height, channels: 4 },
  })
    .png()
    .toBuffer();
}

/**
 * Compose the final store frame from a raw device-resolution capture.
 *
 * `framed` — the gameplay sits below a caption band, inset on the brand
 * background. Nothing in the game is covered, which is the whole point: the
 * HUD lives along the top and bottom edges, so a caption laid OVER the frame
 * would hide exactly what the shot is meant to show.
 *
 * `bleed` — full-bleed gameplay, caption band overlaid at the top. Keeps every
 * pixel of the game at 1:1 but does cover the HUD's top row.
 */
export async function compose(raw, device, caption, layout = "framed") {
  const { width, height } = device.raster;
  if (!caption) return raw;

  if (layout === "bleed") {
    const bandHeight = Math.round(height * 0.16);
    const band = await captionBand(caption, width, bandHeight);
    return sharp(raw)
      .composite([{ input: band, top: 0, left: 0 }])
      .png()
      .toBuffer();
  }

  // framed: caption band on top, the capture scaled to fit beneath it. The
  // capture is downscaled with `nearest` so the pixel art stays hard-edged
  // rather than being smoothed into mush.
  const bandHeight = Math.round(height * 0.17);
  const inset = Math.round(width * 0.03);
  const frameWidth = width - inset * 2;
  const frameHeight = height - bandHeight - inset;
  const scaled = await sharp(raw)
    .resize(frameWidth, frameHeight, {
      fit: "contain",
      kernel: "nearest",
      background: BRAND_BG,
    })
    .toBuffer();
  const band = await captionBand(caption, width, bandHeight);

  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: BRAND_BG[0], g: BRAND_BG[1], b: BRAND_BG[2], alpha: 1 },
    },
  })
    .composite([
      { input: band, top: 0, left: 0 },
      { input: scaled, top: bandHeight, left: inset },
    ])
    .png()
    .toBuffer();
}
