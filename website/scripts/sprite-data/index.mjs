// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source of truth for every in-game pixel sprite (see the `pixel-assets`
// skill and docs/sprite-yaml-plan.md). Base sprites are one self-describing
// YAML file each under `sprites/` — loaded here by load-yaml.mjs into the
// SPRITES / SPRITE_PALETTES / SPRITE_FAMILY / FAMILIES / ANIMATIONS maps the
// rest of the pipeline consumes. This module then derives the two families of
// build-time variants that were never hand-drawn — battle-damage (wounds) and
// worn-gear overlays — on top of those base sprites, exactly as before.
//
// Sprite grids: one string per pixel row, one character per pixel; `.` is
// transparent. Animation frames are separate entries named `<sprite>_<n>`.
// Palette chars are per-sprite (`sprites/<family>/<name>.yaml`); the shared
// core (`sprites/_core.yaml`) and family-local scope (`_family.yaml`) back the
// derived variants and the palette preview sheet.

import { ENEMY_DEFS } from "../../../src/game/defs/enemies/index.ts";
import { GEAR_DEFS } from "../../../src/game/defs/gear.ts";
import { woundedFrames } from "../asset-tools/damage.mjs";
import { buildPalette } from "../asset-tools/palette.mjs";
import { wornFrames, wornRamp } from "../asset-tools/worn.mjs";
import { loadSprites } from "./load-yaml.mjs";

const {
  CORE_PALETTE,
  FAMILIES,
  SPRITES,
  SPRITE_PALETTES,
  SPRITE_FAMILY,
  ANIMATIONS,
} = loadSprites();

/** The shared core palette (concrete `[r,g,b,a]`), for the palette sheet. */
export { CORE_PALETTE };
/** Every sprite family, each with its core-merged palette attached. */
export { FAMILIES };
/** All sprite grids, name → grid (wounded/worn variants included). */
export { SPRITES };
/** The palette each sprite renders with, name → char map. */
export { SPRITE_PALETTES };
/** Which family a sprite belongs to, name → family name. */
export { SPRITE_FAMILY };
/** Frame sequences the generator turns into film strips + motion previews. */
export { ANIMATIONS };

/** Register a derived sprite under a family, guarding against name clashes. */
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
  // Machines throw sparks, not blood: hot gold splats with a white-hot core.
  sparks: { splat: "y", core: "Y" },
};

/** Wound plans by sprite name — the lint checks splat-vs-body contrast. */
export const WOUND_PLANS = {};

// Two defs may share one sprite (the SpaceZ vanguard reuses "scientist"), so
// plans are derived per unique SPRITE: the def with the widest stage set wins,
// and each sprite's wound frames register exactly once.
const bySprite = new Map();
for (const def of Object.values(ENEMY_DEFS)) {
  const current = bySprite.get(def.sprite);
  if (
    !current ||
    ROLE_STAGES[def.role].length > ROLE_STAGES[current.role].length
  ) {
    bySprite.set(def.sprite, def);
  }
}
for (const def of bySprite.values()) {
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

// ---- Worn-gear overlays -----------------------------------------------------
// On-body looks generated from the gear catalog (asset-tools/worn.mjs) —
// never hand-drawn. Every hand-authored armor piece derives `worn_<id>`
// overlays: the slot's silhouette template (head pieces pick a style via
// `GearDef.worn`) recolored with a ramp off its inventory icon's dominant
// color, so re-theming the icon re-themes the worn look on the next
// `make assets`. Grade variants share their base's look (grades.ts keeps
// the icon) and derive nothing — the renderer resolves them via `gradeBase`.

const ARMOR_SLOTS = new Set(["head", "chest", "legs", "feet"]);

const worn = {
  name: "worn",
  ground: "moon_0",
  palette: buildPalette(CORE_PALETTE),
  localPalette: buildPalette({}),
  sprites: {},
  animations: {},
  // Overlays repaint clothing pixels of the hero body, not standalone
  // silhouettes — the ground-contrast lint doesn't apply to any of them.
  contrastExempt: [],
};
FAMILIES.push(worn);

for (const def of Object.values(GEAR_DEFS)) {
  if (def.grade || !ARMOR_SLOTS.has(def.slot)) continue;
  const icon = SPRITES[def.icon];
  if (!icon) throw new Error(`gear "${def.id}": no icon sprite "${def.icon}"`);
  const ramp = wornRamp(icon, SPRITE_PALETTES[def.icon], def.wornChar);
  for (const [suffix, grid] of Object.entries(wornFrames(def.slot, def.worn))) {
    const name = `worn_${def.id}${suffix}`;
    register(worn, name, grid);
    SPRITE_PALETTES[name] = ramp; // per-piece colors, not a family scope
    worn.contrastExempt.push(name);
  }
}
