// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Shared presentation for the cast-spell system (defs/spells.ts): the element
// palette and school labels the HUD spell bar, the picker, the unlock modal,
// and the cast FX (spell-fx.ts + render.ts) all draw from, so a spell reads the
// same colour everywhere. The engine knows nothing of this — it's pure app
// theming keyed off `SpellDef.element` / `.category`.

import type { SpellCategory, SpellElement } from "@game/core";

/** The signature colour of each spell ELEMENT — the icon accent, the slot ring,
 * and the cast-FX tint. A vivid, distinct hue per school of magic. */
export const SPELL_ELEMENT_COLORS: Record<SpellElement, string> = {
  storm: "#7ec8ff", // electric sky-blue
  fire: "#ff8a3c", // ember orange
  frost: "#9fe8ff", // pale ice
  holy: "#ffe08a", // radiant gold
  void: "#c07bff", // amethyst void
  arcane: "#ff7bd5", // arcane magenta
  blood: "#ff5a5a", // crimson
};

/** A dimmer companion tint per element (glow cores, gradient stops). */
export const SPELL_ELEMENT_DEEP: Record<SpellElement, string> = {
  storm: "#2f6fd0",
  fire: "#c0431a",
  frost: "#3aa6d9",
  holy: "#c9932f",
  void: "#7736c0",
  arcane: "#c0338f",
  blood: "#b02a2a",
};

/** The three schools, as short HUD labels (picker rows, unlock modal). */
export const SPELL_CATEGORY_LABEL: Record<SpellCategory, string> = {
  attack: "SINGLE TARGET",
  aoe: "AREA",
  defense: "DEFENSIVE",
};

/** A short accent per school — a subtle secondary read beside the element. */
export const SPELL_CATEGORY_COLOR: Record<SpellCategory, string> = {
  attack: "#ff9a6b",
  aoe: "#ffcf5b",
  defense: "#7be0a4",
};

/** The element colour for a spell, defaulting to a neutral arcane blue. */
export function spellColor(element: SpellElement): string {
  return SPELL_ELEMENT_COLORS[element] ?? "#8fb7ff";
}
