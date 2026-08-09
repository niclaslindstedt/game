// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// HOME FROM THE ROAD — the site at the end of the drive BACK, ruled rather than
// drawn.
//
// WHY GENERATED, on the same rule `campus.mjs` next door is: everything here is
// REGULAR AT A GAUGE. A picket fence is a pale every two pixels; a roll-up door
// is a slat every three; a slate roof is a course every four; a rocket is a body
// of revolution, which at this size means "symmetric about one column and shaded
// off that column". Those are the things a hand gets wrong at 1x and a loop gets
// right every time, and two of them are BIG — the ship is 34x96, which is three
// thousand pixels nobody should be placing by eye.
//
// AND THE SIZES ARE NOT AN ARTIST'S CALL. They are the engine's
// (`HOME_ART_SIZE`, engine/game/drive/homestead-parts.ts), because the layout
// places each piece against them: a house a pixel wider than its entry does not
// look slightly wrong, it lands somewhere it was not put.
//
// WHAT THE PLACE IS SUPPOSED TO SAY, since every shape below is in service of
// it. This is the answer to GOODCO and it is built to be read against it. That
// end of the road is a palisade, three windowless halls and a 168-px launch
// stack behind a floodlit apron; this end is a timber fence a man could step
// over, one lit window, a garage with its door up and a rocket a third the
// height of theirs standing on the grass beside it. Same beat, same run-in, same
// last thing on the skyline — and the entire distance between the two lives is
// in the size of the rocket.
//
// THE STAGING IS THE LAUNCH SCENE'S (`content/cutscenes/launch.yaml`) because it
// has to be: the player has watched this lot from the front and is going to
// watch a rocket go up off it. Garage door up, ship hard beside it, two trees on
// the lawn — and the house WHOLE, because nothing has been lit here yet the only
// time this road is driven.
//
// EVERY PIECE IS SEEN AT NIGHT, from a road, at speed. So: hard ink
// silhouettes, two tones per material and no more, and every light source drawn
// as a small saturated core rather than a glow — the renderer is not going to
// bloom these, and a soft edge at this size is a smudge.

import { HOME_ART_SIZE } from "../../engine/game/drive/homestead-parts.ts";

// ── THE PALETTE ──────────────────────────────────────────────────────────────
//
// ONE PALETTE FOR THE WHOLE PLOT, for the reason the campus has one for the
// whole site: this is one PLACE. And it is deliberately WARMER than GOODCO's —
// brick, creosoted timber, slate and one sodium porch lamp against that site's
// concrete, galvanising and corporate blue-white. The change of temperature is
// half of what tells the player which end of the road he has arrived at, before
// he has read a single shape.

const HOME_HEX = {
  O: "#1a1c2c", // ink
  o: "#2a2436", // soft ink — an inside edge, a shadow under a sill
  R: "#92643e", // the roof's warm brown (garage_house)
  r: "#5d4028", // …its shadow, and the eaves band over the garage
  C: "#c6c6c6", // grey wall siding (garage_house)
  c: "#96979b", // …shaded
  K: "#303444", // a dark opening — the garage's mouth, an unlit window
  k: "#3f4553", // …the slate panel of the raised door, and the fin roots
  L: "#ffb02e", // THE amber window (garage_house) — the one warm light he owns
  l: "#b9741c", // …its glazing bars
  T: "#7c5433", // timber — the fence's pales and the tree's trunk (garage_tree)
  t: "#4a3120", // …shaded
  V: "#5d8a44", // moonlit leaf (garage_tree)
  F: "#3c6b33", // mid canopy
  f: "#2c5027", // canopy shade
  d: "#1f3a1d", // deep shade, down the crown's right
  W: "#d6dce4", // the ship's white hull (ship_0)
  w: "#8d9196", // …its grey shadow, and the swept fins
  x: "#c5e6eb", // pale cyan porthole glass (ship_0)
  S: "#9aa3ad", // galvanised steel — the post box on the gate pier
  s: "#5f6874", // …shaded
  G: "#414d56", // cast stone — the caps on the gate piers
  g: "#2b333a", // …shaded
  Y: "#ffd98a", // the lamp over the gate
  y: "#c9a94e", // …its bracket
};

/** …as concrete `[r,g,b,a]`, which is what everything downstream wants. Hex is
 * the authoring format and stops at this line. */
export const HOME_PALETTE = Object.fromEntries(
  Object.entries(HOME_HEX).map(([char, hex]) => [
    char,
    [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
      255,
    ],
  ]),
);

// ── THE PRIMITIVES ───────────────────────────────────────────────────────────
// The same six the campus uses. Restated rather than shared for the reason it
// restates the parts bin's: they are six lines, and importing them would couple
// two generators that have nothing else to say to each other.

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
const size = (id) => HOME_ART_SIZE[id];

/** …and the "lighten" a lit return wants, which at two tones per material is
 * simply the material's OWN light tone. */
const LIGHTER = { r: "R", c: "C", t: "T", g: "G", s: "S", w: "W", f: "V" };
const lighten = (ch) => LIGHTER[ch] ?? ch;

/**
 * A BOX STANDING ON THE GROUND, which is most of this file: a filled body, an
 * ink edge all the way round, and a lit return one pixel inside the left-hand
 * edge.
 *
 * The lit return is the single most load-bearing line in the whole generator and
 * it is the town's own trick (`facadeShell`): without it a building at this size
 * is a flat rectangle of one colour, and with it the eye reads a solid with a
 * light on one side of it. Everything on this lot is lit from the left, because
 * everything on this road is.
 */
function block(g, x, y, w, h, fill, shade) {
  rect(g, x, y, w, h, fill);
  vline(g, x + 1, y + 1, h - 2, shade === undefined ? fill : lighten(shade));
  vline(g, x + w - 2, y + 1, h - 2, shade ?? fill);
  outline(g, x, y, w, h);
}

/** A window: a dark hole with a lit edge along its top and left, and a sill
 * under it. `lit` swaps the hole for the one warm colour on the plot. */
function window(g, x, y, w, h, lit = false) {
  rect(g, x, y, w, h, lit ? "L" : "K");
  if (lit) {
    // A LIT PANE IS NOT A FLAT PATCH OF YELLOW. Two courses of glazing bar
    // across it is what turns a rectangle of light into a window somebody is
    // standing behind, and at this size it is the whole of the effect.
    hline(g, x, y + Math.floor(h / 2), w, "l");
    if (w >= 5) vline(g, x + Math.floor(w / 2), y, h, "l");
  } else {
    hline(g, x, y, w, "k");
  }
  outline(g, x - 1, y - 1, w + 2, h + 2, "o");
  hline(g, x - 1, y + h, w + 2, lit ? "l" : "o");
}

// ── THE PIECES ───────────────────────────────────────────────────────────────

/**
 * THE FENCE ALONG THE FRONT OF THE PLOT. One bay, tiled the length of it.
 *
 * A PICKET AND NOT A PALISADE, and the choice is the whole point of the piece:
 * GOODCO's boundary is there to keep you out and this one is there to say where
 * the grass stops. It is low — ten px against the campus fence's sixteen — the
 * pales are blunt rather than pointed, and there is a gap you could get an arm
 * through. A rhythm is the only thing that reads at a hundred miles an hour, so
 * the pales are on a strict two-pixel pitch with a post every bay.
 */
function fence() {
  const [w, h] = size("home_fence");
  const g = make(w, h);
  // The pales: two px of timber, one px of night, all the way along. The GAP is
  // the whole piece — a picket with no daylight through it is a wall — so the
  // rails behind are drawn in the dark tone and only on their own two rows.
  for (let x = 4; x < w; x += 3) {
    vline(g, x, 2, h - 3, "T");
    vline(g, x + 1, 3, h - 4, "t");
    put(g, x, 2, "t");
    put(g, x + 1, 2, "O");
  }
  hline(g, 3, 4, w - 3, "t");
  hline(g, 3, h - 4, w - 3, "t");
  // …and the post at the head of the bay, square and a shade proud of the pales,
  // which is what ties one bay to the next.
  block(g, 0, 1, 3, h - 1, "T", "t");
  hline(g, 0, h - 1, w, "O");
  return rows(g);
}

/**
 * THE GAP IN IT HIS DRIVE COMES OUT OF — two brick piers and the box the post
 * goes in, with the way through left open between them.
 *
 * OPEN, AND THAT IS THE READ. GOODCO's gate is shut and slides; this one has no
 * leaf on it at all, because nothing here has ever needed shutting and because
 * the car has to be able to come out of it — the finish line, as a picture.
 */
function gate() {
  const [w, h] = size("home_gate");
  const g = make(w, h);
  const pier = 9;
  const capH = 4;
  for (const x of [0, w - pier]) {
    block(g, x, capH, pier, h - capH, "C", "c");
    // A cast cap on each, a course proud of the pier, so the top of it reads as
    // finished rather than as cut off.
    block(g, x - 1, capH - 3, pier + 2, 4, "G", "g");
    // …and the lamp standing on it. Two of them, and they are the only lights on
    // this whole plot bar the one window — which is exactly how much light a man
    // who spends his money on rocket parts leaves on outside.
    rect(g, x + 3, 0, 3, 3, "Y");
    outline(g, x + 2, 0, 5, 4, "O");
    put(g, x + 4, 3, "y");
  }
  // THE POST BOX on the left pier — one small bright thing at eye height, which
  // is what stops forty pixels of masonry reading as two lumps of it.
  rect(g, 2, 11, 5, 4, "S");
  hline(g, 2, 11, 5, "s");
  outline(g, 1, 10, 7, 6, "O");
  // …and the nameplate on the right one, which is a plate and not a name: at
  // this size lettering is noise, and the shape of a plaque says the same thing.
  rect(g, w - 7, 12, 5, 3, "c");
  outline(g, w - 8, 11, 7, 5, "O");
  return rows(g);
}

/**
 * THE HOUSE, WITH THE GARAGE JOINED ONTO IT.
 *
 * IT IS `garage_house` AT TWICE THE SIZE, and it is deliberately a scale-up
 * rather than a redesign: the player has watched this building from the front
 * for the whole of the launch scene and walked it as a hub, so the drive home
 * arriving at a DIFFERENT house would be the game contradicting itself in the
 * one beat that is supposed to land as recognition. Same peaked brown roof, same
 * grey siding, same one amber window, same open garage bay with its slate door
 * raised into the head of the opening. What the extra pixels buy is texture —
 * board lines in the siding, courses in the roof, a reveal round the bay — not a
 * new building.
 *
 * ONE LIT WINDOW. Not three: a house with every light on is a house with people
 * in it, and there is nobody in this one. He is the one arriving.
 */
function house() {
  const [w, h] = size("home_house");
  const g = make(w, h);
  const dwellW = 50; // …and the garage is the rest
  const eaves = 14; // where the roof stops and the walls start

  // THE ROOF — a low peak with a flat ridge, spreading to the eaves: exactly the
  // trapezoid `garage_house` draws, at the same proportions (a ridge a little
  // over half the frontage, a pitch about a third of the building's height).
  //
  // IT STARTS TWO ROWS DOWN and that is not slack. A flat ridge run right up to
  // the top edge of its own box reads as a roof somebody CROPPED — the eye has
  // nothing to tell it whether the peak carries on above the sprite — and the
  // cutscene leaves the same gap for the same reason.
  const roofTop = 2;
  const roofH = eaves - roofTop;
  const ridgeHalf = 14;
  for (let i = 0; i < roofH; i++) {
    const y = roofTop + i;
    const inset = Math.round(
      ((roofH - 1 - i) * (dwellW / 2 - ridgeHalf)) / (roofH - 1),
    );
    const span = dwellW - inset * 2;
    hline(g, inset, y, span, "R");
    hline(g, inset, y, 2, "r");
    hline(g, inset + span - 2, y, 2, "r");
    put(g, inset, y, "O");
    put(g, inset + span - 1, y, "O");
  }
  hline(g, ridgeOf(0), roofTop, dwellW - ridgeOf(0) * 2, "O");
  // A course line every four rows down the pitch — a roof at this size is a
  // texture, and one horizontal every four px says tile without becoming a
  // pattern.
  for (let i = 4; i < roofH - 1; i += 4) {
    const inset = ridgeOf(i);
    hline(g, inset + 2, roofTop + i, dwellW - inset * 2 - 4, "r");
  }

  function ridgeOf(i) {
    return Math.round(
      ((roofH - 1 - i) * (dwellW / 2 - ridgeHalf)) / (roofH - 1),
    );
  }

  // …AND THE GARAGE'S OWN FASCIA, which is flat rather than pitched and sits a
  // little lower. That is the whole of what says "house, and then the bit he
  // built onto it".
  const fascia = eaves - 5;
  rect(g, dwellW - 2, fascia, w - dwellW + 2, 4, "r");
  outline(g, dwellW - 2, fascia, w - dwellW + 2, 4, "O");

  // THE WALLS — grey siding, the dwelling's and the garage's, each its own box
  // so the join between them reads as a join.
  const wallY = eaves - 1;
  const wallH = h - wallY;
  block(g, 0, wallY, dwellW, wallH, "C", "c");
  block(g, dwellW - 2, wallY, w - dwellW + 2, wallH, "C", "c");
  // Board lines, every five rows, held off both ends so the lit return survives.
  for (let y = wallY + 4; y < h - 2; y += 5) {
    hline(g, 3, y, dwellW - 6, "c");
    hline(g, dwellW + 1, y, w - dwellW - 3, "c");
  }

  // THE AMBER WINDOW, and the front door beside it. The window is the accent of
  // the whole plot; the door is a dark panel standing on the base course with a
  // handle on it.
  window(g, 9, wallY + 5, 12, 11, true);
  rect(g, 29, wallY + 9, 12, wallH - 10, "K");
  outline(g, 28, wallY + 8, 14, wallH - 8, "O");
  put(g, 38, wallY + 15, "L");

  // THE BAY, WITH THE DOOR UP. A slate panel curled into the head of the opening
  // and dark all the way down under it — the picture of a garage somebody rolled
  // something out of and never got round to shutting.
  const bx = dwellW + 5;
  const bw = w - dwellW - 12;
  rect(g, bx, wallY + 4, bw, wallH - 5, "K");
  rect(g, bx, wallY + 4, bw, 7, "k");
  // Slats across the raised door, on a three-px pitch: a flat panel is a lintel,
  // a striped one is a shutter.
  for (let y = wallY + 5; y < wallY + 11; y += 3) hline(g, bx, y, bw, "K");
  outline(g, bx - 1, wallY + 3, bw + 2, wallH - 3, "O");
  return rows(g);
}

/**
 * A TREE ON THE LAWN — `garage_tree` at the road's own gauge.
 *
 * A ROUND CROWN WITH THE LIGHT ACROSS IT DIAGONALLY, which is the cutscene's own
 * construction and a better one than the lobes this started as: four tones
 * stepping from moonlit leaf at the top left to near-black at the bottom right,
 * on a rim broken just enough not to read as ruled. At a hundred and twenty miles
 * an hour what carries is the diagonal, not the leaf detail.
 *
 * IN LEAF, AND IT STAYS IN LEAF. Every later fire on this lawn takes a tree with
 * it (`content/cutscenes/launch.yaml` climbs `garage_tree` → `_charred` →
 * `_ashen`), and none of those fires has been lit the only time this road is
 * driven.
 */
function tree() {
  const [w, h] = size("home_tree");
  const g = make(w, h);
  const cx = w / 2;
  const crownH = 28;
  const cy = crownH / 2;
  const r = Math.min(cx, cy);
  // THE TRUNK FIRST, running up INTO the crown and flaring where it meets the
  // ground — a canopy floating clear of its own stem reads as two objects, and a
  // stem that does not widen at the base reads as a pole.
  const trunkY = crownH - 6;
  const stem = Math.floor(cx) - 2;
  block(g, stem, trunkY, 5, h - trunkY, "T", "t");
  // …and the ROOT FLARE: the last four rows widen a px a side, drawn as a solid
  // so the base is one shape. Stepped pixels hung off the sides read as orphans
  // at 1x — which is exactly what the art linter calls them.
  for (let i = 0; i < 4; i++) {
    const y = h - 4 + i;
    const grow = i + 1;
    rect(g, stem - grow, y, 5 + grow * 2, 1, "T");
    put(g, stem + 3, y, "t");
    put(g, stem + 4 + grow, y, "t");
    put(g, stem - grow, y, "O");
    put(g, stem + 4 + grow, y, "O");
  }
  hline(g, stem - 4, h - 1, 13, "O");
  // THE CROWN — one disc, four tones off the diagonal. The rim is stepped in a
  // px here and there so the silhouette is leaf rather than compass.
  for (let y = 0; y < crownH; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x - cx + 0.5) / r;
      const dy = (y - cy + 0.5) / r;
      const wobble = ((x * 7 + y * 13) % 5 === 0 ? 0.06 : 0) + 0.94;
      if (dx * dx + dy * dy > wobble) continue;
      const t = (dx + dy + 2) / 4; // 0 at the top left, 1 at the bottom right
      put(g, x, y, t < 0.34 ? "V" : t < 0.52 ? "F" : t < 0.72 ? "f" : "d");
    }
  }
  // …and an ink edge all the way round it. Everything else on this lot is
  // outlined; a canopy that is not simply dissolves into the verge behind it.
  const leaf = new Set(["V", "F", "f", "d"]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!leaf.has(g[y]?.[x])) continue;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        if ((g[y + dy]?.[x + dx] ?? ".") === ".") put(g, x + dx, y + dy, "O");
      }
    }
  }
  return rows(g);
}

/**
 * THE SHIP — `ship_0`, standing where the launch scene stands it: hard beside
 * the garage door, cold, engines off.
 *
 * IT IS BUILT AGAINST GOODCO'S, PIECE FOR PIECE, AND IT LOSES EVERY COMPARISON.
 * That end of the road has a 168-px launch stack with a 124-px service gantry up
 * its side; this end has eighty pixels of home-made rocket with a row of
 * portholes down it and nothing holding it up but its own fins. Same shape on the
 * same skyline at the end of the same road, and the entire distance between the
 * two lives is in the size of it.
 *
 * THE PORTHOLES ARE THE SIGNATURE and they are the reason there is no stripe: a
 * red band would read faster at speed and it would also be the one thing on this
 * sprite the cutscene does not have. Three of them rather than the scene's two,
 * because the hull is proportionally taller out here.
 */
function ship() {
  const [w, h] = size("home_ship");
  const g = make(w, h);
  const cx = Math.floor(w / 2);
  const half = 8; // the hull's own half-width — slim, like the scene's
  const noseH = 13;
  const finY = h - 22;
  const baseY = h - 6;

  /** One course of the hull: white, with the grey shadow down its right — the
   * scene's own two-tone, once, so the nose and the barrel cannot disagree. */
  const course = (y, hw) => {
    rect(g, cx - hw, y, hw * 2, 1, "W");
    for (let i = 1; i <= Math.min(2, hw); i++) put(g, cx + hw - i, y, "w");
    put(g, cx - hw - 1, y, "O");
    put(g, cx + hw, y, "O");
  };

  // THE FINS FIRST, so the hull is drawn over their roots rather than under
  // them: three, swept, the outer pair spreading to the full width of the box
  // and the middle one drawn as a face so the ship stands on a tripod rather
  // than on a cross.
  for (let y = finY; y < baseY; y++) {
    const t = (y - finY) / (baseY - finY);
    const reach = Math.round(t * (cx - half - 2));
    rect(g, cx - half - reach, y, reach, 1, "w");
    rect(g, cx + half, y, reach, 1, "w");
    put(g, cx - half - reach, y, "O");
    put(g, cx + half + reach - 1, y, "O");
  }
  hline(g, cx - half - (cx - half - 2), baseY - 1, 3, "O");

  // THE NOSE — a point, widening to the hull. The scene's is a plain cone and so
  // is this one; a fairing would be a bigger programme's rocket.
  for (let y = 0; y < noseH; y++) {
    // Blunt at the tip rather than a spike: two px of hull at the top, widening
    // to the flank. A one-px point at this size is a stray column of ink.
    course(y, Math.max(2, Math.round(2 + (y / noseH) * (half - 2))));
  }
  for (let y = noseH; y < baseY; y++) course(y, half);

  // THE PORTHOLES — a recess in the hull with the glass in it, three down the
  // body. Ringed in ink and inset two px from each flank, exactly as the scene
  // rings its two.
  for (const y of [noseH + 6, noseH + 22, noseH + 38]) {
    rect(g, cx - half + 2, y, half * 2 - 4, 8, "K");
    rect(g, cx - 3, y + 2, 6, 4, "x");
    outline(g, cx - half + 2, y, half * 2 - 4, 8, "O");
  }

  // THE ENGINE AND THE FEET. One bell under a skirt, standing on two stubby
  // legs — theirs has three bells and a service gantry, and this is the clearest
  // pixel-level statement of the difference between the two programmes.
  rect(g, cx - half, baseY, half * 2, 2, "k");
  outline(g, cx - half - 1, baseY - 1, half * 2 + 2, 3, "O");
  rect(g, cx - 4, baseY + 2, 9, h - baseY - 4, "k");
  outline(g, cx - 5, baseY + 2, 11, h - baseY - 3, "O");
  for (const dx of [-half + 1, half - 5]) {
    rect(g, cx + dx, baseY + 2, 4, h - baseY - 3, "k");
    outline(g, cx + dx, baseY + 2, 4, h - baseY - 2, "O");
  }
  return rows(g);
}

/**
 * EVERY PIECE OF THE HOMESTEAD — the whole plot, as `name → grid`.
 *
 * Called once by the sprite pipeline, exactly as `campusPieces` is. A mod that
 * ships its OWN end-of-road gets the identical treatment by calling this with
 * its own table.
 */
export function homesteadPieces() {
  return {
    home_fence: fence(),
    home_gate: gate(),
    home_house: house(),
    home_tree: tree(),
    home_ship: ship(),
  };
}

/**
 * …and the check that each came out the size the LAYOUT believes it is.
 *
 * The same guard `campusPiecesCheck` is, and it exists for the same failure: the
 * planner places a house by its own half-width, so a grid one pixel out does not
 * look slightly wrong — it stands somewhere nothing put it, and it does so
 * silently. Run at build time, refusing the build rather than warning.
 */
export function homesteadPiecesCheck(pieces) {
  const errors = [];
  for (const [name, grid] of Object.entries(pieces)) {
    const want = HOME_ART_SIZE[name];
    if (!want) {
      errors.push(`homestead: "${name}" has no entry in HOME_ART_SIZE`);
      continue;
    }
    const got = [grid[0]?.length ?? 0, grid.length];
    if (got[0] !== want[0] || got[1] !== want[1]) {
      errors.push(
        `homestead: "${name}" is ${got[0]}x${got[1]}, but HOME_ART_SIZE says ${want[0]}x${want[1]}`,
      );
    }
  }
  for (const name of Object.keys(HOME_ART_SIZE)) {
    if (!(name in pieces)) errors.push(`homestead: "${name}" has no art`);
  }
  return errors;
}
