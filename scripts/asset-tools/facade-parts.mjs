// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE PARTS BIN — every loose piece the town is dressed with: the doors, the
// windows and the four faces each of them wears, the porches, the signs, the
// stains on the wall, the fences and the junk left against them.
//
// THIS HALF IS DRAWN, AND THE SPLIT IS THE WHOLE DESIGN. Next door,
// `facade.mjs` RULES a building's shell, because a wall is a gauge and a bay
// rhythm and a parapet that runs level — regularity, which a loop gets right at
// 1x every time and a hand does not. Everything in this file is the opposite
// kind of thing: a wheelie bin, a smashed pane, a sofa somebody put in a front
// garden. Those are SHAPES, and a shape drawn from a formula reads as a
// formula. So each of these is authored pixel by pixel and the generator's only
// job is to hold them.
//
// THEY ARE HERE RATHER THAN IN `content/sprites/` FOR ONE REASON: they are not
// sprites the game names, they are the pieces a shell is assembled out of, and
// the sizes they must be are the engine's (`TOWN_ART_SIZE`) rather than an
// artist's. A part that is a pixel too wide does not look slightly wrong — it
// lands in a hole that was cut for something else. Authoring them against the
// table that defines the holes is what makes that impossible rather than
// unlikely, and `townArtSizeCheck` below refuses the build if one drifts.
//
// FOUR FACES, AND EACH IS A DIFFERENT SENTENCE. Every hole in a wall — window,
// shopfront, front door, roller shutter — is drawn `dark`, `lit`, `board` and
// `broke`:
//
//   dark   nobody is in, or nobody is up. The default, and most of the road.
//   lit    somebody's welfare landed. The story counts these: one every third
//          house at the hero's end, and it is the only warm thing out there.
//   board  somebody CAME AND DID IT — the shop shut, the family left, the
//          council sent a man round with a screw gun.
//   broke  nobody did. Which is the more frightening of the two, and what the
//          very worst stretch of this road is made of.

import { TOWN_ART_SIZE } from "../../engine/game/drive/town-parts.ts";

// ── THE SHARED PALETTE ───────────────────────────────────────────────────────
//
// ONE PALETTE FOR THE WHOLE BIN, which the shells deliberately do NOT share. A
// shell is painted per material and per colourway because a wall's colour is the
// building's identity; a part is FURNITURE, and furniture that changed colour
// with the wall behind it would be a different design of front door on every
// house — which is not variety, it is noise. A white uPVC door is a white uPVC
// door on a brick terrace and on a rendered semi, and the row reads as a street
// precisely because the doors agree.

const PARTS_HEX = {
  O: "#1a1c2c", // ink
  K: "#232838", // dark glass
  k: "#2f3648", // dark glass, second tone
  L: "#f2d98a", // a window still lit
  l: "#c9a94e", // …and its warm shadow
  W: "#e4e2d8", // white joinery
  w: "#b4b2a8", // …shaded
  T: "#8b8578", // grey metal
  t: "#5e5a52", // …shaded
  P: "#7a6a52", // bare board (what a window is boarded with)
  p: "#5c4f3d", // …shaded
  R: "#8a4038", // a painted door, red
  G: "#3f6b52", // a painted door, green
  B: "#3a5170", // a painted door, blue
  D: "#4a3a2a", // dark timber
  Y: "#c9b45a", // brass, a shop light, a warning stripe
  N: "#59d8c0", // a sprayed tag
  M: "#d8598a", // …a second colour, because one tag is a stain
  m: "#8f4066", // …and the same hue with the light off — a neon tube's far side
  E: "#3c6234", // planting — a night green; the daylight one reads as neon here
  e: "#2a4526", // …shaded
  S: "#6f7a82", // galvanised
  s: "#4c545a", // …shaded
  C: "#9a3a3a", // a plastic bin, a sofa
  c: "#6b2828", // …shaded
  U: "#b9b0a0", // paper, a poster, a sale board
  u: "#8a8478", // …in shadow, and where it has peeled
  V: "#3d4a52", // damp, soot
  v: "#2b343a", // …where it has run longest
};

/** …as concrete `[r,g,b,a]`, which is what everything downstream of here wants.
 * Hex is the authoring format and stops at this line. */
const PARTS_PALETTE = Object.fromEntries(
  Object.entries(PARTS_HEX).map(([char, hex]) => [
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
const size = (id) => TOWN_ART_SIZE[id] ?? [8, 8];

/** A deterministic 0..1 from a string and an index — for the scatter in a
 * smashed pane and the litter round a bin, both of which have to be the same
 * every build or the atlas churns on every unrelated PR. */
function roll(key, n) {
  let h = 2166136261 >>> 0;
  const s = `${key}#${n}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

// ── THE FOUR FACES ───────────────────────────────────────────────────────────

/** Fill the glazed area of a hole with whatever the state says is behind it. */
function glaze(g, x, y, w, h, state, key) {
  if (state === "lit") {
    rect(g, x, y, w, h, "L");
    // A lit room is not a lamp. The warm shadow along the head and one flank is
    // what stops a lit window reading as a hole cut in the night sky.
    hline(g, x, y, w, "l");
    vline(g, x + w - 1, y, h, "l");
    return;
  }
  if (state === "board") {
    // BOARDS, NOT A PANEL, and the GAPS are what makes the difference. Planks
    // laid edge to edge fill the hole with one flat brown, which at speed is a
    // brown window — and a brown window is just a window. A dark line between
    // every plank, and one plank not quite reaching the frame, is what says
    // somebody nailed this shut in a hurry.
    rect(g, x, y, w, h, "O");
    for (let j = 0; j < h; j += 3) {
      const off = roll(key, j) > 0.5 ? 1 : 0;
      hline(g, x + off, y + j, w - off, "P");
      if (j + 1 < h) hline(g, x + off, y + j + 1, w - off, "p");
    }
    // …and a nail at each end of the top plank, which is a two-pixel detail
    // that reads as intent rather than decay.
    put(g, x + 1, y, "t");
    put(g, x + w - 2, y, "t");
    return;
  }
  if (state === "broke") {
    // WHAT IS LEFT IN THE FRAME. Dark, with shards clinging to the top corners
    // and one long tooth hanging — a pane that is simply black reads as a
    // window at night, which is the one thing a smashed one must never do.
    rect(g, x, y, w, h, "O");
    for (let i = 0; i < w; i++) {
      const depth = Math.round(roll(key, i) * (h - 1));
      if (depth <= 0) continue;
      vline(g, x + i, y, Math.min(depth, h - 1), "k");
      put(g, x + i, y + Math.min(depth, h - 1) - 1, "W");
    }
    return;
  }
  rect(g, x, y, w, h, "K");
  // The one highlight every dark pane gets: a glancing reflection off the top
  // left, which is what tells the eye it is glass rather than a hole.
  hline(g, x, y, Math.max(1, w - 2), "k");
  put(g, x + 1, y + 1, "k");
}

/** A window of a given proportion, in one of the four states. */
function window(id, state) {
  const [w, h] = size(id);
  const g = make(w, h);
  rect(g, 0, 0, w, h, "W");
  outline(g, 0, 0, w, h);
  glaze(g, 2, 2, w - 4, h - 4, state, `${id}${state}`);
  // GLAZING BARS. A window with none is a hole; a window with one horizontal
  // and one vertical is a window, at four pixels across, forever.
  if (state !== "board" && state !== "broke") {
    if (w >= 9) vline(g, Math.floor(w / 2), 2, h - 4, "w");
    if (h >= 7) hline(g, 2, Math.floor(h / 2), w - 4, "w");
  }
  // Its sill, which is what stands it in a wall rather than floating it.
  hline(g, 0, h - 1, w, "O");
  return g;
}

/** A SHOPFRONT, which is a different animal from a window and has to look it:
 * full-height glass, a stall riser under it and a bulkhead over. */
function shopfront(state) {
  const [w, h] = size("win_shop");
  const g = make(w, h);
  rect(g, 0, 0, w, h, "T");
  outline(g, 0, 0, w, h);
  hline(g, 1, 1, w - 2, "t");
  glaze(g, 1, 2, w - 2, h - 5, state, `shop${state}`);
  if (state === "dark" || state === "lit") {
    vline(g, Math.floor(w / 2), 2, h - 5, "t");
  }
  // The stall riser — the tiled kick a shop window sits on.
  rect(g, 1, h - 3, w - 2, 2, "t");
  hline(g, 0, h - 1, w, "O");
  return g;
}

/** The doors, each drawn once and glazed per state. `panel` and `screen` differ
 * where a door differs at nine pixels across: in how much of it is glass. */
const DOORS = {
  door_panel(g, w, h, state) {
    rect(g, 0, 0, w, h, "R");
    outline(g, 0, 0, w, h);
    rect(g, 2, 2, w - 4, 3, "c");
    rect(g, 2, h - 6, w - 4, 3, "c");
    if (state === "lit") rect(g, 2, 2, w - 4, 3, "L");
    put(g, w - 3, Math.floor(h / 2), "Y");
  },
  door_screen(g, w, h, state) {
    rect(g, 0, 0, w, h, "G");
    outline(g, 0, 0, w, h);
    glaze(g, 2, 2, w - 4, h - 6, state, "screen");
    put(g, w - 3, h - 5, "Y");
  },
  door_grille(g, w, h, state) {
    rect(g, 0, 0, w, h, "t");
    outline(g, 0, 0, w, h);
    glaze(g, 2, 2, w - 4, h - 5, state, "grille");
    // THE GRILLE ITSELF, over the glass. A diagonal lattice at this size is
    // mush; a plain vertical bar every two pixels reads as a security screen at
    // any distance you can see the door at.
    for (let i = 2; i < w - 2; i += 2) vline(g, i, 2, h - 5, "T");
  },
  door_glass(g, w, h, state) {
    rect(g, 0, 0, w, h, "W");
    outline(g, 0, 0, w, h);
    glaze(g, 2, 1, w - 4, h - 3, state, "glassdoor");
    vline(g, Math.floor(w / 2), 1, h - 3, "w");
    put(g, Math.floor(w / 2) - 1, Math.floor(h / 2), "T");
    put(g, Math.floor(w / 2) + 1, Math.floor(h / 2), "T");
  },
  door_double(g, w, h, state) {
    rect(g, 0, 0, w, h, "B");
    outline(g, 0, 0, w, h);
    glaze(g, 1, 1, 3, h - 4, state, "dbl_a");
    glaze(g, w - 4, 1, 3, h - 4, state, "dbl_b");
    vline(g, Math.floor(w / 2), 1, h - 2, "O");
    put(g, Math.floor(w / 2) - 1, Math.floor(h / 2), "Y");
    put(g, Math.floor(w / 2) + 1, Math.floor(h / 2), "Y");
  },
  garage_up(g, w, h, state) {
    rect(g, 0, 0, w, h, "T");
    outline(g, 0, 0, w, h);
    for (let j = 2; j < h - 1; j += 3) hline(g, 1, j, w - 2, "t");
    if (state === "board") {
      hline(g, 1, 2, w - 2, "P");
      hline(g, 1, 3, w - 2, "p");
      hline(g, 1, h - 4, w - 2, "P");
      hline(g, 1, h - 3, w - 2, "p");
    }
    if (state === "broke") {
      // A DOOR SOMEBODY HAS BEEN THROUGH. A dent that folds the middle two
      // panels in and a black wedge where the bottom corner has lifted.
      rect(g, 3, Math.floor(h / 2) - 1, w - 7, 3, "t");
      rect(g, 1, h - 3, 4, 2, "O");
    }
  },
  garage_roll(g, w, h, state) {
    rect(g, 0, 0, w, h, "S");
    outline(g, 0, 0, w, h);
    for (let j = 1; j < h - 1; j += 2) hline(g, 1, j, w - 2, "s");
    if (state === "broke") {
      for (let i = 2; i < w - 2; i += 3) {
        const dent = Math.round(roll("roll", i) * 3);
        rect(g, i, h - 3 - dent, 2, 2, "O");
      }
    }
    if (state === "board") rect(g, 2, 2, w - 4, 3, "P");
  },
  garage_open(g, w, h, state) {
    // AN OPENING WITH NOTHING IN IT. The dark inside is the point — a yard, a
    // workshop, a passage — and the roller box over it says the door exists and
    // is simply up.
    rect(g, 0, 0, w, h, "O");
    rect(g, 0, 0, w, 2, "S");
    hline(g, 0, 2, w, "s");
    outline(g, 0, 0, w, h);
    if (state === "lit") rect(g, 2, 4, w - 4, h - 5, "l");
  },
};

function door(id, state) {
  const [w, h] = size(id);
  const g = make(w, h);
  (DOORS[id] ?? DOORS.door_panel)(g, w, h, state);
  if (state === "board" && !id.startsWith("garage")) {
    // Boards go OVER a front door rather than in it — nailed across the whole
    // leaf at an angle, which is the picture everybody has of a house nobody is
    // coming back to.
    for (let j = 2; j < h - 2; j += 4) {
      hline(g, 0, j, w, "P");
      hline(g, 0, j + 1, w, "p");
    }
  }
  return g;
}

// ── WHAT IS HUNG OVER THEM ───────────────────────────────────────────────────

const FIXTURES = {
  porch_awning(g, w, h) {
    // A striped canvas awning — the stripes are the whole read, and they are
    // worth two colours rather than one shade.
    for (let i = 0; i < w; i++) {
      const c = i % 4 < 2 ? "C" : "U";
      vline(g, i, 1, h - 2, c);
    }
    hline(g, 0, 0, w, "O");
    hline(g, 0, h - 1, w, "O");
  },
  porch_stoop(g, w, h) {
    rect(g, 0, 0, w, h, "T");
    outline(g, 0, 0, w, h);
    hline(g, 1, 1, w - 2, "W");
    hline(g, 2, h - 2, w - 4, "t");
  },
  porch_portico(g, w, h) {
    // A pitched hood on two posts. It is the only fixture on this road that
    // reads as somebody having spent money, which is why it stops well short of
    // GOODCO's end being the only place it appears.
    const apex = Math.floor(w / 2);
    for (let j = 0; j < 4; j++) {
      const spread = Math.round(((j + 1) / 4) * (w / 2));
      rect(g, apex - spread, j, spread * 2 + 1, 1, "W");
      put(g, apex - spread, j, "O");
      put(g, apex + spread, j, "O");
    }
    hline(g, 0, 4, w, "w");
    vline(g, 1, 5, h - 5, "W");
    vline(g, w - 2, 5, h - 5, "W");
    put(g, 1, h - 1, "O");
    put(g, w - 2, h - 1, "O");
  },
  porch_canopy(g, w, h) {
    // Glass on brackets — the frontage of anything built in the last twenty
    // years, and deliberately the plainest thing in this list.
    rect(g, 0, 1, w, h - 2, "k");
    hline(g, 0, 0, w, "T");
    hline(g, 0, h - 1, w, "O");
    put(g, 2, h - 1, "T");
    put(g, w - 3, h - 1, "T");
  },
  sign_board(g, w, h) {
    rect(g, 0, 0, w, h, "B");
    outline(g, 0, 0, w, h);
    // LETTERING THAT IS NOT LETTERS. At four pixels of cap height nothing legible
    // fits, and a word that ALMOST resolves is far worse than a rhythm that
    // never pretends to — so it is a run of blocks at a word's cadence.
    let x = 2;
    while (x < w - 2) {
      const run = 1 + Math.round(roll("board", x) * 2);
      rect(g, x, 2, Math.min(run, w - 2 - x), h - 4, "U");
      x += run + 2;
    }
  },
  sign_letters(g, w, h) {
    // Individual illuminated letters, stood off the fascia — the same cadence,
    // but glowing and with the wall showing between them.
    let x = 1;
    while (x < w - 1) {
      const run = 1 + Math.round(roll("letters", x) * 2);
      rect(g, x, 0, Math.min(run, w - 1 - x), h - 1, "L");
      rect(g, x, h - 1, Math.min(run, w - 1 - x), 1, "l");
      x += run + 2;
    }
  },
  sign_hanging(g, w, h) {
    // A swinging shingle on a bracket. The BRACKET is the read — a board that
    // simply floats beside a door is a poster.
    hline(g, 0, 0, w, "t");
    put(g, Math.floor(w / 2), 1, "t");
    rect(g, 1, 2, w - 2, h - 3, "D");
    outline(g, 1, 2, w - 2, h - 3);
    rect(g, 3, 4, w - 6, h - 7, "Y");
  },
  sign_neon(g, w, h) {
    // A TUBE, NOT A LIT BOARD, and the difference is that a tube is a LINE with
    // dark on both sides of it. So it is a box of night glass with one
    // unbroken loop of colour set into it and a word glowing inside the loop —
    // a lit rectangle would be a lit window, which is the one thing the
    // brightest sign on this road must not read as.
    put(g, Math.floor(w / 2), 0, "t"); // the bracket it hangs off
    rect(g, 0, 1, w, h - 1, "K");
    outline(g, 0, 1, w, h - 1);
    outline(g, 2, 2, w - 4, h - 3, "M");
    // THE FAR SIDE OF THE TUBE IS DIMMER, which is the whole difference between
    // a sign that glows and a pink rectangle. Flat, it was the most saturated
    // thing on the road by a distance and pulled the eye off the buildings.
    hline(g, 2, h - 2, w - 4, "m");
    vline(g, w - 3, 2, h - 3, "m");
    hline(g, 4, 3, w - 8, "N");
  },
  sign_hoard(g, w, h) {
    // A hoarding: a big flat board over a dead frontage with the paste-ups
    // peeling off it. Half a message and no message at all.
    rect(g, 0, 0, w, h, "U");
    outline(g, 0, 0, w, h);
    for (let j = 2; j < h - 1; j += 2) {
      const run = 2 + Math.round(roll("hoard", j) * (w - 6));
      hline(g, 2, j, run, "M");
    }
    rect(g, w - 5, h - 4, 3, 3, "u");
  },
};

// ── WHAT HAS HAPPENED TO THE WALL ────────────────────────────────────────────

const DECALS = {
  decal_tag_a(g, w, h) {
    // A TAG, and the thing that makes one read is that it is a CONTINUOUS
    // stroke — a scatter of coloured pixels is dirt. So it is drawn as a path
    // that doubles back on itself, in one colour, with a hard edge.
    let y = h - 2;
    for (let x = 0; x < w; x++) {
      put(g, x, y, "N");
      put(g, x, y - 1, "N");
      const step = roll("tag_a", x);
      if (step > 0.62 && y > 1) y -= 1;
      else if (step < 0.2 && y < h - 2) y += 1;
    }
    // The underline every tag has. Drawn as a RUN rather than as dots — a row
    // of isolated pixels is the definition of noise at 1x, and the orphan lint
    // is right to say so.
    hline(g, 1, Math.max(0, h - 5), w - 2, "N");
  },
  decal_tag_b(g, w, h) {
    for (let y = 0; y < h; y++) {
      const x = Math.round((Math.sin(y * 1.4) * 0.5 + 0.5) * (w - 2));
      put(g, x, y, "M");
      put(g, x + 1, y, "M");
    }
    hline(g, 0, Math.floor(h / 2), w, "M");
  },
  decal_poster(g, w, h) {
    rect(g, 0, 0, w, h, "U");
    outline(g, 0, 0, w, h, "w");
    for (let j = 2; j < h - 1; j += 2) hline(g, 1, j, w - 2, "t");
    // The bottom corner curled off the wall, which is the only thing that tells
    // a poster from a window at six pixels across.
    put(g, w - 1, h - 1, ".");
    put(g, w - 2, h - 1, "O");
  },
  decal_damp(g, w, h) {
    // A stain runs DOWN and spreads as it goes. Drawn as a widening plume with
    // a hard top edge (where the gutter is) and a soft bottom.
    for (let j = 0; j < h; j++) {
      const spread = Math.round((j / h) * (w - 1));
      const x0 = Math.max(0, Math.floor((w - spread) / 2));
      hline(g, x0, j, Math.max(1, spread), j < h - 3 ? "V" : "v");
    }
    hline(g, Math.floor(w / 2) - 1, 0, 3, "O");
  },
  decal_crack(g, w, h) {
    // A CRACK IS ONE UNBROKEN LINE, and the pixel it moves THROUGH has to be
    // drawn or it is not. A wander that steps diagonally leaves a dotted line
    // — which reads as dirt rather than as a fracture, and which the orphan
    // lint flags, correctly, on every row it steps on.
    let x = Math.floor(w / 2);
    for (let y = 0; y < h; y++) {
      put(g, x, y, "O");
      const step = roll("crack", y);
      const next =
        step > 0.7
          ? Math.min(w - 1, x + 1)
          : step < 0.3
            ? Math.max(0, x - 1)
            : x;
      if (next !== x) put(g, next, y, "O");
      x = next;
      if (y === Math.floor(h / 2) && x + 1 < w) put(g, x + 1, y, "O");
    }
  },
  decal_patch(g, w, h) {
    // Render that has come off the wall — a bare patch with a ragged edge and
    // the brick showing through.
    rect(g, 1, 1, w - 2, h - 2, "p");
    for (let j = 1; j < h - 1; j += 2) hline(g, 1, j, w - 2, "P");
    for (let i = 0; i < w; i++) {
      if (roll("patch", i) > 0.5) put(g, i, 0, "p");
      if (roll("patch", i + 40) > 0.5) put(g, i, h - 1, "p");
    }
  },
  decal_ivy(g, w, h) {
    // It CLIMBS, so it is dense at the bottom and picks its way up in a
    // narrowing column — ivy drawn as an even rectangle of green is a hedge
    // stuck to a wall.
    for (let j = 0; j < h; j++) {
      const density = 1 - j / h;
      for (let i = 0; i < w; i++) {
        if (roll("ivy", j * 31 + i) < density * 0.9) {
          put(g, i, h - 1 - j, roll("ivy", j * 17 + i) > 0.5 ? "E" : "e");
        }
      }
    }
  },
  decal_soot(g, w, h) {
    // WHAT A FIRE LEFT. A black plume above a window, widening upward — the one
    // decal that is only ever seen on the very worst stretch of the road.
    for (let j = 0; j < h; j++) {
      const spread = Math.round(((h - j) / h) * (w - 1)) + 1;
      const x0 = Math.max(0, Math.floor((w - spread) / 2));
      hline(g, x0, j, Math.max(1, spread), j > h - 4 ? "O" : "V");
    }
  },
};

// ── THE FRONTAGE, AND WHAT IS LEFT AGAINST IT ────────────────────────────────

const FRONTS = {
  front_picket(g, w, h) {
    for (let i = 1; i < w; i += 3) {
      vline(g, i, 1, h - 1, "W");
      put(g, i, 0, "W");
      vline(g, i + 1, 2, h - 2, "w");
    }
    hline(g, 0, 2, w, "W");
    hline(g, 0, 3, w, "w");
    hline(g, 0, h - 1, w, "O");
  },
  front_wall(g, w, h) {
    rect(g, 0, 1, w, h - 1, "T");
    for (let j = 2; j < h; j += 2) hline(g, 0, j, w, "t");
    for (let j = 1; j < h; j++) {
      const stagger = j % 4 < 2 ? 0 : 3;
      for (let i = stagger; i < w; i += 6) put(g, i, j, "t");
    }
    hline(g, 0, 0, w, "W");
    hline(g, 0, h - 1, w, "O");
  },
  front_hedge(g, w, h) {
    // A HEDGE IS A LUMPY THING, and a rectangle of one green is a snooker
    // table stood on its edge. So the top is a real profile (three px of
    // wander, not one), the body is broken up in patches rather than per
    // pixel — per-pixel noise strobes at speed — and the bottom third is all
    // shadow, because light comes from above and a hedge is deep.
    for (let i = 0; i < w; i++) {
      const top = 1 + Math.round(roll("hedge", i) * 2.6);
      vline(g, i, top, h - top, "e");
      const clump = roll("hedge", Math.floor(i / 3) + 90);
      if (clump > 0.42)
        vline(g, i, top, Math.max(1, Math.round((h - top) * 0.55)), "E");
      put(g, i, top, clump > 0.7 ? "E" : "e");
    }
    hline(g, 0, h - 1, w, "O");
  },
  front_rail(g, w, h) {
    for (let i = 0; i < w; i += 2) vline(g, i, 1, h - 2, "t");
    hline(g, 0, 1, w, "T");
    hline(g, 0, h - 3, w, "T");
    hline(g, 0, h - 1, w, "O");
  },
  front_chain(g, w, h) {
    // CHAIN LINK, which at this size is TWO POSTS AND A RAIL — and a mesh that
    // has to stay almost invisible. A proper alternating weave is a
    // checkerboard at 1x, and a checkerboard on a scrolling backdrop strobes
    // hard enough to be the only thing in the frame; every third pixel on every
    // other row reads as wire and stays put.
    for (let j = 2; j < h - 1; j += 2) {
      for (let i = (j / 2) % 3; i < w; i += 3) put(g, i, j, "s");
    }
    hline(g, 0, 0, w, "S");
    hline(g, 0, 1, w, "s");
    vline(g, 1, 0, h - 1, "S");
    vline(g, w - 2, 0, h - 1, "S");
    hline(g, 0, h - 1, w, "O");
  },
  front_planter(g, w, h) {
    rect(g, 1, 2, w - 2, h - 3, "T");
    hline(g, 1, 2, w - 2, "t");
    for (let i = 2; i < w - 2; i += 3) {
      vline(g, i, 0, 2, "E");
      put(g, i + 1, 1, "e");
    }
    hline(g, 0, h - 1, w, "O");
  },
  front_lot(g, w, h) {
    // A CAR PARK, which at six rows is an apron and some paint. IT IS THE PAINT
    // THAT SAYS CAR PARK: a dark band with a bright kerb along its far edge is
    // a kerb, and the first version of this read as exactly that at speed. So
    // the tarmac is lifted well clear of the night behind it and the bays are
    // the loudest thing on the strip.
    hline(g, 0, 0, w, "S");
    rect(g, 0, 1, w, h - 2, "s");
    // THE BAYS ARE MARKS ON THE GROUND, NOT PALINGS. Run full height they meet
    // the kerb top and bottom and the whole strip reads as a fence at speed —
    // which is what the first version of this was. Held to the near half they
    // read as paint, and paint on tarmac is the only thing that says CAR PARK.
    // Worn white rather than white: a line on a road this far from the money has
    // been driven over for twenty years, and a bright one is an airport apron.
    for (let i = 2; i < w; i += 5) vline(g, i, h - 3, 2, "u");
    hline(g, 0, h - 1, w, "O");
  },
  front_broken(g, w, h) {
    // WHAT IS LEFT OF ANY OF THE ABOVE. Palings missing, the rest leaning, the
    // rail down — and the gaps are the whole picture, so this is the one piece
    // here drawn by what it does NOT have.
    for (let i = 1; i < w; i += 3) {
      if (roll("broken", i) < 0.4) continue;
      const lean = roll("broken", i + 60) > 0.6 ? 1 : 0;
      const top = 1 + Math.round(roll("broken", i + 30) * 3);
      for (let j = top; j < h - 1; j++) {
        put(g, i + (j > h - 3 ? 0 : lean), j, "P");
      }
    }
    for (let i = 0; i < w; i++) {
      if (roll("broken", i + 120) > 0.35) put(g, i, h - 3, "p");
    }
    hline(g, 0, h - 1, w, "O");
  },
};

const JUNK = {
  junk_bin(g, w, h) {
    rect(g, 0, 1, w, h - 1, "C");
    hline(g, 0, 0, w, "c");
    hline(g, 0, 1, w, "O");
    vline(g, 0, 1, h - 1, "c");
    hline(g, 0, h - 1, w, "O");
  },
  junk_bins(g, w, h) {
    JUNK.junk_bin(g, 5, h);
    const b = make(5, h - 1);
    JUNK.junk_bin(b, 5, h - 1);
    for (let j = 0; j < h - 1; j++)
      for (let i = 0; i < 5; i++) {
        if (b[j][i] !== ".")
          put(g, 4 + i, j + 1, b[j][i] === "C" ? "E" : b[j][i]);
      }
  },
  junk_sacks(g, w, h) {
    for (let i = 0; i < w; i += 3) {
      const top = 1 + Math.round(roll("sacks", i) * 1.5);
      rect(g, i, top, 3, h - top, "O");
      rect(g, i, top + 1, 2, h - top - 2, "t");
    }
    hline(g, 0, h - 1, w, "O");
  },
  junk_pallets(g, w, h) {
    for (let j = 0; j < h; j += 2) {
      hline(g, 0, j, w, "P");
      hline(g, 0, j + 1, w, "p");
    }
    vline(g, 0, 0, h, "O");
    vline(g, w - 1, 0, h, "O");
    hline(g, 0, h - 1, w, "O");
  },
  junk_trolley(g, w, h) {
    // A SHOPPING TROLLEY, which is a mesh basket and two little wheels, and the
    // single most eloquent object that can be left in a front garden.
    for (let j = 1; j < h - 3; j++)
      for (let i = j % 2; i < w - 1; i += 2) put(g, i, j, "S");
    hline(g, 0, 0, w - 1, "S");
    vline(g, 0, 0, h - 3, "S");
    vline(g, w - 2, 0, h - 3, "S");
    put(g, w - 1, 0, "s");
    put(g, 1, h - 2, "O");
    put(g, w - 3, h - 2, "O");
  },
  junk_sofa(g, w, h) {
    rect(g, 0, 2, w, h - 3, "C");
    rect(g, 0, 1, 3, h - 2, "c");
    rect(g, w - 3, 1, 3, h - 2, "c");
    hline(g, 3, 2, w - 6, "c");
    outline(g, 0, 1, w, h - 1);
    // The cushion missing, and the frame showing through where it was.
    rect(g, Math.floor(w / 2) - 1, 3, 3, 2, "D");
  },
  junk_skip(g, w, h) {
    rect(g, 0, 2, w, h - 2, "Y");
    for (let i = 0; i < w; i += 4) vline(g, i, 2, h - 2, "l");
    outline(g, 0, 2, w, h - 2);
    // Filled past the rim, which is what a skip on a road like this always is.
    for (let i = 1; i < w - 1; i++) {
      const top = Math.round(roll("skip", i) * 2);
      vline(g, i, 2 - top, top, roll("skip", i + 50) > 0.5 ? "P" : "D");
    }
  },
  junk_crates(g, w, h) {
    // STACKED PRODUCE CRATES — what a grocer puts on the pavement at six in the
    // morning and takes in at nine at night. Drawn as three boxes rather than
    // one pile, because a pile of small things reads as a blob until the seams
    // between them are drawn.
    // A crate is BOARD with a dark seam under it, never a box drawn in ink: at
    // three rows an outlined crate is 80% outline, and against a night verge
    // that is a crate you cannot see.
    const crate = (x, y, cw, ch) => {
      rect(g, x, y, cw, ch, "P");
      hline(g, x, y, cw, "p");
      vline(g, x, y, ch, "p");
      hline(g, x, y + ch - 1, cw, "O");
    };
    crate(0, h - 3, 5, 3);
    crate(5, h - 3, w - 5, 3);
    crate(1, h - 6, 5, 3);
    // …and what is in the top one, which is the only colour on the whole piece
    // and the reason it says GROCER rather than BUILDER.
    hline(g, 2, h - 5, 3, "E");
  },
  junk_vend(g, w, h) {
    // AN ICE MACHINE — the lit box humming beside a motel door at two in the
    // morning. The header panel is the read: everything else about it is a grey
    // cabinet, and the one warm strip is what makes it a machine that is still
    // switched on.
    rect(g, 0, 0, w, h, "t");
    outline(g, 0, 0, w, h);
    hline(g, 1, 1, w - 2, "L");
    rect(g, 1, 3, w - 2, h - 5, "K");
    for (let j = 4; j < h - 3; j += 2) hline(g, 2, j, w - 4, "s");
    // ONE warm reflection down the glass, and no more: a cabinet lit all the
    // way through is a shopfront, and this is a machine standing beside a door.
    put(g, 2, h - 4, "l");
    hline(g, 1, h - 2, w - 2, "T");
    hline(g, 0, h - 1, w, "O");
  },
  junk_sale(g, w, h) {
    // A board on a post. FOR SALE, TO LET, or the estate agent that put it up
    // has gone too — the message is three lines of block text that never
    // resolves, which is the honest way to draw type at this size.
    rect(g, 0, 0, w, h - 5, "U");
    outline(g, 0, 0, w, h - 5, "O");
    hline(g, 2, 2, w - 4, "C");
    hline(g, 2, 4, w - 5, "t");
    vline(g, Math.floor(w / 2), h - 5, 5, "P");
    put(g, Math.floor(w / 2), h - 1, "O");
  },
};

// ── THE BIN ──────────────────────────────────────────────────────────────────

/** The window proportions the town draws with, less the shopfront, which is its
 * own shape. */
const WINDOW_TYPES = ["win_small", "win_tall", "win_wide", "win_strip"];
const DOOR_IDS = Object.keys(DOORS);
const STATES = ["dark", "lit", "board", "broke"];

/**
 * EVERY PART, as `name → grid`. One call, one flat map, registered whole by the
 * sprite pipeline — the same shape `wreckedFrames` and `woundedFrames` return,
 * so nothing downstream has to know this file is different from those.
 */
export function facadeParts() {
  const out = {};
  for (const id of WINDOW_TYPES)
    for (const state of STATES)
      out[`town_${id}_${state}`] = rows(window(id, state));
  for (const state of STATES)
    out[`town_win_shop_${state}`] = rows(shopfront(state));
  for (const id of DOOR_IDS)
    for (const state of STATES)
      out[`town_${id}_${state}`] = rows(door(id, state));
  for (const [id, draw] of Object.entries({
    ...FIXTURES,
    ...DECALS,
    ...FRONTS,
    ...JUNK,
  })) {
    const [w, h] = size(id);
    const g = make(w, h);
    draw(g, w, h);
    out[`town_${id}`] = rows(g);
  }
  return out;
}

/** The palette every part renders in. */
export const FACADE_PARTS_PALETTE = PARTS_PALETTE;

/**
 * THE PARTS WHOSE ISOLATED PIXELS ARE THE DRAWING — chain-link mesh, a shopping
 * trolley's basket, scattered ivy leaves, the ragged edge of a fallen-off patch
 * of render, and the palings a broken fence has lost.
 *
 * The orphan-pixel lint is right about everything else and worth keeping loud,
 * so the exemption is a NAMED LIST rather than a blanket pass on the family: a
 * lone pixel in a door or a window really is a slip, and a future part that
 * grows one should still fail.
 */
export const FACADE_SPECKLE_EXEMPT = [
  "town_front_chain",
  "town_front_broken",
  "town_junk_trolley",
  "town_decal_ivy",
  "town_decal_patch",
];

/**
 * REFUSE A PART THAT IS NOT THE SIZE ITS HOLE IS.
 *
 * The failure this catches is the quiet one: a part a pixel too wide does not
 * look slightly wrong, it lands over the reveal of a hole cut for something
 * else, on one archetype, at one bay width — which is a screenshot nobody takes.
 * The engine's table is the authority (`TOWN_ART_SIZE`), so this asserts the
 * drawn grid against it rather than the other way round.
 */
export function facadePartsCheck(parts) {
  const errors = [];
  for (const [name, grid] of Object.entries(parts)) {
    // THE WHOLE NAME FIRST, then the name less its state — because `sign_board`
    // is a piece of art and `win_small_board` is a state of one, and a blind
    // suffix strip turns the former into a part called "sign".
    const rest = name.replace(/^town_/, "");
    const stem =
      rest in TOWN_ART_SIZE
        ? rest
        : rest.replace(/_(dark|lit|board|broke)$/, "");
    const expected = TOWN_ART_SIZE[stem];
    if (!expected) {
      errors.push(
        `town part "${name}": nothing in TOWN_ART_SIZE names "${stem}"`,
      );
      continue;
    }
    const [w, h] = expected;
    if (grid.length !== h || grid.some((row) => row.length !== w)) {
      errors.push(
        `town part "${name}": drawn ${grid[0]?.length ?? 0}x${grid.length}, table says ${w}x${h}`,
      );
    }
  }
  return errors;
}
