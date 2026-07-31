#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Captures the manifest SCREENSHOTS (§11.4.1) — the images Chrome shows in the
// richer install prompt on Android and desktop, and which app-listing surfaces
// increasingly pull straight from the manifest.
//
// These are REAL FRAMES of the running game, not composed artwork like the OG
// card (generate-og.mjs). An install prompt is a promise about what the player
// is about to get, and a marketing render in that slot is a lie with a button
// under it. So this drives the actual build in headless Chromium at the two
// form factors Chrome distinguishes, hands the run to the engine's own
// autopilot, and shoots a live fight.
//
// The output is COMMITTED, like the icons and the OG card: the manifest names
// these files, so a build without them would ship a manifest pointing at 404s.
// `check-seo` asserts every manifest screenshot resolves in dist/, which is
// what stops that happening quietly.
//
// Playwright is deliberately NOT a dependency of this repo (same as the
// playtest harness it borrows its menu walk from). Install it ephemerally:
//
//   npm run build --workspace pwa
//   npm install --no-save playwright
//   make screenshots
//
// Re-run after an art pass, a HUD change, or anything else that changes what
// the game LOOKS like — the same trigger list as `make store-shots`.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PWA = resolve(__dirname, "..");
const DIST = resolve(PWA, "dist");
const PUBLIC = resolve(PWA, "public");
const PORT = Number(process.env.SHOT_PORT ?? 5177);
const BASE = `http://localhost:${PORT}`;

// The two form factors Chrome distinguishes, and the rules it enforces: each
// side 320..3840 px, the longest side at most 2.3x the shortest, and every
// screenshot sharing a form factor sharing an aspect ratio.
//
// `narrow` is the reference landscape phone this game is designed against
// (~844x390 CSS — see AGENTS.md); `narrow` describes the DEVICE, not the
// orientation, and this game is landscape everywhere. `wide` is a 16:9 desktop
// window, which also exercises the 2x UI scale regime.
const SHOTS = [
  { file: "screenshot-narrow.png", width: 844, height: 390, form: "narrow" },
  { file: "screenshot-wide.png", width: 1280, height: 720, form: "wide" },
];

// The run to shoot. `?bot=` hands it to the engine autopilot, so the frame owes
// nothing to a human's reflexes and the same seed always plays the same fight.
const LEVEL = process.env.SHOT_LEVEL ?? "moon";
const DIFFICULTY = process.env.SHOT_DIFFICULTY ?? "medium";
const SEED = process.env.SHOT_SEED ?? "42";
// Long enough for the bot to be in a real fight with loot on the ground — a
// frame of the hero alone on empty dust sells nothing.
const SETTLE_MS = Number(process.env.SHOT_SETTLE_MS ?? 12_000);

if (!existsSync(DIST)) {
  process.stderr.write(
    "generate-screenshots: pwa/dist is missing — run `npm run build --workspace pwa` first\n",
  );
  process.exit(1);
}

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  process.stderr.write(
    "generate-screenshots: playwright is not installed.\n" +
      "  npm install --no-save playwright\n",
  );
  process.exit(1);
}

async function waitForServer(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${BASE}/`)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`preview server never came up on ${BASE}`);
}

/**
 * Walk the title menu into a running level. Mirrors the playtest harness: the
 * `?bot=`/`?level=` params only take effect once a run EXISTS, so the menu has
 * to start one — a fresh profile has no heroes, so PLAY → NEW GAME lands on the
 * create form, and the difficulty rung walks straight into the campaign.
 */
async function startRun(page) {
  const params = `?bot=balanced&level=${LEVEL}&difficulty=${DIFFICULTY}&seed=${SEED}`;
  await page.goto(`${BASE}/${params}`, { waitUntil: "load" });
  await page.getByRole("button", { name: "new-game" }).waitFor();
  await page.getByRole("button", { name: "new-game" }).click();
  await page.getByRole("textbox", { name: "character-name" }).waitFor();
  await page.getByRole("textbox", { name: "character-name" }).fill("ADA");
  await page.getByRole("button", { name: "character-create" }).click();
  await page
    .getByRole("button", { name: `difficulty-${DIFFICULTY}` })
    .waitFor();
  await page.getByRole("button", { name: `difficulty-${DIFFICULTY}` }).click();
  // A fresh hero walks straight in; a picker only appears on a beaten rung, in
  // which case any level starts a run and `?level=` swaps the right one in.
  try {
    await page
      .getByRole("button", { name: /^level-/ })
      .first()
      .click({ timeout: 2500 });
  } catch {
    /* walked in — no picker */
  }
  // Wait on the DOM, not on `window.__game`: that hook only exists under
  // `?debug`, which also forces the FPS meter on — a developer overlay burned
  // into the image every installer sees.
  await page
    .locator(".game-screen canvas")
    .first()
    .waitFor({ timeout: 30_000 });
}

mkdirSync(PUBLIC, { recursive: true });

const preview = spawn(
  "npx",
  ["vite", "preview", "--port", String(PORT), "--strictPort"],
  { cwd: PWA, stdio: "ignore" },
);

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium",
  });
  for (const shot of SHOTS) {
    const context = await browser.newContext({
      viewport: { width: shot.width, height: shot.height },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await startRun(page);
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({ path: `${PUBLIC}/${shot.file}` });
    await context.close();
    process.stdout.write(
      `generate-screenshots: wrote public/${shot.file} ` +
        `(${shot.width}x${shot.height}, ${shot.form})\n`,
    );
  }
} finally {
  await browser?.close();
  preview.kill();
}
