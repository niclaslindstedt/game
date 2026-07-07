#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Automated cutscene review harness — the visual half of the scene-authoring
// loop (the headless half is tests/cutscene_test.ts). Loads the app's
// cutscene workbench (`?cutscene=<id>&debug`, see CutscenePreview.tsx) in
// headless Chromium, lets the scene play in real time (tapping through the
// text beats, which hold for the player), and screenshots the stage at the
// START OF EVERY BEAT into
// website/assets-preview/cutscenes/<id>/beat-NN-<kind>.png — one image per
// storyboard panel, so a scene edit is reviewed like a contact sheet:
// edit defs/cutscenes.ts → run this → LOOK at the beats.
//
// Usage:
//   npx vite --port 5199 &            # dev server (from website/)
//   node scripts/cutscene-preview.mjs [--id prelude] \
//     [--url http://localhost:5199] [--timeout 90]
//
// Playwright is intentionally NOT a dependency of this repo; install it
// ephemerally when previewing: `npm install --no-save playwright`.
/* global window */

import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const url = opt("url", "http://localhost:5199");
const id = opt("id", "prelude");
const timeoutMs = Number(opt("timeout", "90")) * 1000;

const shotDir = fileURLToPath(
  new URL(`../assets-preview/cutscenes/${id}`, import.meta.url),
);
mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({
  executablePath:
    process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium",
});
// Mobile-first: scenes are staged for a phone held horizontally.
const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
page.on("pageerror", (e) => console.error("PAGE ERROR:", e.message));

await page.goto(`${url}/?debug&cutscene=${id}`);
await page.waitForFunction(() => window.__cutscene !== undefined);

const snapshot = () =>
  page.evaluate(() => {
    const scene = window.__cutscene;
    return { beat: scene.beat, done: scene.done, fade: scene.fade };
  });

// Screenshot each beat as it starts. Polling at 100ms can hop over beats
// shorter than that (instant beats collapse anyway); every timed beat lands.
// Text beats hold for the player's tap (JRPG-style), so once a beat idles
// longer than any timed beat runs (~1.3s), tap through it like a player.
const HOLD_MS = 2000;
const beats = [];
let last = -1;
const t0 = Date.now();
let heldSince = t0;
let s = await snapshot();
while (!s.done && Date.now() - t0 < timeoutMs) {
  if (s.beat !== last) {
    last = s.beat;
    heldSince = Date.now();
    const name = `beat-${String(s.beat).padStart(2, "0")}.png`;
    // Give the new beat one frame to draw before shooting it.
    await page.waitForTimeout(120);
    await page.screenshot({ path: `${shotDir}/${name}` });
    beats.push(name);
  }
  if (Date.now() - heldSince > HOLD_MS) {
    await page.mouse.click(422, 195); // the player's tap: advance the text
    heldSince = Date.now();
  }
  await page.waitForTimeout(100);
  s = await snapshot();
}
await page.screenshot({ path: `${shotDir}/end.png` });

console.log(
  JSON.stringify(
    {
      cutscene: id,
      beatsShot: beats.length,
      finished: s.done,
      durationMs: Date.now() - t0,
      screenshots: shotDir,
    },
    null,
    2,
  ),
);
await browser.close();
