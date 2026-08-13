#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Recipe generator for THE GARAGE'S ROCKET — `starship_home`, the ship standing
// on the back lawn of `content/maps/garage.yaml`. Emits one self-describing
// sprite YAML into content/sprites/earth/. Deterministic (no RNG): the grid only
// changes when this recipe does, so the atlas stays diff-stable.
// Run: `node scripts/gen-garage-rocket.mjs`.
//
// IT IS A GENERATOR BECAUSE OF ITS SIZE. Every other sprite in this game is a
// hand-typed grid because every other sprite is small enough to READ as text;
// this one is 96 × 208 and its whole point is that it dwarfs the garage it was
// built in, so it is composed out of bands — skirt, legs, plate courses, patch
// panels, tape — rather than typed pixel by pixel.
//
// WHAT IT IS. The Mars level's `starship` is the same ship at a distance and
// four times a man's height; THIS is the same ship standing in the back garden
// it was welded together in, where the joke only lands if it is absurd: a
// hundred-foot booster on a suburban lawn, and the frame only has room for its
// feet. So the art is the BOTTOM of a much taller rocket, cut off by the top of
// the sprite rather than tapering to a nose — nothing here is allowed to read
// as "the whole thing", or the scale is gone.
//
// AND IT IS A ROCKET ON WELFARE. Every panel above the skirt is a different
// scrap of somebody else's steel: mismatched plate courses, a hull patch riveted
// over a hole, duct tape round a seam, rust down the shaded flank, soot up from
// the bells and a garden ladder still leaning where he left it. A clean white
// fuselage would read as a space agency's; this one has to read as ten years of
// weekends.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "content",
  "sprites",
  "earth",
  "starship_home.yaml",
);

const W = 96;
const H = 208;

// The row that lands on the ship's own world position — a base-anchored sprite
// seats row `height - 2` (render/plane.ts), and the shipped `starship` leaves
// its last painted row a couple above that. Same convention here so the two
// stand on their pads the same way.
const FLOOR = H - 3;

// ── grid helpers ────────────────────────────────────────────────────────────
const grid = Array.from({ length: H }, () =>
  Array.from({ length: W }, () => "."),
);

const px = (x, y, ch) => {
  if (grid[y] && grid[y][x] !== undefined && x >= 0 && x < W) grid[y][x] = ch;
};
const rect = (x0, y0, x1, y1, ch) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) px(x, y, ch);
};
const hline = (x0, x1, y, ch) => rect(x0, y, x1, y, ch);
const vline = (x, y0, y1, ch) => rect(x, y0, x, y1, ch);

// ── THE PALETTE ─────────────────────────────────────────────────────────────
// The four hull colours are the Mars `starship`'s own, so the two read as one
// machine; everything after them is what ten years in a garage added to it.
const PALETTE = {
  O: ["#1a1c2c", "outline"],
  a: ["#d6dce4", "white hull, lit"],
  A: ["#8d9196", "grey hull shading"],
  b: ["#3f4553", "dark legs and skirt"],
  x: ["#c5e6ebe1", "window-port glint"],
  s: ["#5a6070", "soot wash up from the bells"],
  c: ["#2a2e3c", "deep soot in the bell throats"],
  t: ["#b8ac8e", "duct tape round the seams"],
  r: ["#7c5433", "rust running down the shaded flank"],
  g: ["#4a5b3f", "a mismatched panel off something agricultural"],
  y: ["#c8a63e", "the ladder, and the hazard stencil"],
};

// ── THE FUSELAGE ────────────────────────────────────────────────────────────
// A cylinder, drawn as a flat band with the light on the LEFT and the shade on
// the right — the family's own key light (see the lawn tree's `accent`). It
// runs off the TOP of the sprite: there is no nose in this picture.
const HULL_L = 20;
const HULL_R = 75;
/** Where the barrel stops and the engine skirt flares out below it. */
const SKIRT_TOP = 150;
/** …and where the skirt's own mouth is, with the bells hanging in it. */
const SKIRT_BOTTOM = 178;

/** The lit/shaded fill for a hull column — one gradient, used everywhere so a
 * patch panel reads as the same cylinder in a different metal. */
function hullShade(x) {
  const t = (x - HULL_L) / (HULL_R - HULL_L);
  if (t < 0.12) return "A"; // the turn of the cylinder catching the sky
  if (t < 0.62) return "a";
  if (t < 0.82) return "A";
  return "s";
}

for (let y = 0; y < SKIRT_TOP; y++) {
  for (let x = HULL_L; x <= HULL_R; x++) px(x, y, hullShade(x));
  px(HULL_L - 1, y, "O");
  px(HULL_R + 1, y, "O");
}

// PLATE COURSES — a horizontal weld every 18 rows, because a barrel this size
// was never one sheet. The seam is a dark line with a lit lip under it, which
// is what a lap joint does to the light.
for (let y = 6; y < SKIRT_TOP; y += 18) {
  hline(HULL_L, HULL_R, y, "O");
  for (let x = HULL_L; x <= HULL_R; x++) {
    if (grid[y + 1]) px(x, y + 1, hullShade(x) === "a" ? "a" : "A");
  }
  // …and the vertical welds between plates, staggered course by course so the
  // barrel does not read as a manufactured lattice.
  const stagger = ((y / 18) | 0) % 2 === 0 ? 0 : 9;
  for (let x = HULL_L + 8 + stagger; x < HULL_R; x += 18)
    vline(x, y + 2, y + 17, "A");
}

// THE MISMATCHED PANELS — two courses of somebody else's steel, riveted in.
// Kept to whole plate courses: a patch that ignored the welds would read as a
// stain rather than as a panel.
function patch(x0, y0, x1, y1, ch) {
  rect(x0, y0, x1, y1, ch);
  hline(x0, x1, y0, "O");
  hline(x0, x1, y1, "O");
  vline(x0, y0, y1, "O");
  vline(x1, y0, y1, "O");
  // Rivets down the two seams, every fourth row.
  for (let y = y0 + 3; y < y1; y += 4) {
    px(x0 + 2, y, "A");
    px(x1 - 2, y, "A");
  }
}
patch(28, 6, 47, 23, "A");
patch(26, 96, 45, 113, "g");
patch(52, 132, 71, 149, "A");

// DUCT TAPE — two bands round seams somebody stopped trying to weld. Hatched
// rather than solid, so it reads as tape wound on and not as a painted stripe.
function tape(y0) {
  for (let y = y0; y < y0 + 4; y++) {
    for (let x = HULL_L; x <= HULL_R; x++) {
      px(x, y, (x + y) % 5 === 0 ? "A" : "t");
    }
  }
  hline(HULL_L, HULL_R, y0 - 1, "O");
  hline(HULL_L, HULL_R, y0 + 4, "O");
}
tape(78);
tape(120);

// RUST, running down the shaded flank from the tape band that is holding the
// weather out. Streaks of varying length so it reads as weeping rather than as
// a painted edge.
for (const [x, from, len] of [
  [70, 124, 22],
  [72, 124, 34],
  [73, 82, 26],
  [68, 82, 14],
  [71, 40, 18],
]) {
  for (let y = from; y < from + len; y++) px(x, y, "r");
}

// THE PORTS — two of the shipped ship's window ports, at the courses where the
// tank stops and the crew space starts. The same dark frame + glint it uses, so
// the two ships share the one detail anybody would recognise them by.
function port(cx, cy) {
  rect(cx - 4, cy - 4, cx + 4, cy + 4, "O");
  rect(cx - 2, cy - 2, cx + 2, cy + 2, "x");
  px(cx - 3, cy - 3, "x");
}
port(64, 25);
port(64, 104);

// THE HATCH — the way in, at standing height. Nobody built a gantry, so the
// LADDER below is the whole of the boarding arrangement.
const HATCH_L = 26;
const HATCH_R = 48;
const HATCH_SILL = 70;
rect(HATCH_L, 28, HATCH_R, HATCH_SILL, "O");
rect(HATCH_L + 2, 30, HATCH_R - 2, HATCH_SILL - 2, "A");
rect(HATCH_L + 4, 32, HATCH_R - 4, HATCH_SILL - 4, "s");
// Handle, and the hinges down the left edge.
vline(HATCH_R - 5, 44, 52, "y");
for (const y of [36, 48, 60]) rect(HATCH_L + 1, y, HATCH_L + 3, y + 2, "O");

// SOOT, licking up the barrel out of the bells — the one mark on this thing
// that says it has actually been lit.
//
// A TONGUE PER COLUMN, not a band: the coverage has to go to nothing at the top
// of each tongue or the wash reads as a strip of static laid across the hull,
// which is exactly what a fixed dither pattern over a fixed depth gives you. So
// each column gets its own reach and its own fade, and the fade decides whether
// a pixel is soot at all.
for (let x = HULL_L; x <= HULL_R; x++) {
  const reach = 16 + ((x * 11) % 17);
  for (let y = SKIRT_TOP - reach; y < SKIRT_TOP; y++) {
    // 0 at the tongue's tip, 1 at the skirt.
    const depth = (y - (SKIRT_TOP - reach)) / reach;
    const speckle = ((x * 7 + y * 13) % 16) / 16;
    if (speckle > depth * depth) continue;
    px(x, y, depth > 0.6 ? "c" : "s");
  }
}

// ── THE ENGINE SKIRT ────────────────────────────────────────────────────────
// The barrel flares out to the mount ring and the bells hang in the mouth of it.
//
// AND IT IS THE BRIGHTEST THING ON THE SHIP, WHICH IS THE OPPOSITE OF WHAT AN
// ENGINE BAY WANTS TO BE. This rocket stands on a lawn at MIDNIGHT and it is far
// too tall for the frame, so the only part of it a player ever sees is the last
// seventy pixels above the grass — everything above that is off the top of the
// screen or dissolved in the map's own edge dither. Painted in the deep greys an
// engine bay deserves, those seventy pixels came out as a black trestle: it read
// as a pylon, not as a ship. So the skirt, the bells and the legs are drawn in
// the HULL's greys with the darks kept for the throats and the shadow side, and
// the machine is legible at the one place it is ever looked at.
const SKIRT_L = 10;
const SKIRT_R = 85;
for (let y = SKIRT_TOP; y <= SKIRT_BOTTOM; y++) {
  const t = (y - SKIRT_TOP) / (SKIRT_BOTTOM - SKIRT_TOP);
  const l = Math.round(HULL_L - (HULL_L - SKIRT_L) * t);
  const r = Math.round(HULL_R + (SKIRT_R - HULL_R) * t);
  for (let x = l; x <= r; x++) {
    const u = (x - l) / (r - l);
    px(x, y, u < 0.12 ? "a" : u < 0.55 ? "A" : u < 0.82 ? "s" : "b");
  }
  px(l - 1, y, "O");
  px(r + 1, y, "O");
}
hline(HULL_L - 1, HULL_R + 1, SKIRT_TOP, "O");
// The mount ring — a lit lip where the flare starts, so the skirt reads as
// bolted on rather than as the barrel going dark.
hline(HULL_L, HULL_R, SKIRT_TOP + 1, "a");
// …and the hazard stencil round it, which is the one warm note down here and
// the fastest thing in the picture to read as MACHINE.
for (let x = SKIRT_L + 6; x < SKIRT_R - 4; x += 8) {
  rect(x, SKIRT_BOTTOM - 6, x + 3, SKIRT_BOTTOM - 4, "y");
}

// THE BELLS — three of them hanging in the skirt's mouth, FLARING as they come
// down: a bell that is the same width top and bottom is a pipe, and a rocket
// with three pipes under it is a boiler.
for (const cx of [26, 48, 70]) {
  const top = SKIRT_BOTTOM - 14;
  const bottom = SKIRT_BOTTOM + 8;
  for (let y = top; y <= bottom; y++) {
    const t = (y - top) / (bottom - top);
    const half = Math.round(5 + 6 * t * t);
    for (let x = cx - half; x <= cx + half; x++) {
      const u = (x - (cx - half)) / (2 * half);
      px(x, y, u < 0.2 ? "a" : u < 0.62 ? "A" : "s");
    }
    px(cx - half - 1, y, "O");
    px(cx + half + 1, y, "O");
  }
  // The throat — the ONE genuinely black hole down here, and the reason the
  // bright bells around it read as bells rather than as three grey pegs.
  const mouth = Math.round(5 + 6);
  rect(cx - 4, top + 3, cx + 4, bottom - 1, "c");
  rect(cx - 3, bottom - 6, cx + 3, bottom - 1, "O");
  hline(cx - 5, cx + 5, top, "O");
  hline(cx - mouth, cx + mouth, bottom + 1, "O");
}

// ── THE LEGS ────────────────────────────────────────────────────────────────
// Three splayed struts off the skirt onto pads on the grass. The middle one
// runs straight down the picture (it is the near leg, pointing at the camera)
// and is drawn SHORTER — that foreshortening is the only depth cue three
// straight lines have.
function leg(topX, footX, footY, thick) {
  const top = SKIRT_BOTTOM - 4;
  const span = footY - top;
  for (let i = 0; i <= span; i++) {
    const t = i / span;
    const x = Math.round(topX + (footX - topX) * t);
    for (let k = 0; k < thick; k++) {
      px(x + k, top + i, k === 0 ? "a" : k < thick - 1 ? "A" : "s");
    }
    px(x - 1, top + i, "O");
    px(x + thick, top + i, "O");
  }
  // THE PAD — a foot plate wide enough to stand a rocket on soft ground, which
  // is what a lawn is, and the reason the grass under it is dead.
  rect(footX - 6, footY, footX + thick + 5, footY + 3, "A");
  hline(footX - 6, footX + thick + 5, footY, "a");
  hline(footX - 6, footX + thick + 5, footY + 3, "s");
  hline(footX - 7, footX + thick + 6, footY + 4, "O");
  vline(footX - 7, footY, footY + 4, "O");
  vline(footX + thick + 6, footY, footY + 4, "O");
}
// THE NEAR LEG'S FOOT IS THE LOWEST ONE. Three legs whose pads sit on one row
// read as a cardboard cut-out, and the near one drawn SHORT reads as a broken
// leg — so it is the two BACK legs that stop short of the floor line and the
// near one that comes all the way down the picture to it.
leg(24, 11, FLOOR - 10, 4);
leg(70, 81, FLOOR - 10, 4);
leg(46, 44, FLOOR, 5);

// ── THE LADDER ──────────────────────────────────────────────────────────────
// A garden ladder leaning up the lit flank to the hatch, foot planted on the
// grass. Drawn LAST, over the skirt and the legs it leans across, because that
// is where it is: propped against the outside of the machine, not built into
// it. It is the whole boarding arrangement, and it is the single loudest thing
// on this rocket about how it was built.
const LADDER_FOOT_X = 6;
const LADDER_TOP_X = 30;
const LADDER_W = 7;
{
  const top = HATCH_SILL - 2;
  const span = FLOOR - top;
  const stileX = (y) =>
    Math.round(
      LADDER_TOP_X + ((LADDER_FOOT_X - LADDER_TOP_X) * (y - top)) / span,
    );
  for (let y = top; y <= FLOOR; y++) {
    const x = stileX(y);
    px(x, y, "y");
    px(x + LADDER_W, y, "y");
    px(x - 1, y, "O");
    px(x + LADDER_W + 1, y, "O");
    // Rungs every fifth row, with their own dark underside so the ladder does
    // not read as a flat yellow ribbon down the hull.
    if ((y - top) % 5 === 0) {
      hline(x + 1, x + LADDER_W - 1, y, "y");
      hline(x + 1, x + LADDER_W - 1, y + 1, "O");
    }
  }
  // The feet, dug into the lawn.
  const foot = stileX(FLOOR);
  hline(foot - 1, foot + 1, FLOOR + 1, "O");
  hline(foot + LADDER_W - 1, foot + LADDER_W + 1, FLOOR + 1, "O");
}

// ── EMIT ────────────────────────────────────────────────────────────────────
const palette = Object.entries(PALETTE)
  .map(([k, [hex, note]]) => `  ${k}: "${hex}" # ${note}`)
  .join("\n");
const rows = grid.map((row) => `  ${row.join("")}`).join("\n");

const yaml = `# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# GENERATED by scripts/gen-garage-rocket.mjs — edit the recipe, not this file.
name: starship_home
family: earth
size: [${W}, ${H}]
description: >
  The hero's rocket standing on the back lawn of his garage — a hundred feet of
  home-welded booster on a suburban plot, with only its skirt, its bells and its
  three landing legs inside the frame. Mismatched plate courses, a riveted hull
  patch, duct tape round two seams, rust weeping down the shaded flank, soot
  licking up out of the engines, and a garden ladder still leaning against the
  hatch.
subject:
  kind: vehicle (prop), the bottom of a much taller rocket
  build: a broad steel barrel running off the top of the frame, flaring into a dark engine skirt with three bells, standing on three splayed landing legs with foot pads on the grass
  features: plate courses with staggered welds, two riveted patch panels in other metals, two duct-tape bands, a hatch at standing height with a garden ladder leaning up to it, two window ports
  accent: the lit left flank against the shaded right one, with rust weeping down it
  flavor: ten years of weekends in the garage, and it shows on every panel
palette:
${palette}
grid: |
${rows}
`;

writeFileSync(OUT, yaml);
console.log(`wrote ${OUT} (${W}×${H})`);
