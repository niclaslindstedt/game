#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// EFFECTS GALLERY contact sheet (see the `visual-effects` skill). Walks the
// developer gallery exhibit by exhibit through its `?effects=<id>` deep link,
// replays it, and screenshots each effect a beat into its show — so the whole
// FX catalog can be judged in one glance, and a re-tune can be diffed against
// the sheet it replaces.
//
// It drives the REAL gallery in the REAL game (the same staged scenarios a
// developer swipes through on a phone), so what the sheet shows is what ships.
//
// Usage (from pwa/, dev server on :5199 with assets built):
//   npx vite --port 5199 &
//   node scripts/effects-gallery.mjs [--url http://localhost:5199]
//     [--only nuke,levelup] [--at 110,420] [--out DIR]
//     [--chrome] [--viewport 844x390] [--pitch 0.5] [--yaw 45]
//
// `--at` is the comma-separated ms offsets after the replay to sample. Effects live on
// very different clocks — a bolt has strobed and gone in 150 ms while a nuke is
// still rolling smoke at 1.5 s — so the default takes an EARLY frame (the flash)
// and a LATE one (the aftermath) of each. `--only` is a comma-separated list of
// exhibit ids (see pwa/src/game/effects-gallery/).
//
// Writes numbered frames + a sheet.html contact sheet under
// pwa/assets-preview/effects/. Playwright is installed ephemerally:
//   npm install --no-save playwright
//
// `document` below only appears inside a page.evaluate callback (browser scope).
/* global document */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
/**
 * WHERE THE GAME IS SERVED — and, when nobody says, this script serves it
 * ITSELF.
 *
 * IT USED TO REQUIRE A DEV SERVER SOMEBODY ELSE HAD STARTED, which is the
 * single reason this tool went unused: the gallery is the review surface for
 * every visual change in the game, and reaching it meant knowing to run
 * `npx vite` in another shell on a port this script happened to default to.
 * A tool that needs a two-step incantation is a tool nobody reaches for at the
 * moment they need it.
 *
 * `--url` still points it at a server that is already up (faster, when you are
 * iterating and re-capturing); with no `--url` it starts one, waits for it, and
 * kills it on the way out. It must be the DEV server rather than `vite preview`
 * — the catalog is read by importing `/src/…` out of the running page, which is
 * a thing only the dev server can serve.
 */
const ownUrl = !args.includes("--url");
const url = opt("url", "http://localhost:5199");
// Keep the gallery's own chrome in frame (a UI review of the gallery itself,
// rather than a sheet of the effects it shows).
const chrome = args.includes("--chrome");
// The capture viewport, "WxH" — the mobile-first landscape reference by
// default (see the `ui-review` skill's nine).
const [viewW, viewH] = (opt("viewport", "844x390") ?? "")
  .split("x")
  .map((n) => Number(n));
const frames = (opt("at", "110,420") ?? "")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n >= 0)
  .sort((a, b) => a - b);
// Slow motion: the gallery's own `?speed=` (see EXHIBIT_SPEEDS). Every timing
// below stays in REAL ms — the point of slowing the sim is that the same wall
// clock now covers less of the effect, so the frames spread over its beats.
const speed = Number(opt("speed", "1")) || 1;
// A filmstrip of N frames evenly across the show, instead of `--at`'s fixed
// offsets. 0 = off.
const strip = Math.max(0, Math.floor(Number(opt("strip", "0")) || 0));
const only = (opt("only", "") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
// THE CAMERA KNOBS (--pitch, --yaw): shoot the catalog under a dialled world
// projection rather than the shipped one (see AGENTS.md § THE WORLD PROJECTION).
// An effect whose geometry is written in SCREEN terms but driven by a WORLD
// bearing looks right square-on and flies off at an angle once the camera is
// turned, and a contact sheet is the only practical way to see which ones do.
// They are persisted DEVELOPER settings rather than URL params, so they are
// seeded into storage before the app boots.
const pitch = opt("pitch", "");
const yaw = opt("yaw", "");
// Absolute, so a relative `--out` still resolves for the `file://` load of the
// composited sheet below (a bare relative path made an invalid file URL).
const outDir = resolve(
  opt(
    "out",
    fileURLToPath(new URL("../assets-preview/effects", import.meta.url)),
  ),
);
mkdirSync(outDir, { recursive: true });

/** Start the dev server, wait for it, and hand back how to stop it. */
async function serveOurselves() {
  const { spawn } = await import("node:child_process");
  const port = new URL(url).port || "5199";
  const child = spawn("npx", ["vite", "--port", port, "--strictPort"], {
    cwd: new URL("..", import.meta.url).pathname,
    stdio: "ignore",
  });
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${url}/`)).ok) return () => child.kill();
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  child.kill();
  throw new Error(`the dev server never came up on ${url}`);
}

const stopServer = ownUrl ? await serveOurselves() : () => {};

const browser = await chromium.launch({
  executablePath:
    process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium",
});
// Mobile-first, landscape — the game's reference phone viewport by default.
const page = await browser.newPage({
  viewport: { width: viewW, height: viewH },
});
page.on("pageerror", (e) => console.error("PAGE ERROR:", e.message));
if (pitch || yaw) {
  // Written before any app code runs, so the projection is applied from it on
  // load exactly as it would be for a developer who moved the sliders.
  await page.addInitScript(
    ([camPitch, camYaw]) => {
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
        }),
      );
    },
    [pitch, yaw],
  );
}

/** Which exhibit the page is currently showing, so a navigation that would
 * land where we already are is skipped — see the note on the catalog read. */
let showing = null;

/** Open the gallery on `id` (empty = the head of the catalog) and settle it. */
const open = async (id) => {
  if (showing === id) return;
  showing = id;
  const q = speed === 1 ? "" : `&speed=${speed}`;
  // `domcontentloaded` rather than the default `load`: the very next line waits
  // for the CANVAS, which is a far better proxy for "the gallery is running"
  // than every last module having settled. (Measured, it is not faster — the
  // cost is the app booting, not the navigation event — but it is the honest
  // signal to wait on.)
  await page.goto(`${url}/?effects=${encodeURIComponent(id)}${q}`, {
    waitUntil: "domcontentloaded",
  });
  // NINETY SECONDS, and it is the FIRST load that needs them. A cold dev server
  // optimizes the whole dependency graph on its first page request, which on
  // this app comfortably outruns a twenty-second wait — so the tool failed on
  // exactly the run where nobody had a server already warm, which is every run
  // that starts with `make gallery`.
  await page.locator("canvas.game-canvas").waitFor({ timeout: 90_000 });
  // The staged diorama fires once on its own after a short opening beat; let
  // that pass so the shot below is the replay, not the opening volley.
  await page.waitForTimeout(1400);
};

// The catalog, read out of the running app so the sheet can never fall behind
// the code: the gallery's own search-with-no-terms is the whole list.
//
// OPENED ON THE FIRST EXHIBIT WE ACTUALLY WANT, not on the head of the catalog.
// Booting this app in dev costs the better part of fifteen seconds — a few
// hundred unbundled modules, the sprite atlas, the audio graph — and it is paid
// per NAVIGATION. Landing on the catalog's first entry purely to read a list of
// ids and then navigating away spends one of those boots on nothing. Measured:
// it is a third of the wall clock of a single-exhibit capture, which is the
// shape every iteration loop actually uses.
await open(only[0] ?? "");
// …and the head of the catalog IS the first exhibit when nothing was filtered.
if (!only.length) showing = null;
const exhibits = await page.evaluate(async () => {
  const mod = await import("/src/game/effects-gallery/effects-catalog.ts");
  return mod.effectsCatalog().map((e) => ({
    id: e.id,
    label: e.label,
    group: e.group,
    // The exhibit's own show length — what `--strip` spreads its frames over.
    showMs: e.showMs ?? 1400,
  }));
});
const wanted = only.length
  ? exhibits.filter((e) => only.includes(e.id))
  : exhibits;
if (wanted.length === 0) {
  throw new Error(`no exhibit matched --only ${only.join(",")}`);
}

const shots = [];
// How many frames each exhibit gets — the filmstrip length, or the number of
// `--at` offsets. Used to size the composited sheet.
const frameCount = strip || frames.length;
for (const [i, exhibit] of wanted.entries()) {
  await open(exhibit.id);
  // Confirm the gallery actually landed on this exhibit before shooting it —
  // a typo'd id would otherwise silently sheet the catalog's first entry.
  const shown = await page.evaluate(
    () => document.querySelector(".gallery-caption")?.textContent ?? "",
  );
  // Strip the gallery's own chrome (the H key) so the sheet shows the effect
  // and nothing else — the labels live in the sheet's own captions. `--chrome`
  // keeps it in frame instead, for reviewing the gallery itself.
  if (!chrome) await page.keyboard.press("h");
  // Fire the show with the gallery's own replay key (Enter), and time every
  // frame off that press so the labelled offsets mean what they say however
  // slow the screenshot round-trip is.
  const t0 = Date.now();
  await page.keyboard.press("Enter");
  const names = [];
  // A filmstrip spreads its frames across the SHOW as the viewer sees it: the
  // show is authored in sim ms, and slow motion stretches that over more real
  // time, so the wall-clock window is `showMs / speed`. The first frame is
  // taken a hair in (a frame at 0 ms catches the tick before anything is
  // drawn) and the last just before the show ends.
  const window = exhibit.showMs / speed;
  const at_ = strip
    ? Array.from({ length: strip }, (_, k) =>
        Math.round(40 + (window - 40) * (k / Math.max(1, strip - 1))),
      )
    : frames;
  for (const at of at_) {
    const wait = at - (Date.now() - t0);
    if (wait > 0) await page.waitForTimeout(wait);
    const name =
      `${String(i + 1).padStart(2, "0")}-${exhibit.id}` +
      `-${String(at).padStart(4, "0")}ms.png`;
    await page.screenshot({ path: `${outDir}/${name}` });
    names.push({ at, name });
  }
  shots.push({ ...exhibit, names, shown });
  console.log(`${exhibit.id}  ${exhibit.group} · ${exhibit.label}`);
}

// A dark contact sheet, numbered like the art-audit sheets so a review can
// refer to "number 7" and everyone is looking at the same effect. Each row is
// ONE exhibit, its frames left to right — a filmstrip when `--strip` was used,
// the early/late pair otherwise.
const cells = shots
  .map(
    (s, i) =>
      `<figure>` +
      `<figcaption>${i + 1}. ${s.group} · ${s.label} — ` +
      `<code>${s.id}</code>${speed === 1 ? "" : ` · ${speed}× SPEED`}` +
      `</figcaption>` +
      `<div class="strip">` +
      s.names
        .map((f) => `<span><img src="${f.name}"/><b>${f.at} ms</b></span>`)
        .join("") +
      `</div></figure>`,
  )
  .join("\n");
const sheetHtml =
  `<!doctype html><meta charset="utf-8"><title>effects gallery</title>` +
  `<style>body{background:#0b0d10;color:#cdd3dc;font:13px system-ui;` +
  `margin:0;padding:14px;width:max-content}` +
  `figure{margin:0 0 14px}` +
  `.strip{display:flex;gap:6px}` +
  `.strip span{display:block}` +
  `.strip img{display:block;width:${Math.round(viewW / 2)}px;border:1px solid #222}` +
  `.strip b{display:block;font-weight:400;color:#7a828c;padding-top:2px}` +
  `figcaption{padding:0 0 4px}code{color:#7ef0c8}</style>${cells}`;
writeFileSync(`${outDir}/sheet.html`, sheetHtml);

// …and the same sheet composited into ONE image. An HTML sheet can't be looked
// at without a browser (or handed to a reviewer, or diffed against the sheet it
// replaces), so the page that was just written is loaded back into the same
// browser and shot full-page. One file, the whole catalog, in reading order.
const sheetPage = await browser.newPage({
  viewport: {
    width: Math.min(2400, 40 + frameCount * (viewW / 2 + 6)),
    height: 900,
  },
  deviceScaleFactor: 1,
});
await sheetPage.goto(pathToFileURL(`${outDir}/sheet.html`).href);
await sheetPage.waitForTimeout(400);
await sheetPage.screenshot({ path: `${outDir}/sheet.png`, fullPage: true });
await sheetPage.close();

await browser.close();
stopServer();
console.log(
  `\nwrote ${shots.length} exhibits × ${frameCount} frames` +
    `${speed === 1 ? "" : ` at ${speed}× speed`}` +
    ` + sheet.html + sheet.png → ${outDir}`,
);
