// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Worn-gear overlays — derive the on-body look of every armor piece from a
// per-slot silhouette template plus the piece's inventory-icon colors. The
// hero never gets a hand-drawn sprite per outfit: a worn overlay is a sparse
// 16×16 grid that repaints only the clothing pixels of the shared hero body
// plan (sprites/hero/*.yaml — hair rows 2–4, shirt rows 7–10, hips/legs
// rows 11–12, shoes row 13), so drawing it over ANY frame of either costume
// lines up by construction. Head pieces pick one of four silhouette styles
// (GearDef.worn); the other slots have one silhouette each. Colors are a
// standard ramp off the icon's dominant color, so a new gear def gets its
// worn look for free from the icon it already ships.
//
// Chars: "1" base, "2" dark, "3" light — resolved per def by `wornRamp`.

import { shade, tint } from "./palette.mjs";

// Head rows 2–4 sit above the face; the brim/band rows overpaint the
// forehead (row 4) or the eye row (row 5) where a real hat would.
const HEAD_TEMPLATES = {
  // A brimmed cap: crown over the hair, dark brim line across the forehead.
  cap: [
    "................",
    "................",
    ".....311111.....",
    "....11111111....",
    "....22222222....",
    "................",
  ],
  // A full helm: crown to jaw, cheek guards around the eyes.
  helm: [
    "................",
    "................",
    ".....311111.....",
    "....31111111....",
    "....11111111....",
    "....22....22....",
  ],
  // A mirrored visor: one reflective band straight across the eyes.
  visor: [
    "................",
    "................",
    "................",
    "................",
    "................",
    "....21331112....",
  ],
  // A face mask: forehead to chin, one dark eye slit.
  mask: [
    "................",
    "................",
    "................",
    "................",
    "....31111111....",
    "....11222211....",
    ".....211112.....",
  ],
};

// The torso: shirt rows 7–10 minus arms and hands (they stay skin/suit).
const CHEST_TEMPLATE = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  ".....311111.....",
  "....31111111....",
  "....11122111....",
  ".....112211.....",
];

// Hips + thighs per stride frame. The jump pose tucks the legs into the
// frame-0 columns, so `_0` doubles as the airborne overlay.
const LEGS_TEMPLATES = {
  _0: [
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "....31111112....",
    "....12....12....",
  ],
  _1: [
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "....31111112....",
    "...12......12...",
  ],
};

// Shoes per stride frame (the jump pose hides the feet entirely).
const FEET_TEMPLATES = {
  _0: [
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "....31....31....",
    "................",
  ],
  _1: [
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "...31......31...",
    "................",
  ],
};

/**
 * The overlay grids for one worn piece: suffix → grid. Head/chest pieces are
 * frame-independent (the hero's upper body never bobs) and map from the empty
 * suffix; legs/feet track the stride and map from "_0"/"_1".
 */
export function wornFrames(slot, style = "helm") {
  switch (slot) {
    case "head": {
      const grid = HEAD_TEMPLATES[style];
      if (!grid) throw new Error(`unknown worn head style "${style}"`);
      return { "": grid };
    }
    case "chest":
      return { "": CHEST_TEMPLATE };
    case "legs":
      return LEGS_TEMPLATES;
    case "feet":
      return FEET_TEMPLATES;
    default:
      throw new Error(`slot "${slot}" has no worn overlay`);
  }
}

/**
 * The 1/2/3 ramp a worn overlay renders with, derived from the piece's
 * inventory icon: the icon's dominant color (most-painted char, transparency
 * and outline excluded) becomes the base, with the dark/light steps derived
 * exactly like every other subject ramp — so the worn look re-themes itself
 * whenever the icon does. A piece whose signature color is an accent rather
 * than its main material overrides the pick with `GearDef.wornChar`.
 */
export function wornRamp(iconGrid, iconPalette, preferredChar) {
  let char = preferredChar;
  if (!char) {
    const counts = new Map();
    for (const row of iconGrid) {
      for (const c of row) {
        if (c === "." || c === "O") continue;
        counts.set(c, (counts.get(c) ?? 0) + 1);
      }
    }
    const dominant = [...counts.entries()].sort(
      (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1),
    )[0];
    if (!dominant) throw new Error("icon grid has no body pixels");
    char = dominant[0];
  }
  const base = iconPalette[char];
  if (!base) throw new Error(`icon char "${char}" not in palette`);
  return { 1: base, 2: shade(base, 0.35), 3: tint(base, 0.4) };
}
