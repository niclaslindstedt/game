// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source of truth for every in-game pixel sprite (see the `pixel-assets`
// skill). One string per pixel row, one character per pixel; `.` is
// transparent and every other character must exist in PALETTE. Edit these
// grids, then run generate-assets.mjs and LOOK at the previews.
//
// Colors are organized as ramps (asset-tools/palette.mjs): each subject has
// a base color and derives its shade/highlight programmatically, so a whole
// character or biome can be re-themed by changing one base value — and
// palette variants (elite enemies, new level biomes) are a `swapPalette`
// call away instead of a redraw.

import { buildPalette, ramp, shade, tint } from "./asset-tools/palette.mjs";

// ---- Subjects -------------------------------------------------------------

const OUTLINE = [26, 28, 44]; // dark navy, not pure black; also eyes/mouths

const HERO = {
  hair: [178, 86, 43],
  skin: [240, 192, 144],
  tunic: ramp([60, 120, 216], { shadeBy: 0.35 }),
  pants: [94, 74, 60],
  boots: [52, 44, 38],
};

const SLIME = ramp([176, 92, 220], { shadeBy: 0.35, tintBy: 0.45 });

const BOLT = { rim: [255, 176, 46] }; // core derived below

const MEDKIT_COLORS = { white: [244, 244, 244], red: [216, 58, 58] };

/** The level's ground biome — retheme the whole floor by changing the base. */
const GRASS = ramp([74, 122, 62], { shadeBy: 0.18, tintBy: 0.16 });
const DIRT = [104, 84, 56];

/** Shared palette: char → RGBA. Light source is top-left. */
export const PALETTE = buildPalette(
  { O: OUTLINE },
  {
    h: HERO.hair,
    s: HERO.skin,
    b: HERO.tunic.base,
    B: HERO.tunic.dark,
    p: HERO.pants,
    k: HERO.boots,
  },
  { P: SLIME.base, Q: SLIME.dark, L: SLIME.light },
  { y: BOLT.rim, Y: tint(BOLT.rim, 0.65) },
  {
    W: MEDKIT_COLORS.white,
    w: shade(MEDKIT_COLORS.white, 0.19),
    r: MEDKIT_COLORS.red,
  },
  { G: GRASS.base, g: GRASS.dark, l: GRASS.light, D: DIRT },
);

// ---- Animations -----------------------------------------------------------

/** Frame sequences the generator turns into film strips + animated previews. */
export const ANIMATIONS = {
  player_walk: { frames: ["player_0", "player_1"], delayMs: 160 },
  slime_bounce: { frames: ["slime_0", "slime_1"], delayMs: 280 },
};

// ---- Sprites --------------------------------------------------------------

/**
 * Sprite grids. Animation frames are separate entries named `<sprite>_<n>`.
 * Sizes: characters/enemies 16×16, projectile 8×8, medkit 12×12, tiles 16×16.
 */
export const SPRITES = {
  // The hero, 3/4 top-down view. Frame 0/1 alternate the leg stride.
  player_0: [
    "................",
    ".....OOOOOO.....",
    "....OhhhhhhO....",
    "...OhhhhhhhhO...",
    "...OhsssssshO...",
    "...OssOssOssO...",
    "....OssssssO....",
    "...OObbbbbbOO...",
    "..ObbbbbbbbbbO..",
    "..ObbbbBBbbbbO..",
    "..OsObbbbbbOsO..",
    "...OBBBBBBBBO...",
    "...OppO..OppO...",
    "...OkkO..OkkO...",
    "...OOOO..OOOO...",
    "................",
  ],
  player_1: [
    "................",
    ".....OOOOOO.....",
    "....OhhhhhhO....",
    "...OhhhhhhhhO...",
    "...OhsssssshO...",
    "...OssOssOssO...",
    "....OssssssO....",
    "...OObbbbbbOO...",
    "..ObbbbbbbbbbO..",
    "..ObbbbBBbbbbO..",
    "..OsObbbbbbOsO..",
    "...OBBBBBBBBO...",
    "..OppO....OppO..",
    "..OkkO....OkkO..",
    "..OOOO....OOOO..",
    "................",
  ],
  // The one enemy: a purple slime. Frame 0 tall, frame 1 squashed.
  slime_0: [
    "................",
    "................",
    "................",
    "................",
    ".....OOOOOO.....",
    "....OLLPPPPO....",
    "...OLPPPPPPPO...",
    "..OLPPPPPPPPPO..",
    "..OPPOPPPPOPPO..",
    "..OPPOPPPPOPPO..",
    "..OPPPPOOPPPPO..",
    "..OQPPPPPPPPQO..",
    "..OQQPPPPPPQQO..",
    "...OQQQQQQQQO...",
    "....OOOOOOOO....",
    "................",
  ],
  slime_1: [
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "....OOOOOOOO....",
    "..OOLLPPPPPPOO..",
    ".OLPPPPPPPPPPPO.",
    ".OPPOPPPPPPOPPO.",
    ".OPPPPOOOOPPPPO.",
    ".OQPPPPPPPPPPQO.",
    ".OQQQPPPPPPQQQO.",
    "..OQQQQQQQQQQO..",
    "...OOOOOOOOOO...",
    "................",
  ],
  // The one weapon's projectile: an energy bolt.
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
  // The one item: a medkit.
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
  // Ground tiles. Keep edges featureless so they tile without seams.
  grass_0: [
    "GGGGGGGGGGGGGGGG",
    "GGlGGGGGGGGGgGGG",
    "GGlGGGGgGGGGGGGG",
    "GGGGGGGGGGGGGGGG",
    "GgGGGGGGGGlGGGGG",
    "GGGGGGGGGGlGGGGG",
    "GGGGlGGGGGGGgGGG",
    "GGGGlGGGGgGGGGGG",
    "GGGGGGGGGGGGGGGG",
    "GlGGGGGGGGGGGDGG",
    "GlGGGGgGGGGGGGGG",
    "GGGGGGGGGGGGGGGG",
    "GGGGGGGGGGlGGGGG",
    "GGgGGGGGGGlGGGGG",
    "GGGGGGGDGGGGGGGG",
    "GGGGGGGGGGGGGGGG",
  ],
  grass_1: [
    "GGGGGGGGGGGGGGGG",
    "GGGGGGGGGGGlGGGG",
    "GGgGGGGGGGGlGGGG",
    "GGGGGGGGGGGGGGGG",
    "GGGGGGlGGGGGGgGG",
    "GGGGGGlGGGGGGGGG",
    "GGGGGGGGGGGGGGGG",
    "GDGGGGGGGgGGGGGG",
    "GGGGGGGGGGGGGGGG",
    "GGGGGgGGGGGGlGGG",
    "GGGGGGGGGGGGlGGG",
    "GWyWGGGGGGGGGGGG",
    "GGGGGGGGGGGGGGGG",
    "GGGGGGGGgGGGGGGG",
    "GGGGGGGGGGGGGgGG",
    "GGGGGGGGGGGGGGGG",
  ],
};
