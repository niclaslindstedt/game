#!/usr/bin/env node
// Renders the 1200×630 Open Graph card (§11.3.8) from the same brand values
// the icon and title screen use, so the unfurler image cannot drift from the
// page content. Part of `npm run icons`; output is committed.
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const out = fileURLToPath(new URL("../public/og-default.png", import.meta.url));

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <defs>
    <linearGradient id="ship" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7ef0c8"/>
      <stop offset="1" stop-color="#38b6ff"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="#0b0d10"/>
  <circle cx="985" cy="315" r="210" fill="none" stroke="#1d2530" stroke-width="14"/>
  <circle cx="985" cy="315" r="135" fill="none" stroke="#28313e" stroke-width="10"/>
  <path d="M985 135 L1108 432 L985 370 L862 432 Z" fill="url(#ship)"/>
  <text x="90" y="270" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
        font-size="120" font-weight="800" letter-spacing="8" fill="#e6e8eb">GAME</text>
  <text x="92" y="345" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
        font-size="38" fill="#9aa3ad">Offline survival shooter for the browser</text>
  <text x="92" y="410" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
        font-size="30" fill="#5d6670">Hold to steer — your loadout does the fighting</text>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile(out);
console.log("wrote", out);
