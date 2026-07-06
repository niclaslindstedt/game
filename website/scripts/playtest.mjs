#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Automated playtest bot (see the `playtest` skill). Drives the real game in
// headless Chromium through the `?debug` state hook (window.__game), takes
// screenshots into website/assets-preview/playtest/, and reports the run's
// outcome + stats as JSON on stdout.
//
// Usage:
//   npx vite --port 5199 &            # dev server (from website/)
//   node scripts/playtest.mjs [--url http://localhost:5199] [--strategy kite|rush|idle] [--timeout 120]
//
// Playwright is intentionally NOT a dependency of this repo; install it
// ephemerally when playtesting: `npm install --no-save playwright`.
//
// `window`/`document` below only appear inside page.evaluate callbacks,
// which execute in the browser page, not in Node.
/* global window, document */

import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const url = opt("url", "http://localhost:5199");
const strategy = opt("strategy", "kite");
const timeoutMs = Number(opt("timeout", "120")) * 1000;

const shotDir = fileURLToPath(
  new URL("../assets-preview/playtest", import.meta.url),
);
mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({
  executablePath:
    process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium",
});
const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
page.on("pageerror", (e) => console.error("PAGE ERROR:", e.message));

await page.goto(`${url}/?debug`);
await page.screenshot({ path: `${shotDir}/title.png` });
await page.getByRole("button", { name: /start game/i }).click();
await page.waitForFunction(() => window.__game !== undefined);

const snapshot = () =>
  page.evaluate(() => {
    const g = window.__game;
    return {
      phase: g.phase,
      hp: g.player.hp,
      player: { x: g.player.pos.x, y: g.player.pos.y },
      enemies: g.enemies.map((e) => ({ x: e.pos.x, y: e.pos.y })),
      level: g.level,
      stats: g.stats,
    };
  });

/** World → viewport CSS coords (replicates computeCamera + the CSS scale). */
const toScreen = (wx, wy) =>
  page.evaluate(
    ([wx, wy]) => {
      const canvas = document.querySelector("canvas.game-canvas");
      const rect = canvas.getBoundingClientRect();
      const g = window.__game;
      const clampAxis = (center, view, level) =>
        view >= level
          ? Math.round((level - view) / 2)
          : Math.round(Math.min(Math.max(center - view / 2, 0), level - view));
      const camX = clampAxis(g.player.pos.x, canvas.width, g.level.width);
      const camY = clampAxis(g.player.pos.y, canvas.height, g.level.height);
      return [
        rect.left + ((wx - camX) * rect.width) / canvas.width,
        rect.top + ((wy - camY) * rect.height) / canvas.height,
      ];
    },
    [wx, wy],
  );

async function steerToward(wx, wy) {
  const [sx, sy] = await toScreen(wx, wy);
  const x = Math.min(1010, Math.max(10, sx));
  const y = Math.min(630, Math.max(10, sy));
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y);
}

const nearest = (s) =>
  s.enemies.reduce((a, b) => {
    const da = (a.x - s.player.x) ** 2 + (a.y - s.player.y) ** 2;
    const db = (b.x - s.player.x) ** 2 + (b.y - s.player.y) ** 2;
    return da < db ? a : b;
  });

/** One steering decision per tick, by strategy. */
async function act(s) {
  if (s.enemies.length === 0 || strategy === "idle") return;
  if (strategy === "rush") {
    const n = nearest(s);
    await steerToward(n.x, n.y);
    return;
  }
  // kite: hold ~180 world units off the nearest slime — inside weapon range
  // (260), outside contact range.
  const n = nearest(s);
  const dx = s.player.x - n.x;
  const dy = s.player.y - n.y;
  const d = Math.hypot(dx, dy) || 1;
  await steerToward(
    Math.min(s.level.width - 20, Math.max(20, n.x + (dx / d) * 180)),
    Math.min(s.level.height - 20, Math.max(20, n.y + (dy / d) * 180)),
  );
}

let s = await snapshot();
const t0 = Date.now();
let shotTaken = false;
while (s.phase === "playing" && Date.now() - t0 < timeoutMs) {
  await act(s);
  if (!shotTaken && Date.now() - t0 > 1500) {
    await page.screenshot({ path: `${shotDir}/gameplay.png` });
    shotTaken = true;
  }
  await page.waitForTimeout(200);
  s = await snapshot();
}
await page.mouse.up();
await page.waitForTimeout(800);
await page.screenshot({ path: `${shotDir}/end.png` });

console.log(
  JSON.stringify(
    {
      strategy,
      outcome: s.phase,
      hp: s.hp,
      stats: s.stats,
      durationMs: Date.now() - t0,
      screenshots: shotDir,
    },
    null,
    2,
  ),
);
await browser.close();
