// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The between-level cutscene family (see the `pixel-assets` skill): the
// side-view cast and stage dressing of the campaign's travel scenes — the
// garage launch, the space transits, the moon send-off, and the two rift
// crossings (defs/cutscenes.ts). One string per pixel row, one character
// per pixel; `.` is transparent and every other char must exist in
// CORE_PALETTE (sprite-data/core.mjs) or this family's local palette.

import { swapPalette } from "../asset-tools/palette.mjs";

import mars from "./mars.mjs";

/** Chars only this family draws with — merged with the core at build time. */
const PALETTE = {
  d: [96, 98, 108], // moon-disc crater shadow
  t: [178, 100, 62], // mars-disc base (the mars family's ramp base)
  u: [124, 66, 40], // mars-disc dark patches
  e: [234, 196, 172], // mars-disc polar cap
  N: [48, 52, 68], // night black: garage opening, door glass
  s: [255, 236, 160], // eastworld daylight through the far door
  C: [235, 142, 62], // far-door sunset mid
  D: [156, 64, 50], // far-door dusk red
};

// The garage ship is the SAME hull the Mars level parks as its `starship`
// landmark — continuity is the point: he builds it, flies it, and leaves it
// in the red dust. `ship_0` is the parked hull verbatim; `ship_fire_*`
// replace the empty rows under the legs with the lit engine plume.
const HULL = mars.sprites.starship;

/** The parked hull with a flame variant: base rows + a 4-row plume. */
function firedHull(plume) {
  return [...HULL.slice(0, HULL.length - plume.length), ...plume];
}

/**
 * Rotate a grid a quarter-turn clockwise: the cruising ship is the SAME
 * fired hull laid on its side — nose right, legs reading as tail fins, the
 * plume trailing left — so the parked, launching, and flying ship can never
 * drift apart.
 */
function rotateCW(grid) {
  const h = grid.length;
  const w = grid[0].length;
  return Array.from({ length: w }, (_, r) =>
    Array.from({ length: h }, (_, c) => grid[h - 1 - c][r]).join(""),
  );
}

const SPRITES = {
  // ---- The cast --------------------------------------------------------------
  // Our hero, standing up for once: white tee, jeans, movie face — the
  // couch sprite's owner finally on his feet for the garage launch.
  hero_tee_0: [
    "................",
    ".....OOOOO......",
    "....OkkkkkO.....",
    "....OpOppOpO....",
    "....OppppppO....",
    "...OWWWWWWWWO...",
    "..OWWWWWWWWWWO..",
    "..OWWWWWWWWWWO..",
    "..OpOWWWWWWOpO..",
    "...OWWWWWWWWO...",
    "...OjjO..OjjO...",
    "...OjjO..OjjO...",
    "...OOOO..OOOO...",
    "................",
    "................",
    "................",
  ],
  hero_tee_1: [
    "................",
    ".....OOOOO......",
    "....OkkkkkO.....",
    "....OpOppOpO....",
    "....OppppppO....",
    "...OWWWWWWWWO...",
    "..OWWWWWWWWWWO..",
    "..OWWWWWWWWWWO..",
    "..OpOWWWWWWOpO..",
    "...OWWWWWWWWO...",
    "..OjjO....OjjO..",
    "..OjjO....OjjO..",
    "..OOOO....OOOO..",
    "................",
    "................",
    "................",
  ],
  // The same man in the EVA suit, side view — the moon/mars/rift crossings.
  // Head plan borrows the field hero's helmet (gold visor under white shell).
  hero_suit_0: [
    "................",
    ".....OOOOOO.....",
    "....OaaaaaaO....",
    "...OaOYyyyOaO...",
    "...OaOyyyyOaO...",
    "....OaaaaaaO....",
    "...OAaaaaaaAO...",
    "..OaOaarraaOaO..",
    "..OaOaaaaaaOaO..",
    "...OAaaaaaaAO...",
    "...OaaO..OaaO...",
    "...OAAO..OAAO...",
    "...OOOO..OOOO...",
    "................",
    "................",
    "................",
  ],
  hero_suit_1: [
    "................",
    ".....OOOOOO.....",
    "....OaaaaaaO....",
    "...OaOYyyyOaO...",
    "...OaOyyyyOaO...",
    "....OaaaaaaO....",
    "...OAaaaaaaAO...",
    "..OaOaarraaOaO..",
    "..OaOaaaaaaOaO..",
    "...OAaaaaaaAO...",
    "..OaaO....OaaO..",
    "..OAAO....OAAO..",
    "..OOOO....OOOO..",
    "................",
    "................",
    "................",
  ],
  // ---- The ship --------------------------------------------------------------
  // Parked: the Mars landmark hull, engines cold. `_1` mirrors `_0` so a
  // stray walk-frame lookup never blanks the hull.
  ship_0: HULL,
  ship_1: HULL,
  // Engines lit (posed just before liftoff, and the climbing frames): the
  // same hull over a flickering two-frame plume — white core, gold body,
  // lander-gold embers.
  ship_fire_0: firedHull([
    ".........WW....W........",
    ".........yWy..yWy.......",
    "..........yo...oy.......",
    "...........o...o........",
  ]),
  ship_fire_1: firedHull([
    ".........W.....WW.......",
    ".........yWy..yWy.......",
    ".........oy....yo.......",
    "..........o.....o.......",
  ]),
  // Cruising: the fired hull a quarter-turn over — nose right, plume
  // trailing left — the space-transit scenes' hero (he's inside; his
  // speech anchors to it). Rotation keeps all three ship poses one drawing.
  get ship_fly_0() {
    return rotateCW(this.ship_fire_0);
  },
  get ship_fly_1() {
    return rotateCW(this.ship_fire_1);
  },
  // ---- The sky ---------------------------------------------------------------
  // Earth, seen from the black: blue ball, cloud streaks, green smudges of
  // home — the thing that "got small fast".
  sky_earth: [
    "................",
    ".....OOOO.......",
    "...OOWWjjOO.....",
    "..OjWWjjjGjO....",
    ".OjWWjjGGjjjO...",
    ".OjjjjGGGjjjO...",
    ".OjjGjjjjjjjO...",
    ".OjjjjjjGGjjO...",
    "..OjjjjGjjjO....",
    "...OOjjjjOO.....",
    ".....OOOO.......",
    "................",
    "................",
    "................",
    "................",
    "................",
  ],
  // The moon as a destination: gray disc, cratered, lit top-left.
  sky_moon: [
    "................",
    ".....OOOO.......",
    "...OOFFffOO.....",
    "..OFFFfffffO....",
    ".OFFffffddffO...",
    ".OFfffffddffO...",
    ".OffffffffffO...",
    ".OffddffffffO...",
    "..OfddfffffO....",
    "...OOffffOO.....",
    ".....OOOO.......",
    "................",
    "................",
    "................",
    "................",
    "................",
  ],
  // Mars ahead: rust-red disc, dark mare patches, a pale polar cap.
  sky_mars: [
    "................",
    ".....OOOO.......",
    "...OOeetttOO....",
    "..OtettttuutO...",
    ".OtttttuutttO...",
    ".OttuutttttuO...",
    ".OtttttuttttO...",
    "..OtuttttutO....",
    "...OOttttOO.....",
    ".....OOOO.......",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
  ],
  // Star clusters the space and night stages sprinkle as props: plus-shaped
  // brights and paired dims (pairs, so nothing reads as pixel noise).
  stars_a: [
    "................",
    "...W............",
    "..WWW.......ww..",
    "...W............",
    "................",
    ".........W......",
    "........WWW.....",
    ".........W......",
    "..ww............",
    "................",
    "................",
    "................",
  ],
  stars_b: [
    "................",
    "..........W.....",
    ".........WWW....",
    "..ww......W.....",
    "................",
    "................",
    "....W.......ww..",
    "...WWW..........",
    "....W...........",
    "................",
    "................",
    "................",
  ],
  // ---- The stages' set pieces ------------------------------------------------
  // Home at night: the little house whose living room the prelude played
  // in, garage door up, one window still lit. He rolled the ship out onto
  // the lawn; the doorway he walks out of is the dark opening on the right.
  garage_house: [
    "................................................",
    "......OOOOOOOOOOOOOO............................",
    ".....OEEEEEEEEEEEEEEO...........................",
    "....OEEBBBBBBBBBBBBEEO..........................",
    "...OEEBBBBBBBBBBBBBBEEO.........................",
    "..OEEBBBBBBBBBBBBBBBBEEO........................",
    ".OEEBBBBBBBBBBBBBBBBBBEEOOOOOOOOOOOOOOOOOOOOOO..",
    "OOOOOOOOOOOOOOOOOOOOOOOOOEEEEEEEEEEEEEEEEEEEEOO.",
    "O.wwwwwwwwwwwwwwwwwwwww.OOOOOOOOOOOOOOOOOOOOOOO.",
    "O.wwwwwwwwwwwwwwwwwwwww.O.wwwwwwwwwwwwwwwwwww.O.",
    "O.wwOOOOOOwwwwwwwwwwwww.O.wwObbbbbbbbbbbbOwww.O.",
    "O.wwOyyyyOwwwwwwwwwwwww.O.wwObbbbbbbbbbbbOwww.O.",
    "O.wwOyyyyOwwwOOOOOOwwww.O.wwONNNNNNNNNNNNOwww.O.",
    "O.wwOyyyyOwwwOkkkkOwwww.O.wwONNNNNNNNNNNNOwww.O.",
    "O.wwOOOOOOwwwOkkkkOwwww.O.wwONNNNNNNNNNNNOwww.O.",
    "O.wwwwwwwwwwwOkkOkOwwww.O.wwONNNNNNNNNNNNOwww.O.",
    "O.wwwwwwwwwwwOkkkkOwwww.O.wwONNNNNNNNNNNNOwww.O.",
    "O.wwwwwwwwwwwOkkkkOwwww.O.wwONNNNNNNNNNNNOwww.O.",
    "OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO.",
  ],
  // The far door with Eastworld on the other side: the Mars rift's exact
  // silhouette, its violet edge kept, its glow swapped from between-universe
  // white to a desert sunset — daylight where no daylight belongs.
  rift_west: swapPalette(mars.sprites.rift, { W: "s", L: "C", P: "D" }),
};

export default {
  name: "scenes",
  /** Ground tile behind this family's contact sheet. */
  ground: "grass_0",
  palette: PALETTE,
  sprites: SPRITES,
  animations: {
    hero_tee_walk: { frames: ["hero_tee_0", "hero_tee_1"], delayMs: 220 },
    hero_suit_walk: { frames: ["hero_suit_0", "hero_suit_1"], delayMs: 220 },
    ship_fire_burn: { frames: ["ship_fire_0", "ship_fire_1"], delayMs: 120 },
    ship_fly_cruise: { frames: ["ship_fly_0", "ship_fly_1"], delayMs: 160 },
  },
  // The star sprinkles and sky discs live on space-black stages the scene
  // paints itself; their contrast against the family sheet's grass ground
  // is meaningless.
  contrastExempt: ["stars_a", "stars_b", "sky_moon"],
};
