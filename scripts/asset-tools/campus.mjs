// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// GOODCO FROM OUTSIDE ITS FENCE — the site at the end of the drive, ruled
// rather than drawn.
//
// WHY GENERATED, when the parts bin next door is hand-drawn. The split is the
// same one `facade.mjs` and `facade-parts.mjs` already make and it lands on the
// same side for the same reason: everything here is REGULAR at a gauge. A
// palisade is a paling every three pixels; a data hall is a rib every four and a
// louvre bank every sixteen; a service gantry is a lattice; a launch stack is a
// body of revolution, which at this size means "symmetric about one column and
// shaded off that column". Those are precisely the things a hand gets wrong at
// 1x and a loop gets right every time — and they are BIG (the ship is 34x168,
// which is five thousand pixels nobody should be placing by eye).
//
// AND THE SIZES ARE NOT AN ARTIST'S CALL. They are the engine's
// (`CAMPUS_ART_SIZE`, engine/game/drive/campus-parts.ts), because the layout places
// each piece against them: a hall a pixel wider than its entry does not look
// slightly wrong, it lands somewhere it was not put. Importing the table is what
// makes that impossible rather than unlikely.
//
// WHAT THE PLACE IS SUPPOSED TO SAY, since every shape below is in service of
// it. GOODCO is not a factory and not an office: it is three windowless sheds
// full of somebody else's mail, lit blue-white, with the plant on the roof doing
// the only work anybody can see from the road — and standing behind them, on a
// gantry, a ship. The joke is the proportion. The hero has driven an hour to
// collect one part from the mailroom of a company that has a rocket in the back
// garden, and the only thing he says about any of it is that it is GOODCO.
//
// EVERY PIECE IS SEEN AT NIGHT, from a road, at speed. So: hard ink silhouettes,
// two tones per material and no more, and every light source drawn as a small
// saturated core rather than a glow — the renderer is not going to bloom these,
// and a soft edge at this size is a smudge.

import { CAMPUS_ART_SIZE } from "../../engine/game/drive/campus-parts.ts";

// ── THE PALETTE ──────────────────────────────────────────────────────────────
//
// ONE PALETTE FOR THE WHOLE SITE, exactly as the parts bin has one for the whole
// town, and for the same reason: this is one PLACE. A fence, a hall and a
// gantry that each carried their own greys would read as three things that
// happen to be near each other, and the single thing the campus has to do in
// three seconds of screen time is read as one company's property.
//
// It is deliberately COOLER than the town's. Every colour on the road out here
// is sodium, brick and soot; GOODCO is concrete, galvanised steel and a corporate
// blue-white, and the change of temperature is half of what tells the player the
// town is behind him.

const CAMPUS_HEX = {
  O: "#1a1c2c", // ink
  o: "#252a3a", // soft ink — an inside edge, a shadow under a sill
  W: "#d3d8de", // white render / the ship's skin
  w: "#a2a9b4", // …shaded
  G: "#7c8794", // profiled cladding
  g: "#5a636f", // …its ribs
  S: "#8d97a4", // galvanised steel — fence, gantry, handrail
  s: "#565e6a", // …shaded
  C: "#6b7078", // poured concrete
  c: "#474b53", // …shaded
  K: "#1f2632", // a louvre, a mesh, a dark opening
  k: "#2e394a", // …its lit edge
  B: "#59d8c0", // GOODCO's own light — the band, the sign, the door
  b: "#2f8f80", // …shaded
  L: "#f2d98a", // a lit pane
  Y: "#ffd98a", // a sodium floodlight
  y: "#c9a94e", // …its cowl
  R: "#c9463c", // a warning lamp, a stripe on the stack
  r: "#8a2f28", // …shaded
};

/** …as concrete `[r,g,b,a]`, which is what everything downstream wants. Hex is
 * the authoring format and stops at this line. */
export const CAMPUS_PALETTE = Object.fromEntries(
  Object.entries(CAMPUS_HEX).map(([char, hex]) => [
    char,
    [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
      255,
    ],
  ]),
);

// ── PRIMITIVES ───────────────────────────────────────────────────────────────
// The same six the parts bin uses. Restated rather than shared because they are
// six lines and importing them would couple two generators that have nothing
// else to say to each other.

const make = (w, h, ch = ".") =>
  Array.from({ length: h }, () => new Array(w).fill(ch));
const put = (g, x, y, c) => {
  if (y >= 0 && y < g.length && x >= 0 && x < g[0].length) g[y][x] = c;
};
const rect = (g, x, y, w, h, c) => {
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) put(g, x + i, y + j, c);
};
const hline = (g, x, y, w, c) => rect(g, x, y, w, 1, c);
const vline = (g, x, y, h, c) => rect(g, x, y, 1, h, c);
const outline = (g, x, y, w, h, c = "O") => {
  hline(g, x, y, w, c);
  hline(g, x, y + h - 1, w, c);
  vline(g, x, y, h, c);
  vline(g, x + w - 1, y, h, c);
};
const rows = (g) => g.map((r) => r.join(""));
const size = (id) => CAMPUS_ART_SIZE[id];

/**
 * A CONNECTED LINE between two points — the one primitive the parts bin does not
 * have, and the gantry cannot do without.
 *
 * It steps the MAJOR axis, which is the whole of why it exists: a diagonal
 * sampled down its minor axis lays a pixel every three or four columns, and the
 * art linter calls those orphans because that is exactly what they look like.
 */
function line(g, x0, y0, x1, y1, c) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps;
    put(g, Math.round(x0 + dx * t), Math.round(y0 + dy * t), c);
  }
}

/** How tall one bay of the gantry's lattice is (px) — a brace every this many
 * rows, and a platform every third one. */
const BAY = 12;

/**
 * A BOX STANDING ON THE GROUND, which is nine tenths of this file: a filled
 * body, an ink edge all the way round, and a lit return one pixel inside the
 * left-hand edge.
 *
 * The lit return is the single most load-bearing line in the whole generator and
 * it is the town's own trick (`facadeShell`): without it a building at this size
 * is a flat rectangle of one colour, and with it the eye reads a solid with a
 * light on one side of it. Everything on this site is lit from the left, because
 * everything on the road is.
 */
function block(g, x, y, w, h, fill, shade) {
  rect(g, x, y, w, h, fill);
  vline(g, x + 1, y + 1, h - 2, shade === undefined ? fill : lighten(shade));
  vline(g, x + w - 2, y + 1, h - 2, shade ?? fill);
  outline(g, x, y, w, h);
}

/** …and the "lighten" the return wants, which at two tones per material is
 * simply the material's OWN light tone. Passing the shade and deriving the
 * highlight from a table keeps every call site to one colour argument. */
const LIGHTER = {
  g: "G",
  w: "W",
  s: "S",
  c: "C",
  k: "K",
  b: "B",
  y: "Y",
  r: "R",
};
const lighten = (ch) => LIGHTER[ch] ?? ch;

// ── THE PIECES ───────────────────────────────────────────────────────────────

/**
 * THE PALISADE. One bay, tiled the length of the site.
 *
 * A PALISADE AND NOT A CHAIN-LINK, and the choice is doing work: a mesh fence at
 * 24 px is a grey haze, where a row of pales is a RHYTHM — and a rhythm is the
 * only thing that reads at a hundred miles an hour. It is also the correct fence
 * for the building behind it, which is the other half of why the campus lands
 * as somewhere secure rather than as somewhere tidy.
 */
function fence() {
  const [w, h] = size("goodco_fence");
  const g = make(w, h);
  // The pales, on a three-pixel pitch with a pointed cap. The cap is one pixel
  // and it is what separates a fence from a row of sticks.
  for (let x = 1; x < w - 1; x += 3) {
    vline(g, x, 2, h - 6, "S");
    vline(g, x + 1, 2, h - 6, "s");
    put(g, x, 1, "s");
  }
  // Two rails behind them, and the ink line the whole thing stands on.
  hline(g, 0, 4, w, "s");
  hline(g, 0, h - 8, w, "s");
  // The plinth: a poured kerb the pales are set into, which is what stops the
  // fence floating on the apron behind it.
  rect(g, 0, h - 4, w, 3, "C");
  hline(g, 0, h - 4, w, "c");
  hline(g, 0, h - 1, w, "O");
  return rows(g);
}

/**
 * THE GATE — shut, and the only piece of the fence that is not a repeat.
 *
 * It is a SLIDING gate with its own track and a red lamp over it, because a
 * hinged one would need somewhere to swing to and the whole point of the object
 * is that there is no way through it. The hero pulls up beside it and asks how
 * he is supposed to get in; the picture has to have already answered.
 */
function gate() {
  const [w, h] = size("goodco_gate");
  const g = make(w, h);
  // The leaf, and the mesh inside it — a coarse DIAGONAL, because a square grid
  // at this size moirés against the pixel grid and a diagonal does not. Drawn
  // inside the leaf's own bounds rather than clipped afterwards, so a strand
  // never runs out over the posts.
  const leafX = 2;
  const leafY = 4;
  const leafW = w - 4;
  const leafH = h - 8;
  rect(g, leafX, leafY, leafW, leafH, "K");
  for (let start = -leafH; start < leafW; start += 4) {
    for (let j = 0; j < leafH; j++) {
      const x = start + j;
      if (x < 0 || x >= leafW) continue;
      put(g, leafX + x, leafY + j, "k");
    }
  }
  outline(g, leafX, leafY, leafW, leafH, "S");
  // The centre stile where the two leaves meet, which is what says SHUT.
  vline(g, Math.floor(w / 2) - 1, 4, h - 8, "S");
  vline(g, Math.floor(w / 2), 4, h - 8, "s");
  // The posts, the track it runs on, and the ink under the lot. Four px so the
  // block's lit return has somewhere to go — at three the ink edges meet in the
  // middle and a post comes out as a black stripe.
  block(g, 0, 2, 4, h - 3, "S", "s");
  block(g, w - 4, 2, 4, h - 3, "S", "s");
  hline(g, 0, h - 3, w, "c");
  hline(g, 0, h - 1, w, "O");
  // …and the lamp over it. One red pixel with a cowl: a light that is ON and is
  // not letting you in.
  put(g, Math.floor(w / 2) - 1, 1, "R");
  put(g, Math.floor(w / 2), 1, "r");
  hline(g, Math.floor(w / 2) - 2, 0, 4, "s");
  return rows(g);
}

/**
 * THE TOTEM SIGN — the only words on the site, and they are not words.
 *
 * IT SPELLS NOTHING, deliberately. A 30-px face carrying six glyphs at the pixel
 * font's gauge would be four pixels of letter each and would read as a fringe;
 * what reads at speed is a LIT PANEL WITH A MARK ON IT, which is what a company
 * sign is from a car anyway. The mark is GOODCO's own — a ring with a bar
 * through it — and it is the same shape wherever the company appears.
 */
function sign() {
  const [w, h] = size("goodco_sign");
  const g = make(w, h);
  const faceH = h - 14;
  // The face: a dark panel with a lit border, on the cool brand colour.
  block(g, 0, 0, w, faceH, "K", "k");
  outline(g, 1, 1, w - 2, faceH - 2, "B");
  // THE MARK. A ring with a bar through it, centred — drawn by hand rather than
  // by a circle routine, because a rasterised circle of radius 5 is a lumpy
  // octagon and a hand-set one is a ring.
  const cx = Math.floor(w / 2);
  const cy = Math.floor(faceH / 2);
  const ring = [
    [-2, -4],
    [-1, -4],
    [0, -4],
    [1, -4],
    [-3, -3],
    [2, -3],
    [-4, -2],
    [3, -2],
    [-4, -1],
    [3, -1],
    [-4, 0],
    [3, 0],
    [-4, 1],
    [3, 1],
    [-3, 2],
    [2, 2],
    [-2, 3],
    [-1, 3],
    [0, 3],
    [1, 3],
  ];
  for (const [dx, dy] of ring) put(g, cx + dx, cy + dy, "B");
  hline(g, cx - 6, cy - 1, 13, "B");
  hline(g, cx - 6, cy, 13, "b");
  // The two legs and the pad they are cast into.
  // Four px each, not three: the block's ink edges meet in the middle of a
  // three-wide leg and it comes out as a black stripe rather than as steel.
  block(g, 4, faceH - 1, 4, h - faceH - 2, "S", "s");
  block(g, w - 8, faceH - 1, 4, h - faceH - 2, "S", "s");
  rect(g, 2, h - 3, w - 4, 2, "C");
  hline(g, 2, h - 1, w - 4, "O");
  return rows(g);
}

/**
 * A FLOODLIGHT MAST over the staff lot.
 *
 * The one WARM thing on the whole site, and it is warm because a car park is lit
 * with sodium and a building is not. Three heads on a bracket, thrown down and
 * to the right — the direction every other shadow on this road falls.
 */
function flood() {
  const [w, h] = size("goodco_flood");
  const g = make(w, h);
  const cx = Math.floor(w / 2) - 1;
  // The column, tapering: two px at the top and four at the foot, which is what
  // makes 60 px of steel read as tall rather than as a wire.
  vline(g, cx, 6, h - 8, "S");
  vline(g, cx + 1, 6, h - 8, "s");
  rect(g, cx - 1, h - 16, 4, 14, "S");
  vline(g, cx + 2, h - 16, 14, "s");
  // The base, cast into the apron.
  rect(g, cx - 2, h - 3, 6, 2, "C");
  hline(g, cx - 2, h - 1, 6, "O");
  // The bracket and its three heads.
  hline(g, 1, 5, w - 2, "s");
  for (let i = 0; i < 3; i++) {
    const x = 1 + i * 4;
    rect(g, x, 2, 3, 3, "y");
    hline(g, x, 4, 3, "Y");
    put(g, x + 1, 1, "s");
  }
  return rows(g);
}

/**
 * A DATA HALL — the shed the whole company is, drawn twice at two sizes.
 *
 * FOUR FACTS AND NO WINDOWS, which is the entire design of the object:
 *
 *   THE PLANT ON THE ROOF is most of the silhouette, and it has to be, because
 *   it is the only part of this building that does anything. Chillers in a row,
 *   at their own gauge — a roofline that steps is what stops a 120-px box being
 *   a 120-px box.
 *   THE RIBS are the cladding, every four px, and they are what gives the wall
 *   a surface at all.
 *   THE LOUVRE BANKS are where the air goes in, and they are the only openings:
 *   a data hall has no windows, and drawing one would make this an office.
 *   THE BRAND BAND is a lit stripe at eye level. It is the one saturated colour
 *   in the picture and it is what makes three grey sheds legible as one company.
 */
function hall(id, { tower = false } = {}) {
  const [w, h] = size(id);
  const g = make(w, h);
  const roofH = tower ? 12 : 9;
  const baseH = 4;
  const wallY = roofH;
  const wallH = h - roofH - baseH;

  // THE WALL, ribbed. Drawn before anything is cut into it.
  block(g, 0, wallY, w, wallH, "G", "g");
  for (let x = 4; x < w - 3; x += 4) vline(g, x, wallY + 1, wallH - 2, "g");

  // THE LOUVRE BANKS. Wide, low, evenly spaced, and stopping short of both
  // corners — plant is never at the very end of an elevation.
  const bandY = wallY + Math.round(wallH * 0.18);
  const bandH = Math.max(5, Math.round(wallH * 0.28));
  for (let x = 6; x + 12 <= w - 6; x += 18) {
    rect(g, x, bandY, 12, bandH, "K");
    for (let j = 1; j < bandH - 1; j += 2) hline(g, x + 1, bandY + j, 10, "k");
    outline(g, x, bandY, 12, bandH, "o");
  }

  // THE BRAND BAND, at eye level and running the full elevation.
  const brandY = wallY + wallH - Math.max(5, Math.round(wallH * 0.22));
  hline(g, 1, brandY, w - 2, "b");
  hline(g, 1, brandY + 1, w - 2, "B");
  hline(g, 1, brandY + 2, w - 2, "b");

  // THE DOOR. One, and it is the joke: a shed the size of a street with a single
  // personnel door in it, lit from inside.
  const doorX = tower ? w - 14 : Math.round(w * 0.62);
  rect(g, doorX, wallY + wallH - 7, 5, 7, "K");
  vline(g, doorX + 1, wallY + wallH - 6, 5, "L");
  outline(g, doorX, wallY + wallH - 7, 5, 7, "o");

  // THE PLANT ON THE ROOF — chillers, and on the tall one a pair of dishes.
  const chillers = Math.max(2, Math.floor((w - 12) / 26));
  for (let i = 0; i < chillers; i++) {
    const cw = 16;
    const x = 8 + i * Math.floor((w - 16) / chillers);
    const ch = roofH - 3;
    block(g, x, roofH - ch - 1, cw, ch + 1, "C", "c");
    // The fan grilles, which is what makes a box on a roof read as machinery.
    for (let j = 2; j < ch - 1; j += 2)
      hline(g, x + 2, roofH - ch + j, cw - 4, "c");
  }
  if (tower) {
    // Two dishes on a frame — the one piece of the site that says the company
    // is talking to something a long way off.
    for (const dx of [w - 26, w - 14]) {
      vline(g, dx + 3, 2, 6, "s");
      rect(g, dx, 1, 7, 3, "W");
      hline(g, dx, 0, 7, "w");
      put(g, dx + 3, 4, "S");
    }
    // …and the stair tower up the near end, which is what the height is FOR: a
    // tall box with nothing on it is a wall, and a tall box with a stair on it
    // is a building.
    block(g, 0, roofH - 6, 15, h - roofH - baseH + 6, "C", "c");
    for (let y = roofH; y < h - baseH - 2; y += 4) hline(g, 2, y, 11, "c");
    hline(g, 1, roofH - 5, 13, "S");
  }

  // THE PARAPET and the base. Both are one line of ink over a light course, and
  // both are what stop the building dissolving into the sky and the apron.
  hline(g, 0, wallY - 1, w, "W");
  hline(g, 0, wallY, w, "w");
  rect(g, 0, h - baseH, w, baseH - 1, "C");
  hline(g, 0, h - baseH, w, "c");
  hline(g, 0, h - 1, w, "O");
  return rows(g);
}

/**
 * THE SERVICE GANTRY — the tower beside the ship.
 *
 * A LATTICE, and it has to be drawn as one rather than as a shaded column: what
 * makes a gantry a gantry is that you can see the sky through it. Two legs, a
 * brace every ten rows, a platform every thirty, and a crane arm at the top with
 * a red lamp on it.
 */
function gantry() {
  const [w, h] = size("goodco_gantry");
  const g = make(w, h);
  const left = 4;
  const right = w - 6;
  // The legs, splayed: the foot is wider than the head, which is what makes a
  // tall thin thing look like it is standing rather than hanging.
  for (let y = 6; y < h - 2; y++) {
    const t = (y - 6) / (h - 8);
    const lx = Math.round(left - t * 3);
    const rx = Math.round(right + t * 3);
    put(g, lx, y, "S");
    put(g, lx + 1, y, "s");
    put(g, rx, y, "S");
    put(g, rx + 1, y, "s");
  }
  // THE BRACING — an X in every bay, and it is the whole read of the object.
  //
  // DRAWN AS A CONNECTED LINE rather than sampled per row, which is the trap
  // this shape sets: the span is three times the bay's height, so stepping down
  // a row at a time and solving for x lays down four-pixel gaps and the tower
  // comes out as a column of loose specks. (The art linter says so in as many
  // words — "orphan pixel(s)" — and it is right.) Stepping the MAJOR axis is
  // the fix, and it is what `line` below is for.
  const legX = (y, side) => {
    const t = (y - 6) / (h - 8);
    return side < 0 ? Math.round(left - t * 3) + 1 : Math.round(right + t * 3);
  };
  for (let y = 8; y + BAY < h - 6; y += BAY) {
    line(g, legX(y, -1), y, legX(y + BAY, 1), y + BAY, "s");
    line(g, legX(y, 1), y, legX(y + BAY, -1), y + BAY, "s");
    // …and a WORK PLATFORM at every third bay: the horizontal that says people
    // stand on this thing.
    if (Math.floor(y / BAY) % 3 === 0) {
      const lx = legX(y, -1) - 2;
      const rx = legX(y, 1) + 3;
      hline(g, lx, y, rx - lx, "S");
      hline(g, lx, y + 1, rx - lx, "O");
    }
  }
  // The crane arm across the head, and the lamp on the end of it.
  hline(g, 2, 4, w - 4, "S");
  hline(g, 2, 5, w - 4, "s");
  vline(g, w - 8, 5, 5, "s");
  put(g, 3, 3, "R");
  put(g, 3, 2, "r");
  hline(g, 0, h - 1, w, "O");
  return rows(g);
}

/**
 * THE SHIP — the thing standing behind a mailroom, and the biggest single object
 * this game draws.
 *
 * IT IS A BODY OF REVOLUTION, which at 34 px means: symmetric about one column,
 * with the shading a fixed ramp off that column and NOT a gradient. Three tones
 * across the barrel (light left, white centre, shade right) is what makes a
 * cylinder; four is mush and two is a plank.
 *
 * WHY IT IS HERE AT ALL. The player has spent the whole game so far in a garage
 * building a rocket out of scrap, and the joke the campus makes in three seconds
 * is one of PROPORTION — the company he is going to beg a part off has a finished
 * stack on a pad in the back garden. Nothing says it out loud. He looks at the
 * site and remarks that it is GOODCO.
 */
function rocket() {
  const [w, h] = size("goodco_rocket");
  const g = make(w, h);
  const cx = Math.floor(w / 2);
  const noseH = 30;
  const finY = h - 34;
  const bellH = 8;

  /** One course of the barrel, at a half-width — the three-tone ramp, once, so
   * the nose and the body cannot shade differently. */
  const course = (y, half, fill = "W") => {
    rect(g, cx - half, y, half * 2, 1, fill);
    put(g, cx - half, y, fill === "W" ? "w" : fill);
    put(g, cx - half + 1, y, fill === "W" ? "W" : fill);
    for (let i = 1; i <= Math.min(3, half); i++) {
      put(g, cx + half - i, y, fill === "W" ? "w" : fill);
    }
    put(g, cx - half - 1, y, "O");
    put(g, cx + half, y, "O");
  };

  // THE NOSE — a fairing rather than a cone: it curves out of the point and
  // meets the barrel tangentially, which is what every real one does and what
  // stops the top of the ship looking like a pencil.
  for (let y = 0; y < noseH; y++) {
    const t = y / noseH;
    const half = Math.max(1, Math.round(Math.sqrt(t) * (w / 2 - 2)));
    course(y, half);
  }
  const half = Math.round(w / 2 - 2);
  // …AND THE BARREL ALL THE WAY TO THE SKIRT. It used to stop twenty rows into
  // the fins on the reasoning that the flare would cover it, which it does not:
  // the flare is drawn OUTSIDE the barrel's own half-width, so the last six
  // rows of the ship came out as a hole with the fins standing either side of
  // it.
  for (let y = noseH; y < h - bellH; y++) course(y, half);

  // THE BANDS. Two dark ones where the stages part, and a red stripe between
  // them — the one saturated colour on the ship, and the reason the eye reads a
  // 168-px white shape as a vehicle rather than as a tower.
  for (const y of [noseH + 4, finY - 6]) {
    rect(g, cx - half, y, half * 2, 3, "O");
  }
  rect(g, cx - half, noseH + 22, half * 2, 5, "R");
  hline(g, cx - half, noseH + 26, half * 2, "r");
  // …and the company's own mark on the flank: the ring and the bar again, small.
  const my = noseH + 40;
  for (const dy of [0, 5]) hline(g, cx - 3, my + dy, 7, "B");
  for (const dy of [1, 2, 3, 4]) {
    put(g, cx - 4, my + dy, "B");
    put(g, cx + 4, my + dy, "B");
  }
  hline(g, cx - 6, my + 2, 13, "b");

  // THE FINS — three, and the middle one is drawn as a face rather than an
  // edge, so the stack reads as standing on a tripod instead of on a cross.
  for (let y = finY; y < h - bellH; y++) {
    const t = (y - finY) / (h - bellH - finY);
    const reach = Math.round(t * (cx - 2));
    rect(g, cx - half - reach, y, reach + 1, 1, "w");
    rect(g, cx + half, y, reach + 1, 1, "w");
    put(g, cx - half - reach, y, "O");
    put(g, cx + half + reach, y, "O");
  }
  rect(g, cx - 3, finY, 6, h - bellH - finY, "w");
  vline(g, cx - 3, finY, h - bellH - finY, "O");
  vline(g, cx + 2, finY, h - bellH - finY, "O");

  // THE ENGINES. A skirt and three bells, dark — the bottom of a rocket is the
  // one part of it that is never white.
  rect(g, cx - half, h - bellH, half * 2, 2, "s");
  for (const dx of [-half + 1, -2, half - 6]) {
    rect(g, cx + dx, h - bellH + 2, 5, bellH - 3, "s");
    hline(g, cx + dx, h - 2, 5, "O");
    vline(g, cx + dx, h - bellH + 2, bellH - 3, "O");
    vline(g, cx + dx + 4, h - bellH + 2, bellH - 3, "O");
  }
  hline(g, cx - half - 1, h - 1, half * 2 + 2, "O");
  return rows(g);
}

/**
 * EVERY PIECE OF THE CAMPUS — the whole site, as `name → grid`.
 *
 * Called once by the sprite pipeline. A mod that ships its OWN end-of-road gets
 * the identical treatment by calling this with its own table, which is the same
 * door `deriveTown` opens for a high street.
 */
export function campusPieces() {
  return {
    goodco_fence: fence(),
    goodco_gate: gate(),
    goodco_sign: sign(),
    goodco_flood: flood(),
    goodco_hall: hall("goodco_hall"),
    goodco_hall_tall: hall("goodco_hall_tall", { tower: true }),
    goodco_gantry: gantry(),
    goodco_rocket: rocket(),
  };
}

/**
 * …and the check that each came out the size the LAYOUT believes it is.
 *
 * The same guard `townArtSizeCheck` is, and it exists for the same failure: the
 * planner places a hall by its own half-width, so a grid one pixel out does not
 * look slightly wrong — it stands somewhere nothing put it, and it does so
 * silently. Run at build time, refusing the build rather than warning.
 */
export function campusPiecesCheck(pieces) {
  const errors = [];
  for (const [name, grid] of Object.entries(pieces)) {
    const want = CAMPUS_ART_SIZE[name];
    if (!want) {
      errors.push(`campus: "${name}" has no entry in CAMPUS_ART_SIZE`);
      continue;
    }
    const got = [grid[0]?.length ?? 0, grid.length];
    if (got[0] !== want[0] || got[1] !== want[1]) {
      errors.push(
        `campus: "${name}" is ${got[0]}x${got[1]}, but CAMPUS_ART_SIZE says ${want[0]}x${want[1]}`,
      );
    }
  }
  for (const name of Object.keys(CAMPUS_ART_SIZE)) {
    if (!(name in pieces)) errors.push(`campus: "${name}" has no art`);
  }
  return errors;
}
