#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Automated playtest harness (see the `playtest` skill). Drives the real
// game in headless Chromium through the app's `?bot=<strategy>` autoplay
// mode, takes screenshots into website/assets-preview/playtest/, and reports
// the run's outcome + stats as JSON on stdout.
//
// The strategies themselves live in the ENGINE (src/game/bot.ts) — the same
// bot that the headless tests drive — so this script is only a launcher and
// observer. Add new strategies there, not here.
//
// Usage:
//   npx vite --port 5199 &            # dev server (from website/)
//   node scripts/playtest.mjs [--url http://localhost:5199] \
//     [--strategy idle|rush|kite|boss|survivor] [--timeout 120] \
//     [--difficulty easy|medium|hard|nightmare|jesus]
//
// Playwright is intentionally NOT a dependency of this repo; install it
// ephemerally when playtesting: `npm install --no-save playwright`.
//
// `window` below only appears inside page.evaluate callbacks, which execute
// in the browser page, not in Node.
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
const strategy = opt("strategy", "survivor");
const timeoutMs = Number(opt("timeout", "120")) * 1000;
const difficulty = opt("difficulty", "medium");

const shotDir = fileURLToPath(
  new URL("../assets-preview/playtest", import.meta.url),
);
mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({
  executablePath:
    process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium",
});
// Mobile-first: the game targets phones held horizontally, so playtests run
// at a phone-landscape viewport (see AGENTS.md, "Mobile-first, landscape").
const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
page.on("pageerror", (e) => console.error("PAGE ERROR:", e.message));

// `?bot=` hands the run to the engine autopilot: it dismisses the intro,
// steers, jumps, and spends level-ups on its own.
await page.goto(`${url}/?debug&bot=${strategy}`);
// The Doom-style menu: NEW GAME, then the chosen difficulty rung. Wait for
// the menu (asset load) before shooting the splash.
await page.getByRole("button", { name: "new-game" }).waitFor();
await page.screenshot({ path: `${shotDir}/title.png` });
await page.getByRole("button", { name: "new-game" }).click();
await page.screenshot({ path: `${shotDir}/difficulty.png` });
await page.getByRole("button", { name: `difficulty-${difficulty}` }).click();
await page.waitForFunction(() => window.__game !== undefined);

const snapshot = () =>
  page.evaluate(() => {
    const g = window.__game;
    return {
      phase: g.phase,
      hp: g.player.hp,
      level: g.player.level,
      inventory: g.player.inventory.filter(Boolean).length,
      stats: g.stats,
    };
  });

let s = await snapshot();
const t0 = Date.now();
let shotTaken = false;
while (
  // Cutscene appears for one poll at most — the bot skips its own preludes.
  (s.phase === "cutscene" ||
    s.phase === "intro" ||
    s.phase === "playing" ||
    s.phase === "levelup") &&
  Date.now() - t0 < timeoutMs
) {
  if (!shotTaken && Date.now() - t0 > 1500) {
    await page.screenshot({ path: `${shotDir}/gameplay.png` });
    shotTaken = true;
  }
  await page.waitForTimeout(200);
  s = await snapshot();
}
await page.waitForTimeout(800);
await page.screenshot({ path: `${shotDir}/end.png` });

console.log(
  JSON.stringify(
    {
      strategy,
      outcome: s.phase,
      hp: s.hp,
      level: s.level,
      inventory: s.inventory,
      stats: s.stats,
      durationMs: Date.now() - t0,
      screenshots: shotDir,
    },
    null,
    2,
  ),
);
await browser.close();
