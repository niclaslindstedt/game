// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The shared palette core (see the `pixel-assets` skill). Every sprite
// family (sprite-data/<family>.mjs) draws with CORE_PALETTE merged with its
// own local char map, so the single-character namespace is scoped: only
// chars genuinely shared across families live here — the outline, the gore
// chars the wound generator paints on any mob, and common materials. A new
// family adds its subject chars to ITS OWN palette, never to this file,
// unless a second family starts using them.
//
// Colors are organized as ramps (asset-tools/palette.mjs): each subject has
// a base color and derives its shade/highlight programmatically, so a whole
// character or biome can be re-themed by changing one base value — and
// palette variants (elite enemies, new level biomes) are a `swapPalette`
// call away instead of a redraw.

import { ramp, shade, tint } from "../asset-tools/palette.mjs";

// ---- Subjects -------------------------------------------------------------
// Exported so family palettes can derive local chars from the same ramps
// (colors are shared values; the CHAR namespace is what's scoped).

export const OUTLINE = [26, 28, 44]; // dark navy, not pure black; also eyes/mouths

/** The astronaut hero: white EVA suit, gold visor. */
export const ASTRO = {
  suit: ramp([214, 220, 228], { shadeBy: 0.34 }),
  visor: [255, 176, 46], // shares the bolt gold
};

/**
 * The moon's haunting, one translucency-baked ramp per tier (4th channel =
 * alpha). Ghosts are solid, wraiths violet with hot red eyes, and
 * ARMSTRONG — the boss — a pale green revenant. (The faint wisp ramp is
 * moon-local: see sprite-data/moon.mjs.)
 */
export const GHOST = {
  base: [140, 205, 215, 225],
  dark: [91, 133, 140, 225],
  light: [197, 230, 235, 225],
};
export const WRAITH = {
  base: [165, 125, 225, 230],
  dark: [100, 70, 150, 230],
  eyes: [255, 82, 82],
};
export const BOSS = { base: [185, 230, 205, 240], dark: [115, 160, 135, 240] };

export const SLIME = ramp([176, 92, 220], { shadeBy: 0.35, tintBy: 0.45 });

export const MEDKIT_COLORS = { white: [244, 244, 244], red: [216, 58, 58] };

/** The moon biome floor — retheme the whole moonscape from this base. */
export const MOON = ramp([136, 138, 150], { shadeBy: 0.24, tintBy: 0.22 });

/** Landmark accents: the flag's canton and the lander's gold foil. */
export const FLAG_BLUE = [64, 84, 188];
export const LANDER_GOLD = ramp([214, 168, 66], { shadeBy: 0.3 });

export const WOOD = [52, 44, 38]; // wand handles and other grips

/** The (future) earth biome ground. */
export const GRASS = ramp([74, 122, 62], { shadeBy: 0.18, tintBy: 0.16 });

/** SpaceZ HQ (level 1): the lab floor and its steel architecture. */
export const LAB = ramp([170, 176, 190], { shadeBy: 0.24, tintBy: 0.26 });
export const STEEL = ramp([96, 104, 126], { shadeBy: 0.34, tintBy: 0.3 });

/** The night shift: one skin tone; uniforms reuse existing ramps. */
export const SKIN = [222, 170, 134];
export const HAZMAT_SUIT = ramp([226, 198, 64], { shadeBy: 0.3 });
export const GUARD_NAVY = shade(FLAG_BLUE, 0.3);

/** MUSKRAT (and the prelude couch): matted brown fur. */
export const RAT = ramp([146, 100, 62], { shadeBy: 0.36, tintBy: 0.3 });

// ---- The shared core ---------------------------------------------------------

/**
 * Char → color for everything drawn by two or more families. Light source
 * is top-left. Merged under every family's local palette by
 * sprite-data/index.mjs; a family redefining one of these chars fails the
 * build (buildPalette throws on duplicates).
 */
export const CORE_PALETTE = {
  O: OUTLINE,
  // The hero's suit whites and visor gold double as icon materials.
  a: ASTRO.suit.base,
  A: ASTRO.suit.dark,
  y: ASTRO.visor,
  Y: tint(ASTRO.visor, 0.65),
  // Haunting tiers that leak into icons/effects (trophies, ecto splashes).
  c: GHOST.base,
  x: GHOST.light,
  m: WRAITH.base,
  M: WRAITH.dark,
  R: WRAITH.eyes,
  n: BOSS.base,
  // Slime purple doubles as void-wand/ability accents.
  P: SLIME.base,
  L: SLIME.light,
  W: MEDKIT_COLORS.white,
  w: shade(MEDKIT_COLORS.white, 0.19),
  f: MOON.base,
  F: MOON.light,
  j: FLAG_BLUE,
  o: LANDER_GOLD.base,
  q: LANDER_GOLD.dark,
  k: WOOD,
  G: GRASS.base,
  g: GRASS.dark,
  l: GRASS.light,
  T: LAB.light,
  v: STEEL.base,
  V: STEEL.light,
  b: STEEL.dark,
  p: SKIN,
  h: HAZMAT_SUIT.base,
  H: HAZMAT_SUIT.dark,
  J: GUARD_NAVY,
  B: RAT.base,
  E: RAT.dark, // also the grime scuff the wound generator paints
  S: RAT.light,
  // Gore: blood red, its dried dark core, painted on wounded mobs anywhere.
  r: MEDKIT_COLORS.red,
  i: shade(MEDKIT_COLORS.red, 0.45),
};
