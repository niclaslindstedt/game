#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Composite the real title-screen wordmark into art-only Steam capsules.
// Run exactly once after placing fresh art-only rasters at the canonical paths.

import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import { renderText } from "./asset-tools/font.mjs";
import { blit, createSurface, upscale } from "./asset-tools/surface.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const capsules = path.join(root, "electron/store/capsules");
const MINT = [0x7e, 0xf0, 0xc8, 0xff];
const SHADOW = [0x00, 0x00, 0x00, 0x8c];
const TEXT = "ADA'S TRAIL";

const specs = [
  { file: "header.png", scale: 8, left: 40, top: 155 },
  { file: "small.png", scale: 6, left: 28, top: 72 },
  { file: "main.png", scale: 13, left: 356, top: 570 },
  { file: "vertical.png", scale: 12, left: 134, top: 780 },
  { file: "library.png", scale: 11, left: 80, top: 785 },
  { file: "library-header.png", scale: 7, left: 610, top: 205 },
];

function wordmark(scale) {
  const logo = upscale(renderText(TEXT, MINT), scale);
  const shadow = upscale(renderText(TEXT, SHADOW), scale);
  const overlay = createSurface(logo.width, logo.height + 5);
  blit(overlay, shadow, 0, 5);
  blit(overlay, logo, 0, 0);
  return {
    input: Buffer.from(overlay.data),
    raw: { width: overlay.width, height: overlay.height, channels: 4 },
  };
}

for (const spec of specs) {
  const input = path.join(capsules, spec.file);
  const output = `${input}.wordmark.tmp.png`;
  await sharp(input)
    .composite([{ ...wordmark(spec.scale), left: spec.left, top: spec.top }])
    .png()
    .toFile(output);
  await sharp(output).toFile(input);
  await import("node:fs").then(({ unlinkSync }) => unlinkSync(output));
  console.log(`composited ${TEXT} -> ${spec.file}`);
}
