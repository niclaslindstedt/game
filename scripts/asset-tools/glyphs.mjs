// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE PIXEL FONT CAN DRAW — the check every authored string that reaches
// `PixelText` owes its author.
//
// The font atlas has a cell per glyph and `pixel-font.ts` falls back to `?` for
// anything else, so an accent, a curly quote or an em dash in a string the game
// draws itself comes out as `H?LLSTR?M` — silently, and usually on a screen its
// author does not re-read. The glyph set travels to the mod compiler in
// `mod/catalog.json` (it has no engine to ask), which is why this takes the set
// as an argument rather than importing `font.mjs`: the same function then serves
// the repo's own build and the shipped desktop app.

/**
 * The characters of `text` the font has no cell for, deduped, in the order they
 * appear. Uppercased first, exactly as `PixelText` looks a glyph up.
 *
 * @param text   the authored string
 * @param glyphs every drawable character, as one string (`catalog.glyphs`)
 * @returns the offending characters — empty when the string is drawable, and
 *   empty when `glyphs` is missing, because a check that cannot be made must
 *   not report every character as broken.
 */
export function unwritableChars(text, glyphs) {
  const known = new Set((glyphs ?? "").split(""));
  if (known.size === 0) return [];
  const missing = [];
  for (const char of String(text ?? "").toUpperCase()) {
    if (!known.has(char) && !missing.includes(char)) missing.push(char);
  }
  return missing;
}

/** A ready-made finding for a string the font cannot draw, or null when it can.
 * One wording, so every surface reports the same problem the same way. */
export function glyphProblem(text, glyphs, what) {
  const missing = unwritableChars(text, glyphs);
  if (missing.length === 0) return null;
  return (
    `${what} uses ${missing.map((c) => `"${c}"`).join(", ")}, which the ` +
    'game\'s pixel font cannot draw — it would render as "?" in the game'
  );
}
