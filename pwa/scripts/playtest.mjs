#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Automated playtest harness (see the `playtest` skill). Drives the real
// game in headless Chromium through the app's `?bot=<strategy>` autoplay
// mode, takes screenshots into pwa/assets-preview/playtest/, and reports
// the run's outcome + stats as JSON on stdout.
//
// The strategies themselves live in the ENGINE (src/game/bot.ts) — the same
// bot that the headless tests drive — so this script is only a launcher and
// observer. Add new strategies there, not here.
//
// Usage:
//   npx vite --port 5199 &            # dev server (from pwa/)
//   node scripts/playtest.mjs [--url http://localhost:5199] \
//     [--strategy aggro|balanced|flee|survivor|rush|kite|boss] \
//     [--profile auto|melee|ranged|magic] [--timeout 120] \
//     [--difficulty easy|medium|hard|nightmare|jesus] \
//     [--level spacez_hq|moon|the_bunker|…] [--seed 42] [--speed 4] \
//       (any catalog level, SECRET levels included — forced via ?level=)
//     [--scenario '{"place":"boss","hp":2}']
//
// `--speed <n>` FAST-FORWARDS the run: the app simulates n× as many game-loop
// steps per frame, so a bot playtest finishes in a fraction of the wall-clock
// time (deterministic — the fixed timestep is preserved, so a fast-forwarded
// run is identical to a real-time one, just quicker). 1 = real time; the app
// clamps to [1, 16].
//
// `--scenario` forwards a ScenarioSpec (JSON) into the app's `?scenario=`
// param, staging the run into an exact situation before the bot takes over
// (see the test-scenario skill); `--seed` pins the layout so the staged
// situation reproduces exactly.
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
const profile = opt("profile", "auto");
const timeoutMs = Number(opt("timeout", "120")) * 1000;
// A fresh character (the harness always starts one) has only EASY unlocked —
// the ladder unlocks in order. Testing a harder rung needs a character that has
// already beaten the ones below it.
const difficulty = opt("difficulty", "easy");
// Which level to start on; the first level is always unlocked, so the bot
// can reach any level regardless of saved progress via the level-select menu.
const level = opt("level", "spacez_hq");
// A test scenario (JSON ScenarioSpec) and a pinned layout seed, forwarded to
// the app as `?scenario=` / `?seed=` (see docs/configuration.md).
const scenario = opt("scenario", "");
const seed = opt("seed", "");
// Fast-forward multiplier, forwarded to the app as `?speed=`: run the bot
// through the level faster (more sim steps per frame). Empty / 1 = real time.
const speed = opt("speed", "");

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
// steers, jumps, and spends level-ups on its own. The params survive the
// menu clicks below (no navigation happens), so the scenario and seed apply
// the moment the run is created.
// `?level=` is the app's dev override (docs/configuration.md): once a run
// starts it jumps to ANY catalog level and bypasses the campaign unlock gate,
// so it reaches SECRET levels (the_bunker) the mission picker never lists. We
// always forward it; the menu below only has to START some run, and this swaps
// in the requested level regardless of which button was clicked.
const extras =
  `&level=${encodeURIComponent(level)}` +
  (scenario ? `&scenario=${encodeURIComponent(scenario)}` : "") +
  (seed ? `&seed=${seed}` : "") +
  (profile && profile !== "auto" ? `&botProfile=${profile}` : "") +
  (speed && Number(speed) > 1 ? `&speed=${encodeURIComponent(speed)}` : "");
await page.goto(`${url}/?debug&bot=${strategy}${extras}`);
// The app opens on the Doom-style title menu. Wait for it (asset load) before
// shooting the splash, then PLAY → NEW GAME opens the character create form.
await page.getByRole("button", { name: "play", exact: true }).waitFor();
await page.screenshot({ path: `${shotDir}/title.png` });
await page.getByRole("button", { name: "play", exact: true }).click();
await page.getByRole("button", { name: "new-game" }).click();
// A fresh browser has no heroes, so the create form is shown: name one and
// CREATE it (softcore by default) to drop straight into the difficulty ladder.
await page.getByRole("textbox", { name: "character-name" }).waitFor();
await page.getByRole("textbox", { name: "character-name" }).fill("BOT");
await page.getByRole("button", { name: "character-create" }).click();
// The chosen difficulty rung, then the level.
await page.getByRole("button", { name: `difficulty-${difficulty}` }).waitFor();
await page.screenshot({ path: `${shotDir}/difficulty.png` });
await page.getByRole("button", { name: `difficulty-${difficulty}` }).click();
// An unbeaten difficulty walks straight into the campaign (no mission list) —
// the picker only opens once the rung is beaten. The requested level is forced
// by `?level=` regardless, so the menu only needs to START a run:
//   1. the level's own button, if the picker lists it (a beaten campaign rung);
//   2. else ANY level button, if a picker is showing but this level isn't in it
//      (a SECRET level like the_bunker — never listed — or a beaten rung);
//   3. else the walk-in auto-start (a fresh hero lands on the first level).
try {
  await page
    .getByRole("button", { name: `level-${level}` })
    .click({ timeout: 3000 });
} catch {
  // No button for this exact level. If a picker is showing, click any level to
  // start a run (?level= swaps in the requested one); otherwise it walked in.
  try {
    await page
      .getByRole("button", { name: /^level-/ })
      .first()
      .click({ timeout: 1500 });
  } catch {
    // Auto-started (walk-in) — verified against the requested level below.
  }
}
await page.waitForFunction(() => window.__game !== undefined);
const startedLevel = await page.evaluate(() => window.__game.level.id);
if (startedLevel !== level) {
  console.error(
    `PLAYTEST: requested level "${level}" but the run started "${startedLevel}" ` +
      `(the ?level= override should force it — check the id is a real catalog level)`,
  );
}

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
    s.phase === "levelup" ||
    s.phase === "dialogue") &&
  Date.now() - t0 < timeoutMs
) {
  if (!shotTaken && Date.now() - t0 > 1500) {
    await page.screenshot({ path: `${shotDir}/gameplay.png` });
    shotTaken = true;
  }
  // Story scenes (elite dialogue, the hero's thoughts) park the run for the
  // player's tap — tap through so a bot run measures fighting, not reading
  // (the first tap finishes the letter crawl, the next turns the page).
  if (s.phase === "dialogue") {
    await page.mouse.click(422, 195);
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
      profile,
      speed: speed && Number(speed) > 1 ? Number(speed) : 1,
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
