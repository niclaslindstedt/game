#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// NUKE detonation preview (see the `visual-effects` skill). The screen-clearing
// bomb's FX is split across two layers — the world-anchored shockwave rings +
// embers + scorch on the canvas (render/effects.ts), and the full-screen
// flash / light / fire / smoke DOM overlay (createNukeFx / .nuke-fx-layer). This
// drives the REAL running game through the `?debug` `window.__nuke()` hook and
// screenshots the detonation frame by frame so the whole spectacle can be
// eyeballed exactly as it ships (no copy of the draw code to drift).
//
// Usage (from pwa/, dev server on :5199 with assets built):
//   npx vite --port 5199 &
//   node scripts/nuke-preview.mjs [--url http://localhost:5199]
//     [--level spacez_hq] [--seed 42] [--out DIR]
//
// Writes numbered frames + a strip.html contact sheet under
// pwa/assets-preview/nuke/. Playwright is installed ephemerally:
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
// A ring of mobs staged around the hero so the blast has bodies to burn into
// charred skeletons (see the incineration FX). Forwarded as `?scenario=`.
const mobs = opt("mobs", "intern");
const mobCount = opt("count", "14");
const outDir = opt(
  "out",
  fileURLToPath(new URL("../assets-preview/nuke", import.meta.url)),
);
mkdirSync(outDir, { recursive: true });

// Wall-clock ms after the detonation to sample — the opening flash + fireball,
// the mobs burning, the skeletons emerging in smoke, then smouldering out.
const FRAMES_MS = [0, 90, 180, 300, 450, 650, 900, 1200, 1600];

const browser = await chromium.launch({
  executablePath:
    process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium",
});
// Mobile-first, landscape — the game's reference phone viewport.
const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
page.on("pageerror", (e) => console.error("PAGE ERROR:", e.message));

// Boot straight into a live level (the same menu walk playtest.mjs uses); a
// fresh hero lands on the first campaign level, and `?level=` forces the pick.
// `?scenario=` drops straight into play (`skipOpening`), stages a ring of mobs
// around the hero, and disarms him — so the horde lives right up until the nuke
// burns it into a field of skeletons. (No `freeze`: the effects animate on the
// sim clock, which a frozen run stops.)
const scenario = JSON.stringify({
  skipOpening: true,
  disarmed: true,
  clearEnemies: true,
  spawns: [
    { enemy: mobs, count: Number(mobCount), minDistance: 24, maxDistance: 92 },
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
await page.getByRole("textbox", { name: "character-name" }).fill("BOOM");
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

// Fire the nuke and grab the frames as fast as the sample schedule allows,
// timing each shot off the detonation instant.
const shots = [];
const t0 = Date.now();
await page.evaluate(() => window.__nuke());
for (const at of FRAMES_MS) {
  const wait = at - (Date.now() - t0);
  if (wait > 0) await page.waitForTimeout(wait);
  const name = `nuke-${String(at).padStart(4, "0")}ms.png`;
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
  `<!doctype html><meta charset="utf-8"><title>nuke fx</title>` +
    `<style>body{background:#0b0d10;color:#cdd3dc;font:12px system-ui;` +
    `display:flex;flex-wrap:wrap;gap:10px;padding:12px}` +
    `figure{margin:0}img{display:block;border:1px solid #222}` +
    `figcaption{text-align:center;padding-top:3px}</style>${cells}`,
);

await browser.close();
console.log(`wrote ${shots.length} frames + strip.html → ${outDir}`);
