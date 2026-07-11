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
const PALETTE = {
  // Electric blue + charged white-blue: the dart, the rail slug's sheath
  // (same values as the icons family's storm chars — chars are per-family).
  e: [90, 180, 255],
  s: [214, 240, 255],
  // The ZAI glow (same value as the rift/eastworld families' Q): the
  // controllers' and the SUPERCORE's hostile shots.
  Q: [96, 240, 208],
};

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
  // Shotgun/blunderbuss shot: a tight pair of lead-and-brass pellets — the
  // volley is several of these fanned across the spread.
  pellet: [
    "........",
    "..OO....",
    ".OoqO...",
    "..OO....",
    "....OO..",
    "...OoqO.",
    "....OO..",
    "........",
  ],
  // The SMART PISTOL's self-correcting dart: a cyan sliver.
  dart: [
    "........",
    "...OO...",
    "..OseO..",
    ".OseeeO.",
    "..OeeO..",
    "...OO...",
    "........",
    "........",
  ],
  // The RAILGUN slug: a white-hot shard in a blue sheath.
  rail: [
    "........",
    "...OO...",
    "..OsWO..",
    ".OsWWeO.",
    ".OeWWeO.",
    "..OeeO..",
    "...OO...",
    "........",
  ],
  // The RETRO RAYGUN's wobbling charge ring — hollow, pulp-cover green.
  ring: [
    "........",
    "..OOOO..",
    ".OllllO.",
    ".Ol..lO.",
    ".Ol..lO.",
    ".OllllO.",
    "..OOOO..",
    "........",
  ],
  // The LONGBOW's arrow: steel tip, yew shaft, white fletching.
  arrow: [
    "........",
    ".....OO.",
    "....OaO.",
    "...OBO..",
    "..OBO...",
    ".OBO....",
    ".WWO....",
    ".WW.....",
  ],
  // The SORCERER'S STAFF's violet orb: slime-purple rim, white heart.
  orb: [
    "........",
    "...OO...",
    "..OLPO..",
    ".OLWWPO.",
    ".OPWWPO.",
    "..OPPO..",
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
  // The energy-drink consumable: a green can, steel lid and pull-tab, with a
  // yellow lightning bolt down the label — resets the sprint pool on touch.
  drink: [
    "............",
    "....OOOO....",
    "...OVVVVO...",
    "..OVbbbbVO..",
    "..OGGyyGGO..",
    "..OGyyyGGO..",
    "..OGGyyyGO..",
    "..OGGyyyGO..",
    "..OGyyyGGO..",
    "..OGGGGGGO..",
    "..OOOOOOOO..",
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
  // The MERCY ANGEL (16×16, animated): flies a rescue drop down to a fallen
  // mob and releases it. White feathered wings, a soft grey robe, a gold halo,
  // and two skin hands reaching down to cradle the falling pickup (drawn
  // separately below it). Frame 0 wings raised, frame 1 wings lowered — a slow
  // flap as it descends.
  angel_0: [
    "..OWO..............OWO..",
    ".OWWWO............OWWWO.",
    ".OsWWO..oyyyyyyo..OWWsO.",
    "OWWWWO..oy....yo..OWWWWO",
    "OsWWWWO.oyyyyyyo.OWWWWsO",
    "OWWWWWO.OppOOppO.OWWWWWO",
    "OWWWWWO.OppOOppO.OWWWWWO",
    ".OWWWWO.OWaWWaWO.OWWWWO.",
    ".OWWWO..OWaWWaWO..OWWWO.",
    "..OWWO..OWaWWaWO..OWWO..",
    "...OO...OWaWWaWO...OO...",
    "........OWaWWaWO........",
    ".......OWWaWWaWWO.......",
    ".......OWWaWWaWWO.......",
    "......OWWaAWWAaWWO......",
    "......OWWaAWWAaWWO......",
    ".....OWWWaAWWAaWWWO.....",
    ".....OWWaaAWWAaaWWO.....",
    "....OWWWaaAWWAaaWWWO....",
    "....OWWaaaAWWAaaaWWO....",
    "...OOWWaaaAWWAaaaWWOO...",
    ".........OpOOpO.........",
    ".........OppppO.........",
    "..........O..O..........",
  ],
  angel_1: [
    "........................",
    "........................",
    "........oyyyyyyo........",
    "OWO.....oy....yo.....OWO",
    "OWWO....oyyyyyyo....OWWO",
    "OsWWO...OppOOppO...OWWsO",
    ".OWWWO..OppOOppO..OWWWO.",
    ".OsWWWO.OWaWWaWO.OWWWsO.",
    "..OWWWO.OWaWWaWO.OWWWO..",
    "..OsWWO.OWaWWaWO.OWWsO..",
    "...OWWO.OWaWWaWO.OWWO...",
    "...OsWO.OWaWWaWO.OWsO...",
    "....OWOOWWaWWaWWOOWO....",
    "....OO.OWWaWWaWWO.OO....",
    "......OWWaAWWAaWWO......",
    "......OWWaAWWAaWWO......",
    ".....OWWWaAWWAaWWWO.....",
    ".....OWWaaAWWAaaWWO.....",
    "....OWWWaaAWWAaaWWWO....",
    "....OWWaaaAWWAaaaWWO....",
    "...OOWWaaaAWWAaaaWWOO...",
    ".........OpOOpO.........",
    ".........OppppO.........",
    "..........O..O..........",
  ],
  // ---- Gore splashes (12x12 effect frames, drawn by drawEffects) -------------
  blood_0: BLOOD_0,
  blood_1: BLOOD_1,
  // ---- UI cursors (16×16) ----------------------------------------------------
  // Not drawn in the world — these are lifted out of the atlas into CSS cursors
  // (see GameScreen / TitleScreen), so they read as 16-bit gfx like everything
  // else. The in-play mouse reticle: four white outlined arms around a red
  // aiming dot (the aim dimension made visible).
  crosshair: [
    "......OOOO......",
    "......OWWO......",
    "......OWWO......",
    "......OWWO......",
    "......OWWO......",
    "......OOOO......",
    "OOOOOOOOOOOOOOOO",
    "OWWWWOOrrOOWWWWO",
    "OWWWWOOrrOOWWWWO",
    "OOOOOOOOOOOOOOOO",
    "......OOOO......",
    "......OWWO......",
    "......OWWO......",
    "......OWWO......",
    "......OWWO......",
    "......OOOO......",
  ],
  // ---- Eastworld shots ---------------------------------------------------------
  // The PLASMA PEACEMAKER / PRAIRIE IRON slug: a hot blue-white round.
  plasma_slug: [
    "........",
    "........",
    "..OOO...",
    ".OessO..",
    ".OseeO..",
    "..OOO...",
    "........",
    "........",
  ],
  // The MAGLEV REPEATER's rail sliver: a silver needle in flight.
  rail_slug: [
    "........",
    "........",
    ".OOOOOO.",
    "OWaaaaAO",
    ".OOOOOO.",
    "........",
    "........",
    "........",
  ],
  // The SNAKE-OIL SPRAYER's vial: a lobbed dose of patent medicine.
  oil_vial: [
    "........",
    "...OO...",
    "..OWWO..",
    ".OGllGO.",
    ".OGGGGO.",
    ".OgGGgO.",
    "..OOOO..",
    "........",
  ],
  // HIGH NOON's bolt: a captured sun, released.
  sun_bolt: [
    "........",
    "...OO...",
    "..OYYO..",
    ".OYyyYO.",
    ".OYyyYO.",
    "..OYYO..",
    "...OO...",
    "........",
  ],
  // The GROK controllers' shot: a ZAI-cyan dart.
  zai_bolt: [
    "........",
    "...O....",
    "..OQO...",
    ".OQsQO..",
    "..OQO...",
    "...O....",
    "........",
    "........",
  ],
  // THE SUPERCORE's shot: a fat, slow ZAI orb — dodge it or jump it.
  zai_orb: [
    "..OOO...",
    ".OQQQO..",
    "OQQsQQO.",
    "OQsssQO.",
    "OQQsQQO.",
    ".OQQQO..",
    "..OOO...",
    "........",
  ],
  // The menu pointer: a puffy Mickey-Mouse white glove pointing up, three back
  // seams on the mitt, a rolled cuff. Hotspot is the fingertip (top).
  glove: [
    "...OO...........",
    "..OWWO..........",
    "..OWWO..........",
    "..OWWO..........",
    "..OWWO.OO.OO....",
    "..OWWOOWWOWWWO..",
    "..OWWWWWWWWWWWO.",
    "OOOOWWWWWWWWWWWO",
    "OWWWWWWWWWWWWWWO",
    "OWWWOWWOWWOWWWWO",
    ".OWWWWWWWWWWWWWO",
    ".OWWWWWWWWWWWWO.",
    ".OWWWWWWWWWWWO..",
    ".OWOOOOOOOOOWO..",
    ".OWWWWWWWWWWWO..",
    "..OOOOOOOOOOO...",
  ],
};

// The ecto recolors (sprite-data/moon.mjs) swap these grids' palette.
export { BLOOD_0, BLOOD_1 };

export default {
  name: "effects",
  /** Ground tile behind this family's contact sheet. */
  ground: "moon_0",
  palette: PALETTE,
  sprites: SPRITES,
  animations: {
    // The mercy angel's descent flap (see render.ts drawItems delivery).
    angel_fly: { frames: ["angel_0", "angel_1"], delayMs: 200 },
  },
  contrastExempt: [],
};
