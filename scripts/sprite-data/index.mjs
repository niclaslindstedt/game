// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source of truth for every in-game pixel sprite (see the `pixel-assets`
// skill). Base sprites are one self-describing
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

// The SHIPPED rosters, read from the compiled catalogs rather than from the
// engine's live registries: `scripts/mod-support.mjs` merges a mod's monsters
// and gear INTO those registries, and this pipeline derives frames for the
// sprites in this repo's own tree — a mod's are derived separately, after its
// grids are in (see `deriveWounds` / `deriveWorn` below).
import { GENERATED_ENEMIES } from "../../src/generated/enemies.ts";
import { GENERATED_GEAR } from "../../src/generated/items.ts";
import { woundedFrames } from "../asset-tools/damage.mjs";
import { woundVisibility } from "../asset-tools/lint.mjs";
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

/**
 * A colour for a wound char no family scope defines.
 *
 * Every style char but one comes from the shared core; `C` (the ecto core) is
 * a FAMILY-LOCAL char, which each shipped biome defines in its own
 * `_family.yaml`. A MOD's family has no manifest to define it in — its sprites
 * carry their own concrete palettes and nothing else — so a mod's ecto-gored
 * monster would derive a wound painted in a colour that does not exist. The
 * value is the moon/rift family's own pale ecto, which is what the haunting
 * already bleeds.
 */
const STYLE_FALLBACK = { C: [91, 133, 140, 225] };

/** Wound plans by sprite name — the lint checks splat-vs-body contrast. */
export const WOUND_PLANS = {};

/**
 * Derive the wound frames for a roster of enemies, over whatever sprites are
 * currently loaded.
 *
 * A FUNCTION rather than a top-level loop because a MOD ships monsters too: its
 * grids are merged into these same maps after this module loads
 * (`scripts/mod-support.mjs`), and its mobs earn the same auto-derived
 * battle damage the shipped ones do — one implementation, so a mod's hurt
 * frame is made exactly the way the game's is.
 */
export function deriveWounds(defs) {
  // Two defs may share one sprite (the SpaceZ vanguard reuses "scientist"), so
  // plans are derived per unique SPRITE: the def with the widest stage set wins,
  // and each sprite's wound frames register exactly once.
  const bySprite = new Map();
  for (const def of Object.values(defs)) {
    const current = bySprite.get(def.sprite);
    if (
      !current ||
      ROLE_STAGES[def.role].length > ROLE_STAGES[current.role].length
    ) {
      bySprite.set(def.sprite, def);
    }
  }
  for (const def of bySprite.values()) {
    if (WOUND_PLANS[def.sprite]) continue; // already derived (a shared sprite)
    const frames = [SPRITES[`${def.sprite}_0`], SPRITES[`${def.sprite}_1`]];
    if (!frames[0] || !frames[1]) {
      throw new Error(`enemy "${def.id}": no sprite "${def.sprite}_0/_1"`);
    }
    const family = FAMILIES.find(
      (f) => f.name === SPRITE_FAMILY[`${def.sprite}_0`],
    );
    const style =
      family.wounds?.[def.sprite] ?? GORE_STYLES[def.gore ?? "blood"];
    for (const char of Object.values(style)) {
      if (!(char in family.palette) && char in STYLE_FALLBACK) {
        family.palette[char] = STYLE_FALLBACK[char];
      }
    }
    const stages = ROLE_STAGES[def.role];
    WOUND_PLANS[def.sprite] = { style, stages, family: family.name };
    // The seeded deal can collapse its clusters onto too few pixels to read
    // (the wandering-tourist case: overlapping anchors left a 5-px "wound").
    // Re-deal with a bumped seed until the hurt stage passes the visibility
    // lint; reroll 0 keeps every already-passing sprite's layout untouched,
    // and a sprite no deal can save falls through to the generator's warning.
    let wounds = woundedFrames(def.sprite, frames, style, stages);
    for (let reroll = 1; reroll <= 8; reroll++) {
      const hurt = wounds[`${def.sprite}_hurt_0`];
      if (!hurt) break;
      if (woundVisibility(frames[0], hurt, family.palette) === null) break;
      wounds = woundedFrames(def.sprite, frames, style, stages, reroll);
    }
    for (const [name, grid] of Object.entries(wounds)) {
      register(family, name, grid);
    }
  }
}

deriveWounds(GENERATED_ENEMIES);

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

/** Derive the on-body overlays for a gear catalog. A function for the same
 * reason `deriveWounds` is: a MOD's armor is worn by the same hero. */
export function deriveWorn(defs) {
  for (const def of Object.values(defs)) {
    if (def.grade || !ARMOR_SLOTS.has(def.slot)) continue;
    if (SPRITE_FAMILY[`worn_${def.id}`] || SPRITE_FAMILY[`worn_${def.id}_0`]) {
      continue; // already derived
    }
    const icon = SPRITES[def.icon];
    if (!icon)
      throw new Error(`gear "${def.id}": no icon sprite "${def.icon}"`);
    const ramp = wornRamp(icon, SPRITE_PALETTES[def.icon], def.wornChar);
    for (const [suffix, grid] of Object.entries(
      wornFrames(def.slot, def.worn),
    )) {
      const name = `worn_${def.id}${suffix}`;
      register(worn, name, grid);
      SPRITE_PALETTES[name] = ramp; // per-piece colors, not a family scope
      worn.contrastExempt.push(name);
    }
  }
}

deriveWorn(GENERATED_GEAR);
