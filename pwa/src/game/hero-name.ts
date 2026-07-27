// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// HERO NAME — the text rules behind the NEW GAME name field.
//
// The field LOOKS uppercase (the pixel font has no lowercase glyphs), but the
// real <input> underneath must hold exactly what the platform typed into it.
// Upper-casing a controlled input's value on every keystroke makes React
// assign `input.value` behind the keyboard's back, and iOS's predictive text
// tracks the word it is about to replace by RANGE: once the text in that range
// is not the text iOS wrote there, tapping a suggestion replaces nothing and
// only the delimiter it appends — a lone space — lands in the field. So the
// state stays verbatim and the casing happens here: `heroNameDisplay` for the
// glyphs the player sees, `heroName` for what actually gets minted.

/** How many characters a hero name may hold. */
export const MAX_HERO_NAME = 14;

/** The typed text as the pixel field draws it (the font is uppercase-only). */
export function heroNameDisplay(raw: string): string {
  return raw.toUpperCase();
}

/**
 * Clamp a field edit to the name budget, leaving the text otherwise verbatim —
 * and returning the SAME string when it already fits, so React has nothing to
 * write back over the live input and the keyboard keeps its own state.
 */
export function clampHeroName(raw: string): string {
  return raw.length > MAX_HERO_NAME ? raw.slice(0, MAX_HERO_NAME) : raw;
}

/**
 * The name a hero is minted with: uppercase, with the surrounding whitespace
 * an autocomplete tap leaves behind trimmed off.
 */
export function heroName(raw: string): string {
  return raw.trim().toUpperCase();
}
