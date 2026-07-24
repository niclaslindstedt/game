#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// LEVEL-UP light-explosion preview (see the `visual-effects` skill). The ding's
// FX is split across two layers — the world-anchored flash disc + shockwave
// rings + sparkle-stars on the canvas (render/effects.ts "levelup") plus the
// hero's golden burn (render/player.ts), and the full-screen flash / bloom /
// god-rays / pillar / sparkle DOM overlay (createLevelUpFx / .levelup-fx-layer).
// It also HURLS the staged horde back on the light shockwave (engine side). This
// drives the REAL running game through the `?debug` `window.__levelup()` hook
// and screenshots the detonation frame by frame so the whole spectacle — the
// knockback included — can be eyeballed exactly as it ships.
//
// Usage (from pwa/, dev server on :5199 with assets built):
//   npx vite --port 5199 &
//   node scripts/levelup-preview.mjs [--url http://localhost:5199]
//     [--level spacez_hq] [--seed 42] [--out DIR]
//
// Writes numbered frames + a strip.html contact sheet under
// pwa/assets-preview/levelup/. Playwright is installed ephemerally:
//   npm install --no-save playwright
//
// `window` below only appears inside page.evaluate callbacks (browser scope).
/* global window */

import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const url = opt("url", "http://localhost:5199");
const level = opt("level", "spacez_hq");
const seed = opt("seed", "7");
// A ring of mobs staged around the hero so the light shockwave has bodies to
// hurl back (see the knockback). Forwarded as `?scenario=`.
const mobs = opt("mobs", "intern");
const mobCount = opt("count", "16");
const outDir = opt(
  "out",
  fileURLToPath(new URL("../assets-preview/levelup", import.meta.url)),
);
mkdirSync(outDir, { recursive: true });

// Wall-clock ms after the ding to sample — the blinding flash + bloom, the
// horde flung back, the god-rays + pillar rising, the sparkles drifting, then
// the glare fading as the burn settles (the modal would rise here in real play).
const FRAMES_MS = [0, 80, 160, 280, 420, 600, 850, 1100, 1500];

const browser = await chromium.launch({
  executablePath:
    process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium",
});
// Mobile-first, landscape — the game's reference phone viewport.
const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
page.on("pageerror", (e) => console.error("PAGE ERROR:", e.message));

// Boot straight into a live level (the same menu walk playtest.mjs uses).
// `?scenario=` drops straight into play (`skipOpening`), stages a ring of mobs
// around the hero, and disarms him — so the horde lives right up until the ding
// hurls it back on the light. (No `freeze`: the effects animate on the sim
// clock, which a frozen run stops.)
const scenario = JSON.stringify({
  skipOpening: true,
  disarmed: true,
  clearEnemies: true,
  spawns: [
    { enemy: mobs, count: Number(mobCount), minDistance: 26, maxDistance: 96 },
  ],
});
await page.goto(
  `${url}/?debug&bot=survivor&level=${encodeURIComponent(level)}&seed=${seed}` +
    `&scenario=${encodeURIComponent(scenario)}`,
);
await page.getByRole("button", { name: "play", exact: true }).waitFor();
await page.getByRole("button", { name: "play", exact: true }).click();
await page.getByRole("button", { name: "new-game" }).click();
await page.getByRole("textbox", { name: "character-name" }).waitFor();
await page.getByRole("textbox", { name: "character-name" }).fill("DING");
await page.getByRole("button", { name: "character-create" }).click();
await page.getByRole("button", { name: "difficulty-easy" }).waitFor();
await page.getByRole("button", { name: "difficulty-easy" }).click();
try {
  await page
    .getByRole("button", { name: /^level-/ })
    .first()
    .click({ timeout: 1500 });
} catch {
  // Walk-in auto-start.
}
await page.waitForFunction(() => window.__game !== undefined, {
  timeout: 15000,
});
// A staged mob can trigger an arrival dialogue that parks the run; tap through
// any intro/cutscene/dialogue until the field is actually live.
for (let i = 0; i < 30; i++) {
  const phase = await page.evaluate(() => window.__game.phase);
  if (phase === "playing") break;
  await page.mouse.click(422, 195);
  await page.waitForTimeout(180);
}
await page.waitForFunction(() => window.__game.phase === "playing", {
  timeout: 15000,
});
await page.waitForTimeout(400);

// Fire the ding FX and grab the frames as fast as the sample schedule allows,
// timing each shot off the detonation instant.
const shots = [];
const t0 = Date.now();
await page.evaluate(() => window.__levelup());
for (const at of FRAMES_MS) {
  const wait = at - (Date.now() - t0);
  if (wait > 0) await page.waitForTimeout(wait);
  const name = `levelup-${String(at).padStart(4, "0")}ms.png`;
  await page.screenshot({ path: `${outDir}/${name}` });
  shots.push({ at, name });
}

// A dark contact sheet so the whole detonation reads in one glance.
const cells = shots
  .map(
    (s) =>
      `<figure><img src="${s.name}" width="422"/>` +
      `<figcaption>${s.at} ms</figcaption></figure>`,
  )
  .join("\n");
writeFileSync(
  `${outDir}/strip.html`,
  `<!doctype html><meta charset="utf-8"><title>levelup fx</title>` +
    `<style>body{background:#0b0d10;color:#cdd3dc;font:12px system-ui;` +
    `display:flex;flex-wrap:wrap;gap:10px;padding:12px}` +
    `figure{margin:0}img{display:block;border:1px solid #222}` +
    `figcaption{text-align:center;padding-top:3px}</style>${cells}`,
);

await browser.close();
console.log(`wrote ${shots.length} frames + strip.html → ${outDir}`);
