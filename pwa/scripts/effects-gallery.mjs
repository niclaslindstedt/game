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
//     [--chrome] [--viewport 844x390]
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
// Absolute, so a relative `--out` still resolves for the `file://` load of the
// composited sheet below (a bare relative path made an invalid file URL).
const outDir = resolve(
  opt(
    "out",
    fileURLToPath(new URL("../assets-preview/effects", import.meta.url)),
  ),
);
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath:
    process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium",
});
// Mobile-first, landscape — the game's reference phone viewport by default.
const page = await browser.newPage({
  viewport: { width: viewW, height: viewH },
});
page.on("pageerror", (e) => console.error("PAGE ERROR:", e.message));

/** Open the gallery on `id` (empty = the head of the catalog) and settle it. */
const open = async (id) => {
  const q = speed === 1 ? "" : `&speed=${speed}`;
  await page.goto(`${url}/?effects=${encodeURIComponent(id)}${q}`);
  await page.locator("canvas.game-canvas").waitFor({ timeout: 20000 });
  // The staged diorama fires once on its own after a short opening beat; let
  // that pass so the shot below is the replay, not the opening volley.
  await page.waitForTimeout(1400);
};

// The catalog, read out of the running app so the sheet can never fall behind
// the code: the gallery's own search-with-no-terms is the whole list.
await open("");
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
console.log(
  `\nwrote ${shots.length} exhibits × ${frameCount} frames` +
    `${speed === 1 ? "" : ` at ${speed}× speed`}` +
    ` + sheet.html + sheet.png → ${outDir}`,
);
