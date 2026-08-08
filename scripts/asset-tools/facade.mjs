// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE FACADE GENERATOR — every building shell on the road to GOODCO, ruled from
// its def rather than drawn.
//
// WHY GENERATED AND NEVER HAND-DRAWN. The town is 26 archetypes in 3 colourways,
// which is 78 grids, and the 79th is whatever gets added next week. Drawing them
// means a street that can only grow at the speed somebody can pixel a wall — and,
// worse, a street where retuning one course line means opening 78 files. So a
// building ships a DEF and earns its picture, exactly as a vehicle ships one
// grid and earns its wrecks (`wreck.mjs`) and an enemy ships two frames and
// earns its wounds (`damage.mjs`).
//
// IT IS ALSO THE RIGHT TOOL FOR THIS PARTICULAR SUBJECT, which is the part worth
// saying out loud, because "generated art" is usually a confession. A building
// facade is the most REGULAR thing this game draws: courses at a fixed gauge,
// bays on a fixed rhythm, a bond that repeats, a parapet that runs level. Those
// are the things a hand gets wrong at 1x and a loop gets right every time. What
// a hand is better at — a door, a smashed pane, a wheelie bin, a sofa in a front
// garden — is exactly what is NOT generated here: the parts bin next door
// (`facade-parts.mjs`) is drawn shape by shape, and the shell is the wall it all
// hangs on.
//
// WHAT A SHELL IS, top to bottom: a ROOF (the half that makes a skyline), the
// STOREYS, the GROUND FLOOR, and two rows of base. The openings are not drawn —
// they are SUNK: the generator reads the same `townSlots` the app reads and
// leaves a lintel, a sill and a reveal around each one, so the window that lands
// there at runtime lands in a hole that was cut for it.
//
// THE COLOURWAYS ARE PER MATERIAL. Brick is red, buff or grey-stock; render is
// cream, mint or pink; corrugated is galvanised, green or oxide. Three per
// material rather than one shared set, because a mint brick house is not a
// house, and because the wall colour is far and away the loudest thing about a
// building at this size — two of the same archetype a hundred px apart in the
// same colour is the repetition the eye actually catches.

import { TOWN_ART_SIZE } from "../../engine/game/drive/town-parts.ts";
import {
  townHeight,
  townSlots,
  townWidth,
} from "../../engine/game/drive/town.ts";

// ── COLOUR ───────────────────────────────────────────────────────────────────

const hexToRgb = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];
const rgbToHex = (rgb) =>
  `#${rgb
    .map((v) =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;

/** Lighten (`k > 1`) or darken (`k < 1`) a colour, keeping it inside the game's
 * night palette rather than bleaching toward white — a wall's sunlit edge is a
 * warmer version of the wall, never a paler one. */
const shade = (hex, k, warm = 0) => {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex([r * k + warm, g * k + warm * 0.6, b * k - warm * 0.2]);
};

/**
 * THE FULL PALETTE ONE COLOURWAY PAINTS, derived from three authored colours.
 *
 * DERIVED rather than authored nine at a time, and that is worth the two lines
 * it costs: a wall's course line, its lit edge and its shaded flank are not
 * three decisions — they are one decision about the wall, seen under one light.
 * Authored separately they drift, and a drifted ramp is exactly what makes
 * pixel art look assembled rather than painted.
 */
function paletteFor({ wall, trim, roof }) {
  // Concrete `[r,g,b,a]`, which is what every consumer downstream of here wants
  // (`buildPalette` merges arrays; `gridToSurface` writes them straight into the
  // surface). Hex is the authoring format and stops at this line.
  const rgba = (hex) => [...hexToRgb(hex), 255];
  return {
    O: rgba("#1a1c2c"),
    1: rgba(wall),
    2: rgba(shade(wall, 1.16, 6)),
    3: rgba(shade(wall, 0.78)),
    4: rgba(trim),
    5: rgba(shade(trim, 0.7)),
    6: rgba(roof),
    7: rgba(shade(roof, 0.72)),
    8: rgba(shade(wall, 0.55)),
  };
}

/**
 * THREE COLOURWAYS PER MATERIAL, and they are the material's own — a wall is
 * made of something before it is painted, and the something is what limits the
 * colour. Nothing here is a real paint range or a real brand; they are the
 * colours a street is, which is a much shorter list than a paint chart.
 */
const COLOURWAYS = {
  brick: [
    { wall: "#8f4c3e", trim: "#c9c0ad", roof: "#4a4640" },
    { wall: "#a8865c", trim: "#d4cbb6", roof: "#4d4740" },
    { wall: "#7d6f63", trim: "#bdb6a6", roof: "#453f3a" },
  ],
  clapboard: [
    { wall: "#b9a887", trim: "#e6e0cd", roof: "#54463c" },
    { wall: "#8fa39a", trim: "#e2ebe2", roof: "#4a4a48" },
    { wall: "#c2a3a0", trim: "#efe2dc", roof: "#584646" },
  ],
  render: [
    { wall: "#cfc4a6", trim: "#8b8271", roof: "#565046" },
    { wall: "#a8c0b2", trim: "#7d8d82", roof: "#4c554e" },
    { wall: "#c9a9a6", trim: "#8b7776", roof: "#57484a" },
  ],
  panel: [
    { wall: "#9aa3ab", trim: "#5f676e", roof: "#454b52" },
    { wall: "#7f8f7c", trim: "#525c50", roof: "#3f463d" },
    { wall: "#ab9b86", trim: "#6b6255", roof: "#4b453b" },
  ],
  corrugated: [
    { wall: "#8d949a", trim: "#5c6266", roof: "#4a4f53" },
    { wall: "#6f8168", trim: "#4a5545", roof: "#3d453a" },
    { wall: "#9a7355", trim: "#644a38", roof: "#4d3b2d" },
  ],
  concrete: [
    { wall: "#9b9a94", trim: "#6a6a66", roof: "#4f4f4c" },
    { wall: "#87897f", trim: "#5c5e56", roof: "#464840" },
    { wall: "#a49b8f", trim: "#6f695f", roof: "#524d45" },
  ],
  curtain: [
    { wall: "#5d7a86", trim: "#b9c6cc", roof: "#3c4b52" },
    { wall: "#66707e", trim: "#c0c6d0", roof: "#40454f" },
    { wall: "#5b7d72", trim: "#b6c9c1", roof: "#3a4e47" },
  ],
  tile: [
    { wall: "#c8ccc4", trim: "#7d8177", roof: "#4e5049" },
    { wall: "#b0c4cc", trim: "#6f7c81", roof: "#464e51" },
    { wall: "#d0bda6", trim: "#847765", roof: "#524a40" },
  ],
  timber: [
    { wall: "#8a6f4e", trim: "#5c4a34", roof: "#463829" },
    { wall: "#6f6350", trim: "#4a4238", roof: "#3a352d" },
    { wall: "#9a7f63", trim: "#665442", roof: "#4d4034" },
  ],
  block: [
    { wall: "#a8a496", trim: "#726f65", roof: "#4f4d46" },
    { wall: "#909a91", trim: "#626963", roof: "#464b47" },
    { wall: "#b0a189", trim: "#786d5c", roof: "#544c41" },
  ],
};

// ── GRID PRIMITIVES ──────────────────────────────────────────────────────────

const make = (w, h) => Array.from({ length: h }, () => new Array(w).fill("."));
const put = (g, x, y, c) => {
  if (y >= 0 && y < g.length && x >= 0 && x < g[0].length) g[y][x] = c;
};
const rect = (g, x, y, w, h, c) => {
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) put(g, x + i, y + j, c);
};
const hline = (g, x, y, w, c) => rect(g, x, y, w, 1, c);
const vline = (g, x, y, h, c) => rect(g, x, y, 1, h, c);
const rows = (g) => g.map((r) => r.join(""));

/** FNV-1a over a string — the same stable hash the rest of the derived art uses,
 * so a shell's chimney stands in the same place on every machine forever. */
function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
const roll = (seed, n) => (hashString(`${seed}#${n}`) % 1000) / 1000;

// ── THE MATERIALS ────────────────────────────────────────────────────────────

/**
 * WHAT A WALL LOOKS LIKE UP CLOSE — ruled into a rectangle, in the palette's own
 * wall chars.
 *
 * Every one of these is a GAUGE rather than a picture, and the gauges are what
 * tell two buildings apart at speed even when they are the same colour: brick
 * courses every three rows read as brick, a clapboard shadow every three reads
 * as boards, and a corrugated flute every three reads as a shed. Same pitch,
 * three completely different sentences, because of which way the line runs.
 */
const WALLS = {
  clapboard(g, x, y, w, h) {
    rect(g, x, y, w, h, "1");
    for (let j = 2; j < h; j += 3) hline(g, x, y + j, w, "3");
  },
  brick(g, x, y, w, h) {
    rect(g, x, y, w, h, "1");
    for (let j = 2; j < h; j += 3) hline(g, x, y + j, w, "3");
    for (let j = 0; j < h; j++) {
      if ((j + 1) % 3 === 0) continue;
      const stagger = Math.floor(j / 3) % 2 ? 2 : 0;
      for (let i = stagger; i < w; i += 4) put(g, x + i, y + j, "3");
    }
  },
  render(g, x, y, w, h) {
    rect(g, x, y, w, h, "1");
    // A rendered wall is FLAT, and the only thing that saves it from reading as
    // a swatch is that render is never evenly mixed. The mottle is DARKER than
    // the wall and sparse: lighter specks read as snow on the wall at 1x, which
    // is a thing this game's night sky already does elsewhere on purpose.
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        if (roll(`${x},${y}`, j * 97 + i) > 0.965) put(g, x + i, y + j, "3");
      }
  },
  panel(g, x, y, w, h) {
    rect(g, x, y, w, h, "1");
    for (let i = 5; i < w; i += 6) vline(g, x + i, y, h, "3");
    for (let j = 7; j < h; j += 8) hline(g, x, y + j, w, "3");
  },
  corrugated(g, x, y, w, h) {
    rect(g, x, y, w, h, "1");
    for (let i = 1; i < w; i += 3) vline(g, x + i, y, h, "3");
    for (let i = 2; i < w; i += 3) vline(g, x + i, y, h, "2");
  },
  concrete(g, x, y, w, h) {
    rect(g, x, y, w, h, "1");
    for (let j = 5; j < h; j += 6) hline(g, x, y + j, w, "3");
    for (let i = 11; i < w; i += 12) vline(g, x + i, y, h, "3");
  },
  curtain(g, x, y, w, h) {
    rect(g, x, y, w, h, "3");
    for (let i = 0; i < w; i += 5) vline(g, x + i, y, h, "4");
    for (let j = 0; j < h; j += 4) hline(g, x, y + j, w, "1");
  },
  tile(g, x, y, w, h) {
    rect(g, x, y, w, h, "1");
    for (let j = 1; j < h; j += 2) hline(g, x, y + j, w, "3");
    for (let j = 0; j < h; j++) {
      if ((j + 1) % 2 === 0) continue;
      const stagger = Math.floor(j / 2) % 2 ? 1 : 0;
      for (let i = stagger; i < w; i += 3) put(g, x + i, y + j, "3");
    }
  },
  timber(g, x, y, w, h) {
    rect(g, x, y, w, h, "1");
    for (let i = 3; i < w; i += 4) vline(g, x + i, y, h, "3");
    for (let i = 0; i < w; i += 4) {
      if (roll(`${x}t${y}`, i) > 0.6) vline(g, x + i, y, h, "2");
    }
  },
  block(g, x, y, w, h) {
    rect(g, x, y, w, h, "1");
    for (let j = 2; j < h; j += 3) hline(g, x, y + j, w, "3");
    for (let j = 0; j < h; j++) {
      if ((j + 1) % 3 === 0) continue;
      const stagger = Math.floor(j / 3) % 2 ? 3 : 0;
      for (let i = stagger; i < w; i += 6) put(g, x + i, y + j, "3");
    }
  },
};

// ── THE ROOFS ────────────────────────────────────────────────────────────────

/**
 * THE HALF THAT MAKES A SKYLINE.
 *
 * The old row was 30 px tall to the pixel, all of it, forever — so the town's
 * top edge was a ruled line across the frame and no amount of variety below it
 * ever registered. Height is the variable that reads FIRST at this distance,
 * before colour and long before a door, which is why the roof gets its own
 * vocabulary and why the def's `roofPx` is a knob rather than a constant.
 *
 * Each of these draws into the top `rh` rows and returns nothing: the wall is
 * laid first and the roof cuts into it, so a pitch that leaves its corners
 * transparent leaves them transparent whatever the wall was made of.
 */
const ROOFS = {
  /** A flat roof's coping — a level cap, and the plainest thing on the road. */
  coping(g, w, rh) {
    rect(g, 0, 0, w, rh, ".");
    hline(g, 0, rh - 3, w, "6");
    hline(g, 0, rh - 2, w, "7");
    hline(g, 0, rh - 1, w, "O");
  },
  /** …and the same with the parapet raised at the ends, which is what a
   * Victorian terrace's party walls actually do. */
  parapet(g, w, rh) {
    ROOFS.coping(g, w, rh);
    for (const x of [0, w - 4]) {
      rect(g, x, 0, 4, rh, "6");
      hline(g, x, 0, 4, "O");
      vline(g, x === 0 ? 0 : w - 1, 0, rh, "O");
      hline(g, x, rh - 2, 4, "7");
    }
  },
  /** A pitched roof seen end-on — the shape a house is drawn as by anybody who
   * has ever drawn a house. */
  pitch(g, w, rh) {
    rect(g, 0, 0, w, rh, ".");
    const apex = Math.floor(w / 2);
    for (let j = 0; j < rh; j++) {
      const spread = Math.round(((j + 1) / rh) * (w / 2));
      const x0 = Math.max(0, apex - spread);
      const x1 = Math.min(w - 1, apex + spread);
      rect(g, x0, j, x1 - x0 + 1, 1, "6");
      put(g, x0, j, "O");
      put(g, x1, j, "O");
    }
    hline(g, 0, rh - 1, w, "7");
    // The eaves overhang the wall by a pixel each side, which is the whole
    // difference between a roof ON a house and a lid resting on one.
    hline(g, 0, rh - 2, w, "6");
  },
  /** A pitch with a stack on it. A chimney is a silhouette a player reads at any
   * distance the building is visible at all, and it is the cheapest thing on
   * this road that says HOUSE rather than BUILDING. */
  gable(g, w, rh, seed) {
    ROOFS.pitch(g, w, rh);
    const cx = Math.round(3 + roll(seed, 1) * (w - 9));
    rect(g, cx, 0, 4, rh - 1, "7");
    vline(g, cx, 0, rh - 1, "O");
    vline(g, cx + 3, 0, rh - 1, "O");
    hline(g, cx, 0, 4, "O");
    hline(g, cx + 1, 1, 2, "6");
  },
  /** A single slope — a lock-up, a workshop, an extension. */
  mono(g, w, rh) {
    rect(g, 0, 0, w, rh, ".");
    for (let i = 0; i < w; i++) {
      const top = Math.round((1 - i / Math.max(1, w - 1)) * (rh - 2));
      put(g, i, top, "O");
      rect(g, i, top + 1, 1, rh - top - 1, "6");
      put(g, i, rh - 1, "7");
    }
  },
  /** THE INDUSTRIAL ONE. A run of north-lights, which is what every shed built
   * to be worked in has and nothing built to be lived in ever does. */
  sawtooth(g, w, rh) {
    rect(g, 0, 0, w, rh, ".");
    const pitch = 8;
    for (let i = 0; i < w; i++) {
      const phase = i % pitch;
      const top = phase < 5 ? rh - 2 - Math.round((phase / 4) * (rh - 3)) : 1;
      put(g, i, top, "O");
      rect(g, i, top + 1, 1, rh - top - 1, phase < 5 ? "6" : "4");
    }
    hline(g, 0, rh - 1, w, "7");
  },
  /** A flat roof with a tank on it — the reading that says the building has
   * PLUMBING somebody has to think about, i.e. that people live in it. */
  tank(g, w, rh, seed) {
    ROOFS.coping(g, w, rh);
    const tw = 7;
    const tx = Math.round(2 + roll(seed, 2) * (w - tw - 4));
    rect(g, tx, 0, tw, rh - 2, "7");
    hline(g, tx, 0, tw, "O");
    vline(g, tx, 0, rh - 2, "O");
    vline(g, tx + tw - 1, 0, rh - 2, "O");
    hline(g, tx + 1, 1, tw - 2, "6");
  },
  /** …and one with the plant on it: the boxes, cowls and ducts that sit on top
   * of anything with a lift or an air-conditioning bill. */
  plant(g, w, rh, seed) {
    ROOFS.coping(g, w, rh);
    let x = 2;
    let n = 0;
    while (x < w - 6) {
      const bw = 4 + Math.round(roll(seed, n) * 3);
      const bh = 2 + Math.round(roll(seed, n + 20) * (rh - 4));
      if (roll(seed, n + 40) > 0.35) {
        rect(g, x, rh - 3 - bh, bw, bh, "7");
        hline(g, x, rh - 3 - bh, bw, "O");
        vline(g, x, rh - 3 - bh, bh, "O");
        vline(g, x + bw - 1, rh - 3 - bh, bh, "O");
      }
      x += bw + 3;
      n++;
    }
  },
  /** THE FASCIA a trade puts its name on — the raised box over a shopfront, and
   * the thing that makes a shop read as a shop from the far side of the road. */
  signbox(g, w, rh) {
    rect(g, 0, 0, w, rh, ".");
    rect(g, 0, 1, w, rh - 1, "4");
    hline(g, 0, 1, w, "O");
    hline(g, 0, rh - 1, w, "5");
    vline(g, 0, 1, rh - 1, "O");
    vline(g, w - 1, 1, rh - 1, "O");
  },
  /** NO ROOF AT ALL — a yard wall, a hoarding, a gated passage. What it wears
   * instead is a capping course, and the transparency above it is what lets the
   * sky through the gaps in a row and stops the town being a solid band. */
  open(g, w, rh) {
    rect(g, 0, 0, w, rh, ".");
    hline(g, 0, rh - 2, w, "4");
    hline(g, 0, rh - 1, w, "5");
    hline(g, 0, rh - 3, w, "O");
  },
};

// ── THE SHELL ────────────────────────────────────────────────────────────────

/** Sink one opening into the wall — a lintel over it, a sill under it, a reveal
 * down each side, and a dark recess behind whatever gets hung in it. */
function sinkOpening(g, slot) {
  const { x, y, w, h } = slot;
  rect(g, x, y, w, h, "8");
  hline(g, x - 1, y - 1, w + 2, "4");
  hline(g, x - 1, y + h, w + 2, "4");
  vline(g, x - 1, y, h, "5");
  vline(g, x + w, y, h, "5");
}

/**
 * Build one building's shell in one colourway.
 *
 * @param {object} def a `TownBuildingDef`
 * @param {number} colourway 0..2
 * @returns {{ grid: string[], palette: Record<string, string> }}
 */
export function facadeShell(def, colourway) {
  const w = townWidth(def);
  const h = townHeight(def);
  const ways = COLOURWAYS[def.wall] ?? COLOURWAYS.render;
  const way = ways[colourway % ways.length];
  const palette = paletteFor(way);
  const seed = `${def.id}:${colourway}`;
  const g = make(w, h);

  // THE WALL, floor to eaves. Everything else on this page cuts into it.
  const rh = def.roofPx;
  const wallTop = Math.max(0, rh - 2);
  const wallBottom = h - 2;
  (WALLS[def.wall] ?? WALLS.render)(g, 0, wallTop, w, wallBottom - wallTop);

  // ITS CORNERS. An ink edge each side and a lit return just inside the left —
  // the one cue that says this is a BLOCK standing in a street rather than a
  // flat picture of a wall, and the reason the row reads as having depth at all.
  vline(g, 0, wallTop, wallBottom - wallTop, "O");
  vline(g, w - 1, wallTop, wallBottom - wallTop, "O");
  vline(g, 1, wallTop, wallBottom - wallTop, "2");

  // THE ROOF, cut in over the top of it.
  (ROOFS[def.roof] ?? ROOFS.coping)(g, w, rh, seed);

  // THE OPENINGS — read off the SAME function the app reads, so a window always
  // lands in a hole that was cut for it (see `townSlots`).
  for (const slot of townSlots(def)) {
    const size = TOWN_ART_SIZE[slot.part] ?? [slot.w, slot.h];
    sinkOpening(g, { x: slot.x, y: slot.y, w: size[0], h: size[1] });
  }

  // THE BASE. A plinth course and the ink line it stands on — without them a
  // building's bottom edge dissolves into the verge behind it and the whole row
  // floats.
  hline(g, 0, h - 2, w, "8");
  hline(g, 0, h - 1, w, "O");

  return { grid: rows(g), palette };
}

/** The three colourway suffixes, in the order `facadeShell` indexes them. Kept
 * beside the generator and re-stated in the engine's `TOWN_COLOURWAYS` — the
 * town test pins the pair. */
export const FACADE_COLOURWAYS = ["", "_b", "_c"];
