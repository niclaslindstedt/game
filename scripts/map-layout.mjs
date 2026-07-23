#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The MAP LAYOUT renderer (see the `map-improvement` + `level-design` skills):
// a CLEAN, HIGH-RESOLUTION, top-down VISUAL OVERVIEW of a level's authored
// layout — the picture you look at (alongside reading the YAML) to understand a
// map before touching it. It shows only what benefits from being SEEN; the
// numbers live in the YAML and are not repeated here.
//
// On the image: a labelled COORDINATE GRID for orientation, every wall + gap,
// the authored hero path (numbered), the design zones, and every placed thing as
// a DISTINCT SHAPE (star=boss, diamond=elite, triangle=rare/unique, circle=spawn
// knot, cluster=pack, square=chest, +=item, …). SPAWN POINTS render as CON
// CIRCLES: the circle AREA scales with the mob count, and its COLOUR is the con
// — the mob level vs the map's intended hero level (`intendedLevel` in the YAML)
// on the chosen difficulty — so an over/under-tuned difficulty ramp reads at a
// glance (grey trivial → green → yellow even → orange → red brutal). Every mob
// marker is coloured the same way; shape tells you WHAT, colour tells you HOW
// HARD. The side panel is a DECODE KEY only (shapes + the con ramp).
//
//   node scripts/map-layout.mjs <id>                 one level
//   node scripts/map-layout.mjs --all                every level
//   node scripts/map-layout.mjs <id> --difficulty hard   con vs that rung
//   node scripts/map-layout.mjs <id> --seed 1        + scatter obstacles
//   node scripts/map-layout.mjs <id> --width 1800    bigger map area (px)
//   node scripts/map-layout.mjs <id> --highlight "1240,380;2010,660"
//   node scripts/map-layout.mjs <id> --deaths "1240,380:raider;2010,660"
//   node scripts/map-layout.mjs <id> --highlight-file report.json
//
// HIGHLIGHTS mark arbitrary world coordinates on the render — built for the
// simulator's STUCK AREAS (simulate-run.mjs --stuck-limit prints the exact
// --highlight command), but any probe coordinates work. --highlight takes
// inline `x,y[:label]` pairs separated by `;`. DEATHS mark where the
// simulated hero DIED (simulate-run.mjs's DEATHS table prints the exact
// --deaths command): red † markers, disc area ∝ deaths in the cluster,
// labelled D1, D2, … with the killer — same `x,y[:label]` syntax (the label
// may itself contain `:`, e.g. `hazard:asteroid`). --highlight-file takes a
// JSON file: a plain array of {x, y, label?, count?} (or [x, y] pairs), OR a
// simulate-run --json dump — its runs matching this level contribute their
// stuck.areas as highlights AND their deathLog.areas as death markers
// automatically.
//
// Output → pwa/assets-preview/map_<id>_layout.png. Also `make map-layout
// LEVEL=<id>`.
//
// The rendering lives in `scripts/map-layout/` (palette + con ramp, shapes,
// canvas, the map drawers, the overlays, the decode key); this entry parses
// the CLI and orchestrates a render per level.

import { mkdirSync } from "node:fs";

import { writePng } from "./asset-tools/preview.mjs";
import { upscale } from "./asset-tools/surface.mjs";
import { loadLevels } from "./level-data/load-yaml.mjs";
import { engine } from "./map-layout/engine.mjs";
import { C, DIFF_IDX } from "./map-layout/palette.mjs";
import { PAD, makeCanvas, gridStep } from "./map-layout/canvas.mjs";
import { label } from "./map-layout/shapes.mjs";
import {
  drawGrid,
  drawZones,
  drawWalls,
  drawPath,
  drawSpawners,
  drawEncounters,
  placeLabels,
} from "./map-layout/draw-map.mjs";
import {
  parseHighlights,
  parseDeaths,
  drawDeaths,
  drawHighlights,
  drawObstacles,
} from "./map-layout/overlays.mjs";
import { buildKey, keyHeight, drawKey } from "./map-layout/key.mjs";

const previewDir = engine("pwa/assets-preview");
mkdirSync(previewDir, { recursive: true });

// ---- entry -----------------------------------------------------------------
async function renderLevel(entry, opts) {
  const { def, campaign, secret } = entry;
  const diff = DIFF_IDX[opts.difficulty] != null ? opts.difficulty : "easy";
  const highlights = parseHighlights(opts, def.id);
  const deaths = parseDeaths(opts, def.id);
  const rows = buildKey(
    def,
    { campaign, secret },
    diff,
    highlights.length,
    deaths.length,
  );
  const c = makeCanvas(def, opts.width, keyHeight(rows));
  c.labels = [];
  label(
    c.surf,
    `MAP LAYOUT - ${def.name} - ${def.id} - GRID ${gridStep(def)}U - CON vs ${diff.toUpperCase()}`,
    PAD,
    PAD - 1,
    C.ink,
  );
  drawGrid(c);
  drawZones(c);
  if (opts.seed != null) await drawObstacles(c, opts.seed, opts.difficulty);
  drawWalls(c);
  drawPath(c);
  drawSpawners(c, diff);
  drawEncounters(c, diff);
  drawHighlights(c, highlights);
  drawDeaths(c, deaths);
  placeLabels(c);
  drawKey(c, rows);
  const out = `${previewDir}/map_${def.id}_layout.png`;
  await writePng(upscale(c.surf, 2), out);
  console.log(
    `wrote ${out} (${c.width}×${c.height} @2x = ${c.width * 2}×${c.height * 2})`,
  );
}

function parseArgs(argv) {
  const opts = { width: 1400, difficulty: "easy", all: false, seed: null };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--all") opts.all = true;
    else if (a === "--seed") opts.seed = Number(argv[++i]);
    else if (a === "--difficulty") opts.difficulty = argv[++i];
    else if (a === "--width") opts.width = Number(argv[++i]);
    else if (a === "--highlight") opts.highlight = argv[++i];
    else if (a === "--deaths") opts.deaths = argv[++i];
    else if (a === "--highlight-file") opts.highlightFile = argv[++i];
    else rest.push(a);
  }
  opts.id = rest[0];
  return opts;
}

const { entries } = loadLevels();
const opts = parseArgs(process.argv.slice(2));

if (opts.all) {
  for (const entry of entries) await renderLevel(entry, opts);
} else {
  const entry = entries.find((e) => e.id === opts.id);
  if (!entry) {
    console.error(
      `unknown level "${opts.id}" — try: ${entries.map((e) => e.id).join(", ")}`,
    );
    process.exit(1);
  }
  await renderLevel(entry, opts);
}
