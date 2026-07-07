#!/usr/bin/env node
// Renders the 1200×630 Open Graph card (§11.3.8) from the same brand values
// the icon and title screen use, so the unfurler image cannot drift from the
// page content. Part of `npm run icons`; output is committed.
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const out = fileURLToPath(new URL("../public/og-default.png", import.meta.url));

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <defs>
    <radialGradient id="moon" cx="0.38" cy="0.3" r="1">
      <stop offset="0" stop-color="#ff6a52"/>
      <stop offset="0.45" stop-color="#d63333"/>
      <stop offset="0.8" stop-color="#8f1522"/>
      <stop offset="1" stop-color="#6b0e1d"/>
    </radialGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0.72" stop-color="#e0402f" stop-opacity="0.35"/>
      <stop offset="1" stop-color="#e0402f" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="disc">
      <circle cx="256" cy="248" r="160"/>
    </clipPath>
  </defs>
  <rect width="1200" height="630" fill="#0b0d10"/>
  <g fill="#9aa3ad">
    <circle cx="760" cy="90" r="4"/>
    <circle cx="1130" cy="120" r="3"/>
    <circle cx="1150" cy="420" r="4"/>
    <circle cx="790" cy="520" r="3"/>
    <circle cx="960" cy="48" r="2.5"/>
    <circle cx="700" cy="580" r="3"/>
  </g>
  <!-- Same bloody-moon artwork as public/icon.svg, mirrored so the dark
       limb faces the title text, repositioned for the card -->
  <g transform="translate(985 295) scale(-1.15 1.15) translate(-256 -248)">
    <circle cx="256" cy="248" r="204" fill="url(#glow)"/>
    <circle cx="256" cy="248" r="160" fill="url(#moon)"/>
    <g fill="#7c1120">
      <circle cx="196" cy="196" r="30"/>
      <circle cx="300" cy="160" r="18"/>
      <circle cx="330" cy="270" r="26"/>
      <circle cx="238" cy="300" r="16"/>
      <circle cx="160" cy="284" r="14"/>
    </g>
    <circle cx="196" cy="188" r="200" fill="none" stroke="#3d0713" stroke-width="120"
            opacity="0.5" clip-path="url(#disc)"/>
    <g fill="#72131e">
      <path d="M194 386 C199 410 200 415 200 421 A8.5 8.5 0 1 0 217 421 C217 413 219 406 222 384 Z"/>
      <path d="M256 394 C262 424 262.5 438 262.5 447 A9.5 9.5 0 1 0 281.5 447 C281.5 436 284 424 286 392 Z"/>
      <path d="M314 380 C318 398 319.5 402 319.5 408 A8 8 0 1 0 335.5 408 C335.5 402 338 394 340 376 Z"/>
    </g>
  </g>
  <text x="90" y="270" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
        font-size="96" font-weight="800" letter-spacing="4" fill="#e6e8eb">GONE IN SPACE</text>
  <text x="92" y="345" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
        font-size="38" fill="#9aa3ad">Survive the search for your lost love</text>
  <text x="92" y="410" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
        font-size="30" fill="#5d6670">The trail leads to the moon</text>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile(out);
console.log("wrote", out);
