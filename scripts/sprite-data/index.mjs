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
import { FLEET } from "../../src/game/drive/fleet.ts";
import { TOWN } from "../../src/game/drive/town.ts";
import { FACADE_COLOURWAYS, facadeShell } from "../asset-tools/facade.mjs";
import {
  FACADE_PARTS_PALETTE,
  FACADE_SPECKLE_EXEMPT,
  facadeParts,
  facadePartsCheck,
} from "../asset-tools/facade-parts.mjs";
import {
  CAST_RIM_CHAR,
  CAST_RIM_RGBA,
  castFrames,
  castsAnything,
} from "../asset-tools/cast.mjs";
import { woundedFrames } from "../asset-tools/damage.mjs";
import { wreckedFrames } from "../asset-tools/wreck.mjs";
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
  SPRITE_PLANES,
  SPRITE_RISE,
  SPRITE_DIRECTIONAL,
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
/** Sprites drawn on a plane other than the default `upright`, name → plane. */
export { SPRITE_PLANES };
/** How far a `plane: wall` piece rises off its footprint, name → world px. */
export { SPRITE_RISE };
/** `plane: floor` art that RUNS one way and is turned to its placement's
 * bearing, name → true (see `DIRECTIONAL_AUTHORED_BEARING`). */
export { SPRITE_DIRECTIONAL };
/** Frame sequences the generator turns into film strips + motion previews. */
export { ANIMATIONS };

/**
 * Register a derived sprite under a family, guarding against name clashes.
 * `palette` defaults to the family scope; a variant derived from ONE base
 * sprite passes that sprite's own palette merged over it, so a char the base
 * defines locally still paints the color the base painted it with.
 */
function register(family, name, grid, palette = family.palette) {
  if (name in SPRITES) {
    throw new Error(
      `sprite "${name}" defined by both "${SPRITE_FAMILY[name]}" and "${family.name}"`,
    );
  }
  SPRITES[name] = grid;
  SPRITE_PALETTES[name] = palette;
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
  // The rift's own things are made of light: a pale violet wound with a
  // white-hot point where it is leaking out. Both chars are core-palette, so a
  // MOD's family needs no fallback for them.
  cosmic: { splat: "L", core: "W" },
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
  // Two defs may share one sprite (the GOODCO vanguard reuses "scientist"), so
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
    const stages = ROLE_STAGES[def.role];
    WOUND_PLANS[def.sprite] = { style, stages, family: family.name };
    // The wounded frames are the base frames with splats dealt onto them, so
    // they must render in the base sprite's OWN palette (the family scope backs
    // the gore chars). Reading the family scope alone renders a locally-defined
    // body char in the family's color — or, when the family never defined it at
    // all, in nothing.
    const palette = {
      ...family.palette,
      ...SPRITE_PALETTES[`${def.sprite}_0`],
    };
    // …and a MOD's family has no scope at all to back those gore chars with.
    for (const char of Object.values(style)) {
      if (!(char in palette) && char in STYLE_FALLBACK) {
        palette[char] = STYLE_FALLBACK[char];
      }
    }
    // The seeded deal can collapse its clusters onto too few pixels to read
    // (the wandering-tourist case: overlapping anchors left a 5-px "wound").
    // Re-deal with a bumped seed until the hurt stage passes the visibility
    // lint; reroll 0 keeps every already-passing sprite's layout untouched,
    // and a sprite no deal can save falls through to the generator's warning.
    let wounds = woundedFrames(def.sprite, frames, style, stages);
    for (let reroll = 1; reroll <= 8; reroll++) {
      const hurt = wounds[`${def.sprite}_hurt_0`];
      if (!hurt) break;
      if (woundVisibility(frames[0], hurt, palette) === null) break;
      wounds = woundedFrames(def.sprite, frames, style, stages, reroll);
    }
    for (const [name, grid] of Object.entries(wounds)) {
      register(family, name, grid, palette);
    }
  }
}

deriveWounds(GENERATED_ENEMIES);

// ---- Cast poses -------------------------------------------------------------
// The wind-up frames a mob wears while a telegraphed move is coming
// (asset-tools/cast.mjs) — derived, never hand-drawn, for the same reason the
// wounds are: 27 elites is 54 frames, and a MOD's elite would otherwise have no
// tell at all. AUTHORED FRAMES ALWAYS WIN; see below.

/**
 * Derive the cast frames for a roster of enemies, over whatever sprites are
 * currently loaded. A FUNCTION for the same reason `deriveWounds` is one — a
 * mod's monsters are merged into these maps afterwards and earn the identical
 * treatment (`scripts/mod-support.mjs`).
 */
export function deriveCastPoses(defs) {
  // Two defs may share one sprite, and only one of them may be the caster —
  // deriving per unique SPRITE is what keeps the second one from throwing on a
  // name that is already registered.
  const seen = new Set();
  for (const def of Object.values(defs)) {
    if (!castsAnything(def) || seen.has(def.sprite)) continue;
    seen.add(def.sprite);
    // AUTHORED WINS. A boss that ships its own hand-drawn wind-up keeps it —
    // this derivation is the floor for everything nobody has drawn, never a
    // replacement for what somebody did.
    if (`${def.sprite}_cast_0` in SPRITES) continue;
    const frames = [SPRITES[`${def.sprite}_0`], SPRITES[`${def.sprite}_1`]];
    if (!frames[0] || !frames[1]) continue;
    const family = FAMILIES.find(
      (f) => f.name === SPRITE_FAMILY[`${def.sprite}_0`],
    );
    if (!family) continue;
    // The pose is the base frames with a rim laid around them, so it renders in
    // the base sprite's OWN palette — plus the rim char, which no family backs
    // (the same escape hatch the gore styles take above, and needed here for
    // the same reason: a MOD's family has no scope at all).
    const palette = {
      ...family.palette,
      ...SPRITE_PALETTES[`${def.sprite}_0`],
      [CAST_RIM_CHAR]: CAST_RIM_RGBA,
    };
    for (const [name, grid] of Object.entries(castFrames(def.sprite, frames))) {
      register(family, name, grid, palette);
    }
  }
}

deriveCastPoses(GENERATED_ENEMIES);

// ---- The fleet's damage ladder ----------------------------------------------
// The dented, de-glazed and written-off looks of every vehicle on the drive to
// GOODCO (asset-tools/wreck.mjs) — derived, never hand-drawn, for exactly the
// reason the wounds are. Twenty vehicles is sixty wreck grids, and the
// sixty-first is whatever gets added next; deriving them means a new model
// ships ONE picture and earns its ladder, and means a retuned base sprite can
// never be left with three stale wrecks standing behind it.
//
// The roster is the ENGINE's own (`src/game/drive/fleet.ts`), read the same way
// the enemy roster is read from the compiled catalog — so the art the atlas
// holds and the vehicles the road can actually spawn are the same list by
// construction rather than by anybody remembering.

/** Derive the wreck rungs for every vehicle in a fleet, over the sprites
 * currently loaded. A function for the same reason `deriveWounds` is one: a mod
 * that ships its own traffic earns the identical ladder. */
export function deriveWrecks(fleet) {
  for (const def of fleet) {
    const grid = SPRITES[def.id];
    if (!grid) throw new Error(`fleet vehicle "${def.id}": no sprite`);
    const family = FAMILIES.find((f) => f.name === SPRITE_FAMILY[def.id]);
    if (!family) continue;
    // A derived look may only paint in chars the BASE sprite's palette defines,
    // or it renders in nothing at all.
    const palette = { ...family.palette, ...SPRITE_PALETTES[def.id] };
    for (const [name, rows] of Object.entries(wreckedFrames(def.id, grid))) {
      register(family, name, rows, palette);
    }
  }
}

deriveWrecks(FLEET);

// ---- The town ---------------------------------------------------------------
// Every building on the road to GOODCO, and every loose piece it is dressed
// with (asset-tools/facade.mjs + facade-parts.mjs). Generated for the same
// reason the wreck ladder is: 26 archetypes in 3 colourways is 78 grids, and
// hand-drawing them means a street that can only grow at the speed somebody can
// pixel a wall.
//
// The roster is the ENGINE's own (`src/game/drive/town.ts`), read exactly the
// way the fleet is — so the art the atlas holds and the buildings the road can
// actually stand are the same list by construction.

/** Derive every shell and every part for a town roster, over the sprites
 * currently loaded. A function for the same reason `deriveWrecks` is one: a mod
 * that ships its own high street earns the identical treatment. */
export function deriveTown(town) {
  const family = FAMILIES.find((f) => f.name === "earth");
  if (!family) return;
  for (const def of town) {
    for (let i = 0; i < FACADE_COLOURWAYS.length; i++) {
      const { grid, palette } = facadeShell(def, i);
      register(family, `${def.id}${FACADE_COLOURWAYS[i]}`, grid, palette);
    }
  }
  const parts = facadeParts();
  const errors = facadePartsCheck(parts);
  if (errors.length) throw new Error(errors.join("\n"));
  for (const [name, grid] of Object.entries(parts)) {
    register(family, name, grid, FACADE_PARTS_PALETTE);
    // A part is a PIECE of a building rather than a thing standing on grass —
    // half of them are drawn to sit inside a hole in a wall — so holding one to
    // a contrast floor against a grass tile measures nothing. (The shells are
    // not exempt: a building really does stand on the verge.)
    family.contrastExempt.push(name);
  }
  family.speckleExempt = [
    ...(family.speckleExempt ?? []),
    ...FACADE_SPECKLE_EXEMPT,
  ];
}

deriveTown(TOWN);

// ---- Worn-gear overlays -----------------------------------------------------
// On-body looks generated from the gear catalog (asset-tools/worn.mjs) —
// never hand-drawn. Every hand-authored armor piece derives `worn_<id>`
// overlays: the slot's silhouette template (head pieces pick a style via
// `GearDef.worn`) recolored with a ramp off its inventory icon's dominant
// color, so re-theming the icon re-themes the worn look on the next
// `make assets`. Grade variants share their base's look (grades.ts keeps
// the icon) and derive nothing — the renderer resolves them via `gradeBase`.

// The slots that carry an on-body look. BOTH off-hand kinds are here for the
// same reason the four armor slots are: the second arm is a build choice, and a
// choice you cannot SEE on the hero is one the player has to go and read a
// screen to remember making. A shield draws raised and broad, a bag slung low
// and small (asset-tools/worn.mjs) — one glance, one answer.
const ARMOR_SLOTS = new Set(["head", "chest", "legs", "feet", "shield", "bag"]);

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
