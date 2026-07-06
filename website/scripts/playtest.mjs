#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Automated playtest bot (see the `playtest` skill). Drives the real game in
// headless Chromium through the `?debug` state hook (window.__game), takes
// screenshots into website/assets-preview/playtest/, and reports the run's
// outcome + stats as JSON on stdout.
//
// Usage:
//   npx vite --port 5199 &            # dev server (from website/)
//   node scripts/playtest.mjs [--url http://localhost:5199] [--strategy kite|rush|boss|idle] [--timeout 120]
//
// Strategies: `kite` circles the nearest ghost at weapon range, `rush` walks
// straight into it, `boss` beelines for the flag and fights ARMSTRONG,
// `survivor` plays the horde properly — flees the pack's centroid, detours
// through pickups, and pushes for the boss once levelled (the strategy that
// should win), `idle` stands there and dies.
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

// Dismiss the level's story intro to start the run.
await page.screenshot({ path: `${shotDir}/intro.png` });
await page.getByRole("button", { name: "start-level" }).click();

const snapshot = () =>
  page.evaluate(() => {
    const g = window.__game;
    return {
      phase: g.phase,
      hp: g.player.hp,
      level: g.player.level,
      xp: g.player.xp,
      inventory: g.player.inventory.filter(Boolean).length,
      player: { x: g.player.pos.x, y: g.player.pos.y, z: g.player.z },
      enemies: g.enemies.map((e) => ({
        x: e.pos.x,
        y: e.pos.y,
        defId: e.defId,
        hp: e.hp,
      })),
      items: g.items.map((i) => ({ x: i.pos.x, y: i.pos.y, kind: i.kind })),
      flag: g.landmarks.find((l) => l.kind === "flag")?.pos ?? null,
      level_: g.level,
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

/** Spend banked level-up points; the run stays paused until they're spent. */
async function handleLevelUp() {
  for (let i = 0; i < 10; i++) {
    const s = await snapshot();
    if (s.phase !== "levelup") return;
    // Alternate DEX (the starting blaster scales with it) and HEALTH —
    // horde play needs the damage AND the hp to wade through the pack.
    const label = s.level % 2 === 0 ? "stat-dexterity" : "stat-health";
    await page.mouse.up();
    await page.getByRole("button", { name: label }).click();
    await page.waitForTimeout(100);
  }
}

const nearest = (s) =>
  s.enemies.reduce((a, b) => {
    const da = (a.x - s.player.x) ** 2 + (a.y - s.player.y) ** 2;
    const db = (b.x - s.player.x) ** 2 + (b.y - s.player.y) ** 2;
    return da < db ? a : b;
  });

/** Steer to `boss`-strategy targets: beeline the flag, kite ARMSTRONG. */
async function pushBoss(s) {
  const boss = s.enemies.find((e) => e.defId === "armstrong");
  const target = boss ?? s.flag;
  if (!target) return;
  const dx = s.player.x - target.x;
  const dy = s.player.y - target.y;
  const d = Math.hypot(dx, dy) || 1;
  if (d > 240) {
    await steerToward(target.x, target.y);
  } else {
    await steerToward(
      Math.min(s.level_.width - 20, Math.max(20, target.x + (dx / d) * 180)),
      Math.min(s.level_.height - 20, Math.max(20, target.y + (dy / d) * 180)),
    );
  }
}

/** One steering decision per tick, by strategy. */
async function act(s) {
  if (s.enemies.length === 0 || strategy === "idle") return;
  if (strategy === "rush") {
    const n = nearest(s);
    await steerToward(n.x, n.y);
    return;
  }
  if (strategy === "survivor") {
    // Competent horde play: levelled and armed → go end it at the flag
    // before the flood peaks, hopping over the pack (airborne = untouchable).
    if (s.level >= 6) {
      if (s.player.z === 0) await page.keyboard.press("Space");
      await pushBoss(s);
      return;
    }
    // A pickup nearby with breathing room → scoop it up.
    const n = nearest(s);
    const nd = Math.hypot(n.x - s.player.x, n.y - s.player.y);
    const item = s.items
      .map((i) => ({ ...i, d: Math.hypot(i.x - s.player.x, i.y - s.player.y) }))
      .sort((a, b) => a.d - b.d)[0];
    if (item && item.d < 240 && nd > 60) {
      await steerToward(item.x, item.y);
      return;
    }
    // Otherwise flee the centroid of the local pack, not just one ghost —
    // the ring spawner punishes tunnel vision.
    const near = s.enemies.filter(
      (e) => Math.hypot(e.x - s.player.x, e.y - s.player.y) < 300,
    );
    if (near.length === 0) return;
    const cx = near.reduce((sum, e) => sum + e.x, 0) / near.length;
    const cy = near.reduce((sum, e) => sum + e.y, 0) / near.length;
    const dx = s.player.x - cx;
    const dy = s.player.y - cy;
    const d = Math.hypot(dx, dy) || 1;
    await steerToward(
      Math.min(s.level_.width - 20, Math.max(20, s.player.x + (dx / d) * 200)),
      Math.min(s.level_.height - 20, Math.max(20, s.player.y + (dy / d) * 200)),
    );
    return;
  }
  if (strategy === "boss") {
    // Beeline for the flag; once the boss is close, kite him instead.
    await pushBoss(s);
    return;
  }
  // kite: hold ~180 world units off the nearest ghost — inside blaster range
  // (260), outside contact range.
  const n = nearest(s);
  const dx = s.player.x - n.x;
  const dy = s.player.y - n.y;
  const d = Math.hypot(dx, dy) || 1;
  await steerToward(
    Math.min(s.level_.width - 20, Math.max(20, n.x + (dx / d) * 180)),
    Math.min(s.level_.height - 20, Math.max(20, n.y + (dy / d) * 180)),
  );
}

let s = await snapshot();
const t0 = Date.now();
let shotTaken = false;
while (
  (s.phase === "playing" || s.phase === "levelup") &&
  Date.now() - t0 < timeoutMs
) {
  if (s.phase === "levelup") {
    await handleLevelUp();
    s = await snapshot();
    continue;
  }
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
