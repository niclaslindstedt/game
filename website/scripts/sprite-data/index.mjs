// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source of truth for every in-game pixel sprite (see the `pixel-assets`
// skill), split into per-family modules so one roster stays editable without
// paging through the rest. Each family bundles its grids with a LOCAL
// palette scope; this index merges every family with the shared core
// (core.mjs) and resolves the per-sprite palettes the generator renders
// with. Two families may map the same char to different colors — that's the
// point: the single-character namespace is per-family, not global.
//
// Sprite grids: one string per pixel row, one character per pixel; `.` is
// transparent. Animation frames are separate entries named `<sprite>_<n>`.
// Sizes: characters/enemies 16×16 (elites 24×24, bosses 48×48), projectiles
// 8×8, icons 12×12, tiles 16×16, lander 32×32, flag 16×24.

import { ENEMY_DEFS } from "../../../src/game/defs/enemies.ts";
import { woundedFrames } from "../asset-tools/damage.mjs";
import { buildPalette } from "../asset-tools/palette.mjs";
import { CORE_PALETTE } from "./core.mjs";
import earth from "./earth.mjs";
import effects from "./effects.mjs";
import hero from "./hero.mjs";
import icons from "./icons.mjs";
import moon from "./moon.mjs";
import prelude from "./prelude.mjs";
import spacez from "./spacez.mjs";

/** Every sprite family, each with its core-merged palette attached. */
export const FAMILIES = [
  hero,
  prelude,
  earth,
  moon,
  effects,
  icons,
  spacez,
].map((family) => ({
  ...family,
  // Throws on a char defined both locally and in the core — a family may
  // shadow another FAMILY's char, never the shared core.
  palette: buildPalette(CORE_PALETTE, family.palette),
  // The local scope alone, normalized — the palette preview sheet renders
  // it as this family's section.
  localPalette: buildPalette(family.palette),
}));

/** All sprite grids, name → grid (wounded variants included). */
export const SPRITES = {};
/** The palette each sprite renders with, name → char map. */
export const SPRITE_PALETTES = {};
/** Which family a sprite belongs to, name → family name. */
export const SPRITE_FAMILY = {};
/** Frame sequences the generator turns into film strips + motion previews. */
export const ANIMATIONS = {};

function register(family, name, grid) {
  if (name in SPRITES) {
    throw new Error(
      `sprite "${name}" defined by both "${SPRITE_FAMILY[name]}" and "${family.name}"`,
    );
  }
  SPRITES[name] = grid;
  SPRITE_PALETTES[name] = family.palette;
  SPRITE_FAMILY[name] = family.name;
}

for (const family of FAMILIES) {
  for (const [name, grid] of Object.entries(family.sprites)) {
    register(family, name, grid);
  }
  Object.assign(ANIMATIONS, family.animations);
}

// ---- Battle-damage variants -------------------------------------------------
// Wounded looks generated from the base frames (asset-tools/damage.mjs) —
// never hand-drawn, so a retuned base sprite re-wounds itself on the next
// `make assets`. The renderer swaps them in as hp falls (config.WOUNDS /
// LAST_STAND). Everything derives from the enemy catalog: stages follow the
// role (every mob gets `hurt` at half hp, elites add `wrecked` below a
// quarter, bosses add `dying` for the last stand) and the style follows the
// `gore` field — warm-blooded staff bleed red with dried-blood cores and
// floor grime, the haunting smears in pale ecto instead. A mob whose body
// colors swallow the default (dark-on-dark never reads) overrides it in its
// family's `wounds` map.

const ROLE_STAGES = {
  minion: ["hurt"],
  elite: ["hurt", "wrecked"],
  boss: ["hurt", "wrecked", "dying"],
};

const GORE_STYLES = {
  blood: { splat: "r", core: "i", scuff: "E" },
  ecto: { splat: "c", core: "C" },
};

/** Wound plans by sprite name — the lint checks splat-vs-body contrast. */
export const WOUND_PLANS = {};

for (const def of Object.values(ENEMY_DEFS)) {
  const frames = [SPRITES[`${def.sprite}_0`], SPRITES[`${def.sprite}_1`]];
  if (!frames[0] || !frames[1]) {
    throw new Error(`enemy "${def.id}": no sprite "${def.sprite}_0/_1"`);
  }
  const family = FAMILIES.find(
    (f) => f.name === SPRITE_FAMILY[`${def.sprite}_0`],
  );
  const style = family.wounds?.[def.sprite] ?? GORE_STYLES[def.gore ?? "blood"];
  const stages = ROLE_STAGES[def.role];
  WOUND_PLANS[def.sprite] = { style, stages, family: family.name };
  for (const [name, grid] of Object.entries(
    woundedFrames(def.sprite, frames, style, stages),
  )) {
    register(family, name, grid);
  }
}
