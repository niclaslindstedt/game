#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// One-shot converter: the bundled per-family `.mjs` grid modules → one
// self-describing YAML file per atlas entry. It consumes the RESOLVED
// in-memory sprite data (families are
// built with palette ramps, `swapPalette` recolors, and cross-module imports,
// so only the evaluated grids + concrete palettes are lossless to convert),
// and emits:
//
//   sprites/_core.yaml             the shared core palette (concrete hex)
//   sprites/<family>/_family.yaml  ground, local palette, animations, wounds,
//                                  contrastExempt — the family orchestration
//   sprites/<family>/<name>.yaml   one base sprite: size, description stub,
//                                  the palette keys it actually uses, its grid
//
// Derived sprites (wounded variants, worn-gear overlays) are NOT emitted —
// they stay generated at build time from the content defs, exactly as before.
//
// Re-running once the `.mjs` modules are deleted is expected to fail: this is
// the migration step, kept for provenance and to re-derive the tree if the
// legacy modules are ever restored from history.

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { buildPalette } from "./asset-tools/palette.mjs";
import { paletteToHex, rgbaToHex, toYaml } from "./asset-tools/sprite-yaml.mjs";
import { CORE_PALETTE } from "./sprite-data/core.mjs";
import { FAMILIES } from "./sprite-data/index.mjs";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const root = here("../content/sprites");

/** Chars a grid paints with (everything but the reserved transparent `.`). */
function usedChars(grid) {
  const set = new Set();
  for (const row of grid) for (const c of row) if (c !== ".") set.add(c);
  return set;
}

// Start from a clean tree so a re-run never leaves orphaned files behind.
rmSync(root, { recursive: true, force: true });
mkdirSync(root, { recursive: true });

// The shared core palette, concrete — every family merges this under its local
// scope, and derived (wound/worn) sprites resolve their gore chars from it.
const core = buildPalette(CORE_PALETTE);
writeFileSync(`${root}/_core.yaml`, toYaml({ palette: paletteToHex(core) }));

let files = 0;
for (const family of FAMILIES) {
  // The synthetic `worn` family holds only build-time overlays (no grids).
  if (Object.keys(family.sprites).length === 0) continue;

  const dir = `${root}/${family.name}`;
  mkdirSync(dir, { recursive: true });

  const manifest = { name: family.name, ground: family.ground };
  if (Object.keys(family.localPalette).length > 0) {
    manifest.palette = paletteToHex(family.localPalette);
  }
  if (family.animations && Object.keys(family.animations).length > 0) {
    manifest.animations = family.animations;
  }
  if (family.wounds && Object.keys(family.wounds).length > 0) {
    manifest.wounds = family.wounds;
  }
  if (family.contrastExempt && family.contrastExempt.length > 0) {
    manifest.contrastExempt = [...family.contrastExempt];
  }
  writeFileSync(`${dir}/_family.yaml`, toYaml(manifest));

  for (const [name, grid] of Object.entries(family.sprites)) {
    const used = usedChars(grid);
    const palette = {};
    for (const char of [...used].sort()) {
      const rgba = family.palette[char];
      if (!rgba)
        throw new Error(`sprite "${name}": char "${char}" not in palette`);
      palette[char] = rgbaToHex(rgba);
    }
    writeFileSync(
      `${dir}/${name}.yaml`,
      toYaml({
        name,
        family: family.name,
        size: [grid[0].length, grid.length],
        description: "",
        palette,
        grid: `${grid.join("\n")}\n`,
      }),
    );
    files++;
  }
}

console.log(
  `wrote ${files} sprite files + ${FAMILIES.length - 1} families → ${root}`,
);
