// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The effects family (see the `pixel-assets` skill): projectiles, pickups
// and gore — the level-agnostic sprites weapons and drops carry between
// biomes. One string per pixel row, one character per pixel; `.` is
// transparent and every other char must exist in CORE_PALETTE
// (sprite-data/core.mjs) or this family's local palette.

// Gore splashes (see drawEffects): frame 0 is the burst, frame 1 the
// scatter. ECTO is the ghost-tier recolor of the same droplets.
const BLOOD_0 = [
  "............",
  "............",
  "............",
  ".....rr.....",
  "....rrrr....",
  "...rrrrrr...",
  "....rrrr....",
  ".....rr.....",
  "............",
  "............",
  "............",
  "............",
];

const BLOOD_1 = [
  "............",
  "..rr....rr..",
  "............",
  ".rr..rr..rr.",
  "....rrrr....",
  "....rrrr....",
  ".rr..rr..rr.",
  "............",
  "...rr..rr...",
  "............",
  "............",
  "............",
];

/** Chars only this family draws with — merged with the core at build time. */
const PALETTE = {};

const SPRITES = {
  // Projectiles: the blaster bolt and the wand spark.
  bolt: [
    "........",
    "...OO...",
    "..OyyO..",
    ".OyYYyO.",
    ".OyYYyO.",
    "..OyyO..",
    "...OO...",
    "........",
  ],
  spark: [
    "........",
    "...OO...",
    "..OLLO..",
    ".OLPPLO.",
    ".OLPPLO.",
    "..OLLO..",
    "...OO...",
    "........",
  ],
  // The FIRE ORBS ability's orbiting fireball: red rim, white-hot core.
  fireball: [
    "........",
    "...OO...",
    "..OrrO..",
    ".OrYYrO.",
    ".OrYYrO.",
    "..OrrO..",
    "...OO...",
    "........",
  ],
  // The medkit consumable.
  medkit: [
    "............",
    ".OOOOOOOOOO.",
    ".OWWWWWWWWO.",
    ".OWWWrrWWWO.",
    ".OWWWrrWWWO.",
    ".OWrrrrrrWO.",
    ".OWrrrrrrWO.",
    ".OWWWrrWWWO.",
    ".OWWWrrWWWO.",
    ".OwwwwwwwwO.",
    ".OOOOOOOOOO.",
    "............",
  ],
  // The repair kit: a grey toolbox with a gold latch.
  repair: [
    "....OOOO....",
    "...OO..OO...",
    ".OOOOOOOOOO.",
    ".OaaaaaaaaO.",
    ".OaaayyaaaO.",
    ".OAAAyYAAAO.",
    ".OAAAAAAAAO.",
    ".OAAAAAAAAO.",
    ".OOOOOOOOOO.",
    "............",
    "............",
    "............",
  ],
  // The weapon-upgrade pickup: a golden up arrow.
  upgrade: [
    "............",
    ".....OO.....",
    "....OyyO....",
    "...OyYyyO...",
    "..OyYyyyyO..",
    ".OyYyyyyyyO.",
    ".OOOOyyOOOO.",
    "....OyyO....",
    "....OyyO....",
    "....OyyO....",
    "....OOOO....",
    "............",
  ],
  // ---- SpaceZ HQ projectiles (8×8) ------------------------------------------
  // The stapler's staple: a flying silver U.
  staple: [
    "........",
    "........",
    ".OOOOOO.",
    ".OaaaaO.",
    ".OaOOaO.",
    ".OO..OO.",
    "........",
    "........",
  ],
  // The taser's arc: a hot yellow spark.
  zap: [
    "........",
    "....OO..",
    "...OyyO.",
    "..OyyO..",
    "...OyyO.",
    "..OyO...",
    "..OO....",
    "........",
  ],
  // The laser pointer's dot: red rim, white-hot core.
  ray: [
    "........",
    "...OO...",
    "..OrrO..",
    ".OrWWrO.",
    ".OrWWrO.",
    "..OrrO..",
    "...OO...",
    "........",
  ],
  // The thrown beaker, mid-flight, sloshing green.
  vial: [
    "........",
    "...OO...",
    "..OxxO..",
    "..OxxO..",
    ".OxnnxO.",
    ".OnnnnO.",
    "..OOOO..",
    "........",
  ],
  // ---- Gore splashes (12x12 effect frames, drawn by drawEffects) -------------
  blood_0: BLOOD_0,
  blood_1: BLOOD_1,
};

// The ecto recolors (sprite-data/moon.mjs) swap these grids' palette.
export { BLOOD_0, BLOOD_1 };

export default {
  name: "effects",
  /** Ground tile behind this family's contact sheet. */
  ground: "moon_0",
  palette: PALETTE,
  sprites: SPRITES,
  animations: {},
  contrastExempt: [],
};
