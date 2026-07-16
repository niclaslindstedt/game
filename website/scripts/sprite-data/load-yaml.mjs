// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The YAML sprite loader (see the `pixel-assets` skill). Globs the
// `sprites/` tree — one self-describing file per base sprite — and produces
// the same in-memory maps the old per-family `.mjs` merge did, so everything
// downstream (wound/worn derivation in index.mjs, then the whole
// generate-assets pipeline) is unchanged. `.` is the reserved transparent
// key; every other char resolves to a concrete `[r,g,b,a]` color.
//
// Layout:
//   sprites/_core.yaml             shared core palette (concrete hex)
//   sprites/<family>/_family.yaml  ground, local palette, animations,
//                                  wounds, contrastExempt
//   sprites/<family>/<name>.yaml   name, family, size, description, the
//                                  palette keys it uses, and its grid

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

import { buildPalette } from "../asset-tools/palette.mjs";
import {
  gridRows,
  validatePalette,
  validateSprite,
} from "../asset-tools/sprite-schema.mjs";
import { paletteFromHex } from "../asset-tools/sprite-yaml.mjs";

const spritesDir = fileURLToPath(new URL("../sprites", import.meta.url));

const readYaml = (path) => parse(readFileSync(path, "utf8"));

/**
 * Load the whole sprite tree.
 *
 * @returns `{ CORE_PALETTE, FAMILIES, SPRITES, SPRITE_PALETTES, SPRITE_FAMILY,
 *            ANIMATIONS }` — the base (hand-authored) sprites only; wounded and
 *            worn variants are derived on top of these by index.mjs.
 */
export function loadSprites() {
  const errors = [];
  const core = readYaml(`${spritesDir}/_core.yaml`);
  errors.push(...validatePalette("_core.yaml", core.palette));
  const CORE_PALETTE = buildPalette(paletteFromHex(core.palette ?? {}));

  const familyNames = readdirSync(spritesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  const SPRITES = {};
  const SPRITE_PALETTES = {};
  const SPRITE_FAMILY = {};
  const ANIMATIONS = {};
  const FAMILIES = [];

  for (const name of familyNames) {
    const dir = `${spritesDir}/${name}`;
    const manifest = readYaml(`${dir}/_family.yaml`);
    if (manifest.name !== name) {
      throw new Error(
        `family "${name}": _family.yaml name is "${manifest.name}"`,
      );
    }
    errors.push(...validatePalette(`${name}/_family.yaml`, manifest.palette));
    const local = paletteFromHex(manifest.palette ?? {});
    const family = {
      name,
      ground: manifest.ground,
      // Full scope (core + local) — wound/worn derivation renders with it, and
      // buildPalette throws if the family shadows a core char.
      palette: buildPalette(CORE_PALETTE, local),
      // Local scope alone — the palette preview sheet renders it as a section.
      localPalette: buildPalette(local),
      sprites: {},
      animations: manifest.animations ?? {},
      contrastExempt: manifest.contrastExempt ?? [],
      // The family's shared look, in words — the anchor a generated sprite's
      // prompt inherits so a whole biome renders as one set. Optional.
      style: manifest.style ?? "",
    };
    if (manifest.wounds) family.wounds = manifest.wounds;

    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".yaml") && f !== "_family.yaml")
      .sort();
    for (const file of files) {
      const sprite = readYaml(`${dir}/${file}`);
      const stem = file.slice(0, -".yaml".length);
      if (sprite.name !== stem) {
        errors.push(
          `${name}/${file}: name is "${sprite.name}", expected "${stem}"`,
        );
      }
      if (sprite.family !== name) {
        errors.push(
          `${name}/${file}: family is "${sprite.family}", expected "${name}"`,
        );
      }
      if (sprite.name in SPRITES) {
        errors.push(
          `sprite "${sprite.name}" defined by both "${SPRITE_FAMILY[sprite.name]}" and "${name}"`,
        );
        continue;
      }
      errors.push(...validateSprite(sprite).errors);
      const grid = gridRows(sprite.grid);
      SPRITES[sprite.name] = grid;
      SPRITE_PALETTES[sprite.name] = paletteFromHex(sprite.palette ?? {});
      SPRITE_FAMILY[sprite.name] = name;
      family.sprites[sprite.name] = grid;
    }

    Object.assign(ANIMATIONS, family.animations);
    FAMILIES.push(family);
  }

  if (errors.length > 0) {
    throw new Error(
      `${errors.length} sprite schema error(s):\n  ${errors.join("\n  ")}`,
    );
  }

  return {
    CORE_PALETTE,
    FAMILIES,
    SPRITES,
    SPRITE_PALETTES,
    SPRITE_FAMILY,
    ANIMATIONS,
  };
}
