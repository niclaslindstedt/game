// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Palette utilities — colors for sprites are organized as RAMPS: a named
// base color per subject (hero tunic, slime body, grass biome, …) from which
// shades and highlights are DERIVED programmatically, so related colors stay
// consistent and a whole subject can be re-themed by changing one base.
// `swapPalette` remaps grid characters, turning one drawing into palette
// variants (elite enemies, new biomes) without touching the pixels.

/** Clamp a channel to 0–255. */
const clip = (v) => Math.max(0, Math.min(255, Math.round(v)));

/** Darken an [r,g,b] (or [r,g,b,a]) color toward black by factor 0–1. */
export function shade([r, g, b, a = 255], factor) {
  return [
    clip(r * (1 - factor)),
    clip(g * (1 - factor)),
    clip(b * (1 - factor)),
    a,
  ];
}

/** Lighten a color toward white by factor 0–1. */
export function tint([r, g, b, a = 255], factor) {
  return [
    clip(r + (255 - r) * factor),
    clip(g + (255 - g) * factor),
    clip(b + (255 - b) * factor),
    a,
  ];
}

/** A standard three-step ramp derived from one base color. */
export function ramp(base, { shadeBy = 0.35, tintBy = 0.4 } = {}) {
  return {
    base: [...base, 255].slice(0, 4),
    dark: shade(base, shadeBy),
    light: tint(base, tintBy),
  };
}

/**
 * Remap grid characters (a → b) to produce a palette variant of a sprite
 * without redrawing it. Chars missing from the mapping pass through.
 *
 *   swapPalette(SPRITES.slime_0, { P: "R", Q: "S", L: "T" })
 */
export function swapPalette(grid, mapping) {
  return grid.map((row) => [...row].map((c) => mapping[c] ?? c).join(""));
}

/**
 * Merge ramp/color definitions into the flat char → RGBA palette that grids
 * reference. Throws on duplicate characters so two subjects can never
 * silently share a char.
 */
export function buildPalette(...charMaps) {
  const out = {};
  for (const map of charMaps) {
    for (const [char, color] of Object.entries(map)) {
      if (char in out) throw new Error(`palette char "${char}" defined twice`);
      out[char] = [...color, 255].slice(0, 4);
    }
  }
  return out;
}
