// Recipe generator for EASTWORLD town buildings. Emits one self-describing
// sprite YAML per building into scripts/sprites/eastworld/. Deterministic
// (no RNG): the grids only change when this recipe does, so the atlas stays
// diff-stable. Run: `node scripts/gen-eastworld-buildings.mjs`.
//
// The eastworld building look is an OBLIQUE structure seen from front-above: a
// ridge highlight, a shingle/tin roof band with vertical seams, an eave shadow,
// then a plank/adobe/stone facade carrying amber windows and a dark door, all
// wrapped in a dark (not black) outline. This file composes that look into a
// varied Main Street cast (saloon, church, bank, hotel, general store, sheriff's
// office, livery barn) so the town reads as a real frontier settlement.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "sprites",
  "eastworld",
);

// ── grid helpers ────────────────────────────────────────────────────────────
const makeGrid = (w, h, fill = ".") =>
  Array.from({ length: h }, () => Array.from({ length: w }, () => fill));

const rect = (g, x0, y0, x1, y1, ch) => {
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++)
      if (g[y] && g[y][x] !== undefined) g[y][x] = ch;
};
const hline = (g, x0, x1, y, ch) => rect(g, x0, y, x1, y, ch);
const vline = (g, x, y0, y1, ch) => rect(g, x, x === x ? y0 : y0, x, y1, ch);
const px = (g, x, y, ch) => {
  if (g[y] && g[y][x] !== undefined) g[y][x] = ch;
};

// Outline the rectangle border (dark O frame).
const frame = (g, x0, y0, x1, y1, ch = "O") => {
  hline(g, x0, x1, y0, ch);
  hline(g, x0, x1, y1, ch);
  for (let y = y0; y <= y1; y++) {
    px(g, x0, y, ch);
    px(g, x1, y, ch);
  }
};

// A roof band from row y0..y1: ridge highlight on the top row, shingle field
// below with vertical seams every `seam` cells. `roof` is the shingle char,
// `ridge` the highlight, `seam` char defaults to outline.
const roofBand = (g, x0, y0, x1, y1, roof, ridge, seamCh = "O", seam = 6) => {
  rect(g, x0, y0, x1, y1, roof);
  hline(g, x0, x1, y0, ridge); // peak highlight catches the top-left light
  for (let x = x0 + seam; x < x1; x += seam) vline(g, x, y0 + 1, y1, seamCh);
};

// A window: an amber pane inset in a dark trim frame. Rows yr0..yr1, cols xc0..xc1.
const window = (g, xc0, yr0, xc1, yr1, pane = "U", trim = "E") => {
  frame(g, xc0 - 1, yr0 - 1, xc1 + 1, yr1 + 1, trim);
  rect(g, xc0, yr0, xc1, yr1, pane);
};

// Vertical jail bars (dark) laid over an amber pane.
const barredWindow = (g, xc0, yr0, xc1, yr1) => {
  window(g, xc0, yr0, xc1, yr1);
  for (let x = xc0; x <= xc1; x += 2) vline(g, x, yr0, yr1, "K");
};

const toYaml = ({ name, size, description, subject, palette, grid }) => {
  const pal = Object.entries(palette)
    .map(([k, [hex, note]]) => `  ${k}: "${hex}" # ${note}`)
    .join("\n");
  const body = grid.map((row) => "  " + row.join("")).join("\n");
  const subj = subject
    ? "subject:\n" +
      Object.entries(subject)
        .map(([k, v]) => `  ${k}: ${v}`)
        .join("\n") +
      "\n"
    : "";
  return `name: ${name}
family: eastworld
size: [${size[0]}, ${size[1]}]
description: >
  ${description}
${subj}palette:
${pal}
grid: |
${body}
`;
};

// Shared palette entries (concrete hex, top-left lit).
const P = {
  O: ["#1a1c2c", "outline"],
  v: ["#60687e", "roof ridge highlight"],
  N: ["#3a3644", "grey shingle roof"],
  R: ["#7a3b2e", "red barn roof"],
  r: ["#symbol", ""], // placeholder, unused
  T: ["#566070", "tin roof"],
  W: ["#9aa0ac", "whitewash roof"],
  B: ["#92643e", "plank wall brown"],
  A: ["#c9a878", "adobe wall tan"],
  G: ["#8c8f98", "grey stone wall"],
  H: ["#d7ccb4", "whitewashed wall"],
  E: ["#5d4028", "dark timber trim"],
  e: ["#6b6152", "stone/adobe trim"],
  S: ["#b39378", "pale plank highlight"],
  U: ["#f0c658", "amber window light"],
  K: ["#0c0b12", "dark doorway"],
  X: ["#963c46", "red sign / paint accent"],
  D: ["#3d2a1a", "double-door timber"],
};
delete P.r;
// Pick just the palette keys a given grid uses.
const usedPalette = (grid) => {
  const used = new Set();
  for (const row of grid) for (const c of row) if (c !== ".") used.add(c);
  const out = {};
  for (const k of Object.keys(P)) if (used.has(k)) out[k] = P[k];
  return out;
};

const buildings = [];

// ── SALOON — the anchor: two-story, tall FALSE FRONT (flat top, no peak), a big
// amber SALOON sign band, double swing doors, two rows of windows. ────────────
(function saloon() {
  const w = 60,
    h = 60;
  const g = makeGrid(w, h);
  rect(g, 1, 1, w - 2, h - 2, "B"); // whole facade (false front is flat)
  frame(g, 0, 0, w - 1, h - 1);
  // false-front cornice: a stepped trim cap along the top
  rect(g, 1, 1, w - 2, 3, "E");
  hline(g, 2, w - 3, 2, "S");
  // SALOON sign band (amber with red trim)
  rect(g, 6, 6, w - 7, 12, "X");
  rect(g, 8, 8, w - 9, 10, "U");
  // upper-storey windows (row of 4)
  for (let i = 0; i < 4; i++) {
    const x = 8 + i * 12;
    window(g, x, 18, x + 5, 23);
  }
  // trim band between storeys
  rect(g, 1, 27, w - 2, 28, "E");
  hline(g, 2, w - 3, 27, "S");
  // ground-floor windows flanking the doors
  window(g, 6, 34, 13, 41);
  window(g, w - 14, 34, w - 7, 41);
  // porch posts / trim
  rect(g, 1, 46, w - 2, 47, "E");
  // double swing doors (batwing): two dark leaves with a centre gap
  rect(g, 24, 48, 28, h - 2, "D");
  rect(g, 31, 48, 35, h - 2, "D");
  frame(g, 23, 47, 36, h - 1, "E");
  buildings.push({
    name: "saloon",
    size: [w, h],
    description:
      "A two-storey frontier SALOON with a tall flat FALSE FRONT, a glowing amber SALOON sign, rows of warm-lit windows and double batwing doors — the town's anchor building, seen from front-above.",
    subject: {
      kind: "building — western saloon",
      build: "two-storey with a tall flat false-front parapet",
      features:
        "an amber SALOON sign band, two rows of warm windows, central double batwing doors",
      accent: "the amber sign against brown planks",
      flavor: "the loudest building on main street",
    },
    grid: g,
  });
})();

// ── CHURCH — white chapel with a central STEEPLE rising above the roof, tall
// arched amber windows. Unmistakable silhouette. ─────────────────────────────
(function church() {
  const w = 44,
    h = 60;
  const g = makeGrid(w, h);
  // STEEPLE: a narrow tower rising from the top centre
  const sx0 = w / 2 - 4,
    sx1 = w / 2 + 3;
  roofBand(g, sx0, 2, sx1, 5, "W", "v", "O", 4); // spire cap
  rect(g, sx0, 6, sx1, 15, "H"); // tower shaft (whitewash)
  frame(g, sx0, 6, sx1, 15);
  window(g, w / 2 - 1, 9, w / 2, 12); // belfry opening (amber bell glow)
  // main gabled roof
  roofBand(g, 1, 16, w - 2, 24, "W", "v", "O", 6);
  frame(g, 0, 16, w - 1, h - 1);
  hline(g, 1, w - 2, 25, "e"); // eave
  // whitewashed nave wall
  rect(g, 1, 26, w - 2, h - 2, "H");
  // tall arched windows down the sides
  for (const x of [6, w - 12]) {
    window(g, x, 30, x + 4, 44);
    px(g, x, 29, "U"); // arched top
    px(g, x + 4, 29, "U");
  }
  // double church doors
  rect(g, w / 2 - 3, 46, w / 2 + 2, h - 2, "D");
  frame(g, w / 2 - 4, 45, w / 2 + 3, h - 1, "e");
  buildings.push({
    name: "church",
    size: [w, h],
    description:
      "A whitewashed frontier CHURCH with a central bell STEEPLE rising above a gabled roof, tall arched amber windows and double doors — a pale landmark against the dust.",
    subject: {
      kind: "building — frontier church",
      build: "a gabled hall with a tall central steeple/bell tower",
      features: "arched amber side windows, a belfry opening, double doors",
      accent: "amber window glow in whitewashed timber",
      flavor: "the one clean-painted building in a dusty town",
    },
    grid: g,
  });
})();

// ── BANK — squat grey stone building, pilaster columns, small barred windows,
// a heavy central door. Reads solid and moneyed. ─────────────────────────────
(function bank() {
  const w = 52,
    h = 44;
  const g = makeGrid(w, h);
  roofBand(g, 1, 1, w - 2, 6, "T", "v", "O", 8); // low tin roof
  frame(g, 0, 0, w - 1, h - 1);
  hline(g, 1, w - 2, 7, "e");
  rect(g, 1, 8, w - 2, h - 2, "G"); // grey stone wall
  // pilaster columns (vertical stone highlights)
  for (let x = 6; x < w - 4; x += 10) vline(g, x, 9, h - 2, "e");
  // a red "BANK" sign band
  rect(g, w / 2 - 9, 10, w / 2 + 8, 13, "X");
  // small barred windows either side
  barredWindow(g, 10, 20, 14, 26);
  barredWindow(g, w - 15, 20, w - 11, 26);
  // heavy central door
  rect(g, w / 2 - 3, 30, w / 2 + 2, h - 2, "K");
  frame(g, w / 2 - 4, 29, w / 2 + 3, h - 1, "e");
  buildings.push({
    name: "bank",
    size: [w, h],
    description:
      "A squat grey stone BANK with pilaster columns, a red sign band, small barred windows and a heavy central door — the solid, moneyed corner of main street.",
    subject: {
      kind: "building — frontier bank",
      build: "a low, wide, solid stone box",
      features:
        "pilaster columns, a red sign band, barred windows, a heavy door",
      accent: "the red sign against grey stone",
      flavor: "the one building the robots guard",
    },
    grid: g,
  });
})();

// ── HOTEL — long two-storey building, a grid of many windows, tan adobe. ──────
(function hotel() {
  const w = 68,
    h = 48;
  const g = makeGrid(w, h);
  roofBand(g, 1, 1, w - 2, 7, "N", "v", "O", 6);
  frame(g, 0, 0, w - 1, h - 1);
  hline(g, 1, w - 2, 8, "E");
  rect(g, 1, 9, w - 2, h - 2, "A"); // adobe/tan wall
  // sign band
  rect(g, w / 2 - 10, 10, w / 2 + 9, 12, "X");
  // two rows of windows
  for (const yr of [16, 30]) {
    for (let i = 0; i < 5; i++) {
      const x = 7 + i * 12;
      window(g, x, yr, x + 4, yr + 5);
    }
    rect(g, 1, yr + 8, w - 2, yr + 8, "e"); // storey trim
  }
  // central door
  rect(g, w / 2 - 2, h - 8, w / 2 + 1, h - 2, "K");
  frame(g, w / 2 - 3, h - 9, w / 2 + 2, h - 1, "e");
  buildings.push({
    name: "hotel",
    size: [w, h],
    description:
      "A long two-storey tan adobe HOTEL with a red sign band and an even grid of many warm-lit windows — the biggest lodging on main street.",
    subject: {
      kind: "building — frontier hotel",
      build: "a long, wide two-storey block",
      features:
        "a red sign band and a regular grid of warm windows over two floors",
      accent: "amber windows in tan adobe",
      flavor: "rooms to let, robots don't sleep",
    },
    grid: g,
  });
})();

// ── GENERAL STORE — a shopfront with a striped PORCH AWNING over the front,
// signage, amber windows, a door. ────────────────────────────────────────────
(function generalStore() {
  const w = 52,
    h = 40;
  const g = makeGrid(w, h);
  roofBand(g, 1, 1, w - 2, 6, "N", "v", "O", 6);
  frame(g, 0, 0, w - 1, h - 1);
  rect(g, 1, 7, w - 2, h - 2, "B"); // plank wall, right under the roof eave
  hline(g, 1, w - 2, 7, "E"); // eave shadow line
  // painted sign band on the wall
  rect(g, w / 2 - 12, 9, w / 2 + 11, 12, "X");
  // striped porch awning band across the front
  for (let x = 1; x <= w - 2; x++) g[14][x] = x % 2 ? "X" : "S";
  rect(g, 1, 15, w - 2, 15, "E");
  // shop windows flanking the door
  window(g, 6, 21, 15, 31);
  window(g, w - 16, 21, w - 7, 31);
  // door
  rect(g, w / 2 - 2, 23, w / 2 + 1, h - 2, "K");
  frame(g, w / 2 - 3, 22, w / 2 + 2, h - 1, "E");
  buildings.push({
    name: "general_store",
    size: [w, h],
    description:
      "A frontier GENERAL STORE with a striped porch awning across the front, a painted sign, big amber shop windows and a central door — the trading post look.",
    subject: {
      kind: "building — general store",
      build: "a single-storey shopfront with a covered porch",
      features:
        "a striped awning band, a painted sign, wide shop windows, a door",
      accent: "red-and-cream awning stripes",
      flavor: "everything a robot cowboy could want",
    },
    grid: g,
  });
})();

// ── SHERIFF'S OFFICE / JAIL — small, tin-roofed, BARRED windows, a star. ──────
(function sheriff() {
  const w = 44,
    h = 36;
  const g = makeGrid(w, h);
  roofBand(g, 1, 1, w - 2, 6, "T", "v", "O", 7); // tin roof
  frame(g, 0, 0, w - 1, h - 1);
  hline(g, 1, w - 2, 7, "E");
  rect(g, 1, 8, w - 2, h - 2, "B");
  // a tin sheriff's STAR over the door
  const cx = w / 2,
    cy = 13;
  px(g, cx, cy - 2, "U");
  hline(g, cx - 2, cx + 2, cy, "U");
  vline(g, cx, cy - 2, cy + 2, "U");
  px(g, cx - 2, cy + 2, "U");
  px(g, cx + 2, cy + 2, "U");
  // barred jail windows
  barredWindow(g, 6, 18, 12, 24);
  barredWindow(g, w - 13, 18, w - 7, 24);
  // door
  rect(g, cx - 2, 26, cx + 1, h - 2, "K");
  frame(g, cx - 3, 25, cx + 2, h - 1, "E");
  buildings.push({
    name: "sheriff_office",
    size: [w, h],
    description:
      "A small tin-roofed SHERIFF'S OFFICE and jail with a gold star over the door and barred windows — the law of a town that has none.",
    subject: {
      kind: "building — sheriff's office / jail",
      build: "a small squat single-storey box",
      features: "a tin roof, a gold star over the door, barred jail windows",
      accent: "the gold star",
      flavor: "the jail is full of decommissioned hosts",
    },
    grid: g,
  });
})();

// ── LIVERY BARN — big rust-red GAMBREL roof, tall double hay doors, a loft
// window. The stable at the edge of town. ────────────────────────────────────
(function barn() {
  const w = 60,
    h = 52;
  const g = makeGrid(w, h);
  // gambrel roof: two pitches (ridge + a wide red field, seams)
  roofBand(g, 1, 1, w - 2, 12, "R", "v", "O", 7);
  frame(g, 0, 0, w - 1, h - 1);
  hline(g, 1, w - 2, 13, "E");
  rect(g, 1, 14, w - 2, h - 2, "R"); // red plank wall
  // white trim cross on the big doors (classic barn)
  // hay-loft window up top
  window(g, w / 2 - 3, 16, w / 2 + 2, 21);
  // big double hay doors with X bracing
  const dx0 = w / 2 - 10,
    dx1 = w / 2 + 9,
    dy0 = 26,
    dy1 = h - 2;
  rect(g, dx0, dy0, dx1, dy1, "D");
  frame(g, dx0 - 1, dy0 - 1, dx1 + 1, dy1, "E");
  vline(g, w / 2, dy0, dy1, "E"); // centre split
  // X-brace in pale plank on each leaf
  for (let i = 0; i <= dy1 - dy0; i++) {
    px(g, dx0 + Math.round((i * 9) / (dy1 - dy0)), dy0 + i, "S");
    px(g, w / 2 - 1 - Math.round((i * 9) / (dy1 - dy0)), dy0 + i, "S");
    px(g, w / 2 + 1 + Math.round((i * 9) / (dy1 - dy0)), dy0 + i, "S");
    px(g, dx1 - Math.round((i * 9) / (dy1 - dy0)), dy0 + i, "S");
  }
  buildings.push({
    name: "barn",
    size: [w, h],
    description:
      "A rust-red LIVERY BARN with a gambrel roof, a hay-loft window and tall X-braced double doors — the stable at the edge of the frontier town.",
    subject: {
      kind: "building — livery barn / stable",
      build: "a tall wide barn with a gambrel (two-pitch) roof",
      features: "a hay-loft window and X-braced double hay doors",
      accent: "rust-red planks",
      flavor: "the robot horses charge in here",
    },
    grid: g,
  });
})();

// Emit.
for (const b of buildings) {
  b.palette = usedPalette(b.grid);
  const yaml = toYaml(b);
  writeFileSync(join(OUT, `${b.name}.yaml`), yaml);
  console.log(`wrote ${b.name}.yaml (${b.size[0]}x${b.size[1]})`);
}
