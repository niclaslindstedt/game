#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Steam overlays this transparent wordmark on library-hero.png. Render it from
// the same glyph source as the title screen so store lettering cannot drift.

import path from "node:path";
import { fileURLToPath } from "node:url";

import { renderText } from "./asset-tools/font.mjs";
import { writePng } from "./asset-tools/preview.mjs";
import { blit, createSurface, upscale } from "./asset-tools/surface.mjs";

const WIDTH = 1280;
const HEIGHT = 720;
const SCALE = 18;
const MINT = [0x7e, 0xf0, 0xc8, 0xff];
const SHADOW = [0x00, 0x00, 0x00, 0x8c];
const TEXT = "ADA'S TRAIL";

const logo = upscale(renderText(TEXT, MINT), SCALE);
const shadow = upscale(renderText(TEXT, SHADOW), SCALE);
const canvas = createSurface(WIDTH, HEIGHT);
const x = Math.floor((WIDTH - logo.width) / 2);
const y = Math.floor((HEIGHT - logo.height) / 2);

blit(canvas, shadow, x, y + 5);
blit(canvas, logo, x, y);

const root = fileURLToPath(new URL("..", import.meta.url));
const out = path.join(root, "electron/store/capsules/library-logo.png");
await writePng(canvas, out);
console.log(`wrote ${TEXT} wordmark (${WIDTH}x${HEIGHT}) -> ${out}`);
