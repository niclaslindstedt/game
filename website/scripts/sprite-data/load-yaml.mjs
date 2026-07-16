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

import {
  proseSizeMismatch,
  unnamedPaletteKeys,
} from "../asset-tools/coherence.mjs";
import { buildPalette } from "../asset-tools/palette.mjs";
import { paletteComments } from "../asset-tools/prompt.mjs";
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
      const rawText = readFileSync(`${dir}/${file}`, "utf8");
      const sprite = parse(rawText);
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
      // Prompt↔sprite sync, the one coherence check cheap enough for every
      // build: prose that states a size the `size` field contradicts (a stale
      // "(20x20)" left behind after a resize). A warning, not an error — the
      // full per-sprite check is `sprite-author verify`, and a description may
      // legitimately name another sprite's size in passing.
      const badSize = proseSizeMismatch(sprite);
      if (badSize) {
        console.warn(
          `! ${sprite.name}: prose says ${badSize[0]}×${badSize[1]} but size is ${sprite.size?.[0]}×${sprite.size?.[1]} — run: sprite-author verify ${sprite.name}`,
        );
      }
      // Recreatability: a palette color with no `# name` comment prompts as
      // bare hex, so the generation prompt can't reliably reproduce it. Warn
      // (never fail — a freshly `analyze`d sprite has an unnamed palette until
      // it's refined) so naming stays an enforced, drift-checked invariant.
      const unnamed = unnamedPaletteKeys(
        sprite.palette,
        paletteComments(rawText),
      );
      if (unnamed.length > 0) {
        console.warn(
          `! ${sprite.name}: ${unnamed.length} unnamed palette color(s) (${unnamed.join(", ")}) — add "# name" comments; see: sprite-author verify ${sprite.name}`,
        );
      }
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
