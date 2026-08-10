#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// LOOK AT A SCORE — one of `content/music/*.yaml`, engraved as sheet music.
//
// The scores are the one part of this game's content nobody can review. A
// sprite has a preview, a level has a render, a weapon has a sheet of numbers —
// a track has eight hundred lines of note tokens in a YAML file, and the only
// way to know what is in it has been to play the whole two minutes and
// remember. This draws it: real staves, one per voice, so a section's shape can
// be read in a second and two voices can be checked against each other by eye.
//
// AND A SPECTRUM UNDER EVERY SYSTEM, because a staff is silent about the half
// of a chip track that decides whether it works: how loud each voice is, what
// its waveform puts above the note it is playing, and whether two of them are
// sitting in the same octave eating each other. The strip shares the staves'
// bar grid exactly, so a bar of music and its own energy are read as one
// column. It is COMPUTED from the patch parameters rather than recorded off the
// synth — see `asset-tools/spectrum.mjs` for what that does and does not
// cover.
//
//   node scripts/music-sheet.mjs overdue              the whole score
//   node scripts/music-sheet.mjs overdue --pattern=b  one section, big
//   node scripts/music-sheet.mjs --all                every track this build has
//   node scripts/music-sheet.mjs overdue --bars=2     wider bars, fewer per line
//   node scripts/music-sheet.mjs overdue --no-png     leave it as SVG
//   node scripts/music-sheet.mjs overdue --no-names   heads without their letters
//
// It reads the AUTHORED yaml through the same loader and the same schema the
// generator uses, so a sheet is of the track the game will actually play rather
// than of a second parse of it that could disagree.
//
// PNG BY WAY OF A BROWSER. The page is SVG — vector notation is the whole point
// — and the raster is a screenshot of it, because the machine has a Chromium
// for exactly this and nothing else here can turn a bezier into pixels. The SVG
// is always written; the PNG is best-effort and its absence is a warning rather
// than a failure.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { validateTrack } from "./asset-tools/music-schema.mjs";
import { engraveTrack } from "./asset-tools/notation.mjs";
import { cookTrack, loadMusic } from "./music-data/load-yaml.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const outDir = path.join(root, "pwa", "assets-preview");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit === undefined ? fallback : hit.slice(name.length + 3);
};
const has = (name) => args.includes(`--${name}`);
const ids = args.filter((a) => !a.startsWith("--"));

const { entries, errors } = loadMusic();
if (errors?.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

const wanted = has("all")
  ? entries
  : entries.filter(
      (e) => ids.includes(e.id) || (ids.length === 0 && e.id === "title"),
    );
if (wanted.length === 0) {
  console.error(
    `no such track. this build has: ${entries.map((e) => e.id).join(", ")}`,
  );
  process.exit(1);
}

const only = flag("pattern", undefined);
const barsPerSystem = Number(flag("bars", "4"));

mkdirSync(outDir, { recursive: true });
const pages = [];
for (const { id, doc } of wanted) {
  // The SAME schema the compiler runs. A sheet of a track that will not build
  // is a picture of something the game cannot play.
  const res = validateTrack(doc);
  if (res.errors.length > 0) {
    console.error(`${id}:\n  ${res.errors.join("\n  ")}`);
    process.exit(1);
  }
  const track = cookTrack(doc);
  const sheet = await engraveTrack(track, {
    title: doc.name ?? id,
    subtitle: only
      ? `${id} — section "${only}"`
      : (doc.description ?? "").trim().split("\n")[0],
    barsPerSystem,
    names: !has("no-names"),
    ...(only ? { only: [only] } : {}),
  });
  const stem = only ? `music_${id}_${only}` : `music_${id}`;
  const svgPath = path.join(outDir, `${stem}.svg`);
  writeFileSync(svgPath, sheet.svg);
  pages.push({ id, stem, svgPath, ...sheet });
  console.log(`wrote ${svgPath} (${sheet.width}x${sheet.height})`);
}

if (has("no-png")) process.exit(0);

// ── THE RASTER ───────────────────────────────────────────────────────────────
let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.warn("! playwright not installed — SVG only");
  process.exit(0);
}
const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_BROWSERS_PATH
    ? { executablePath: "/opt/pw-browsers/chromium" }
    : {}),
});
try {
  const scale = Number(flag("scale", "2"));
  for (const page of pages) {
    const tab = await browser.newPage({
      viewport: { width: page.width, height: Math.min(page.height, 2000) },
      deviceScaleFactor: scale,
    });
    await tab.setContent(
      `<body style="margin:0;background:#fbfaf6">${page.svg}</body>`,
    );
    const out = path.join(outDir, `${page.stem}.png`);
    await tab.screenshot({
      path: out,
      fullPage: true,
      // A tall score is one image on purpose — the whole reason to draw it is to
      // see the sections against each other.
      animations: "disabled",
    });
    await tab.close();
    console.log(`wrote ${out} (@${scale}x)`);
  }
} finally {
  await browser.close();
}
