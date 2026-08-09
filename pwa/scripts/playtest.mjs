#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Automated playtest harness (see the `playtest` skill). Drives the real
// game in headless Chromium through the app's `?bot=<strategy>` autoplay
// mode, takes screenshots into pwa/assets-preview/playtest/, and reports
// the run's outcome + stats as JSON on stdout.
//
// The strategies themselves live in the ENGINE (engine/game/bot/index.ts) — the same
// bot that the headless tests drive — so this script is only a launcher and
// observer. Add new strategies there, not here.
//
// Usage:
//   npx vite --port 5199 &            # dev server (from pwa/)
//   node scripts/playtest.mjs [--url http://localhost:5199] \
//     [--strategy aggro|balanced|flee|survivor|rush|kite|boss] \
//     [--profile auto|melee|ranged|magic] [--timeout 120] \
//     [--difficulty easy|medium|hard|nightmare|jesus] \
//     [--level goodco_hq|moon|the_bunker|…] [--seed 42] [--speed 4] \
//       (any catalog level, SECRET levels included — forced via ?level=)
//     [--scenario '{"place":"boss","hp":2}'] [--pitch 0.5] [--yaw 45] \
//     [--antialias on|off] [--mod <dir>]
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
// `--mod <dir>` (repeatable) COMPILES that mod folder and plays the game with
// it: the same bundles the Steam build's MODS screen hands to `applyMods`, put
// in through the app's `?debug` `window.__mods` hook before the run starts. It
// is how a mod author playtests their own venue in the real renderer — the one
// instrument the browser build could not otherwise give them, since a browser
// has no Workshop and no filesystem. See mod/AGENTS.md.
//
// Playwright comes with `npm install`; only its browser binaries are separate:
// `npx playwright install chromium`.
//
// `window` below only appears inside page.evaluate callbacks, which execute
// in the browser page, not in Node.
/* global window */

import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

import { buildMod } from "../../mod/tools/build.mjs";
import { readCatalog } from "../../mod/tools/catalog-read.mjs";

const argv = process.argv.slice(2);
// The mods to play, compiled HERE rather than in the page: the browser has no
// YAML parser and never sees a mod's source, exactly as in the shipped app.
const modDirs = [];
const args = [];
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === "--mod") modDirs.push(path.resolve(argv[++i] ?? ""));
  else args.push(argv[i]);
}
const modBundles = modDirs.map((dir) => {
  const { bundle, errors } = buildMod(
    dir,
    readCatalog(
      fileURLToPath(new URL("../../mod/catalog.json", import.meta.url)),
    ),
  );
  if (!bundle) {
    for (const e of errors) console.error(`  ✗ ${e}`);
    console.error(
      `PLAYTEST: ${path.basename(dir)} does not compile — fix the ${errors.length} ` +
        "problem(s) above (`node mod/tools/cli.mjs check` prints the same list).",
    );
    process.exit(1);
  }
  return bundle;
});
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
const level = opt("level", "goodco_hq");
// A test scenario (JSON ScenarioSpec) and a pinned layout seed, forwarded to
// the app as `?scenario=` / `?seed=` (see docs/configuration.md).
const scenario = opt("scenario", "");
const seed = opt("seed", "");
// Fast-forward multiplier, forwarded to the app as `?speed=`: run the bot
// through the level faster (more sim steps per frame). Empty / 1 = real time.
const speed = opt("speed", "");
// THE CAMERA KNOBS (--pitch, --yaw): the world projection, dialled for this run
// (see AGENTS.md § THE WORLD PROJECTION). They are persisted DEVELOPER settings
// rather than URL params, so they are seeded into storage before the app boots
// — which is what `addInitScript` below does. Omit either to play on the
// shipped camera.
const pitch = opt("pitch", "");
const yaw = opt("yaw", "");
// ANTI-ALIASING (--antialias on|off): whether the art the yaw TURNS is smoothed
// as it bakes (see render/tilt.ts `projectionSmoothing`). Seeded the same way
// and only worth passing alongside a --yaw, since it is inert square-on.
const antialias = opt("antialias", "");

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
if (pitch || yaw || antialias) {
  // Written before any app code runs, so the engine flags are applied from it on
  // load exactly as they would be for a developer who flipped the switch.
  await page.addInitScript(
    ([camPitch, camYaw, camAntialias]) => {
      const KEY = "adas-trail:settings";
      let stored;
      try {
        stored = JSON.parse(localStorage.getItem(KEY) ?? "{}");
      } catch {
        stored = {};
      }
      localStorage.setItem(
        KEY,
        JSON.stringify({
          ...stored,
          developerUnlocked: true,
          ...(camPitch ? { cameraPitch: Number(camPitch) } : {}),
          ...(camYaw ? { cameraYaw: Number(camYaw) } : {}),
          ...(camAntialias ? { cameraAntialias: camAntialias } : {}),
        }),
      );
    },
    [pitch, yaw, antialias],
  );
}
page.on("pageerror", (e) => console.error("PAGE ERROR:", e.message));
// A frame that throws no longer escapes as an uncaught error — the game loop
// catches it, keeps the run alive, and reports it through the output channel
// (pwa/src/lib/game-loop.ts). That is right for a player and wrong for a
// playtest, so anything the app itself logs at error level (engine/output.ts
// stamps those with "✗") is surfaced here too: a broken frame must still fail
// loudly in automation. Third-party console noise is left out of it.
page.on("console", (m) => {
  if (m.type() === "error" && m.text().startsWith("✗")) {
    console.error("APP ERROR:", m.text());
  }
});

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
// shooting the splash; NEW GAME then opens the character create form. The row
// sits on the FRONT DOOR — there is no PLAY submenu to open first, since the
// play verbs were lifted onto the main screen when the tree moved into
// content/mainmenu.yaml.
await page.getByRole("button", { name: "new-game" }).waitFor();
await page.screenshot({ path: `${shotDir}/title.png` });
// The MODS, in load order, before any run exists: `applyMods` swaps the engine's
// active catalogs and merges the sprites, so the level picked below — and
// `?level=` forcing a mod's own venue — resolves against the modded game.
if (modBundles.length > 0) {
  await page.evaluate(async (bundles) => {
    if (!window.__mods) {
      throw new Error(
        "the app exposes no window.__mods hook — is this a dev build served " +
          "with ?debug (VITE_DEV_TOOLS on)?",
      );
    }
    await window.__mods(bundles);
  }, modBundles);
  console.error(
    `PLAYTEST: playing with ${modBundles.map((b) => `${b.name} ${b.version}`).join(", ")}`,
  );
}
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
    // A run carries a PARTY (`state.players`, seat order); seat 0 is the local
    // hero offline and for the host. `g.player` was the pre-party name and is
    // gone, so reading it silently threw and killed the harness.
    const hero = g.players[0];
    return {
      phase: g.phase,
      hp: hero.hp,
      level: hero.level,
      inventory: hero.inventory.filter(Boolean).length,
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
