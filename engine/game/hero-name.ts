// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE HERO HAS A NAME, AND THE GAME USES IT.
//
// The player names their character on the NEW GAME screen, and from then on
// that name is what the game calls him: it is printed over his own words in
// every box that speaks (the inner monologues, his replies in an arrival
// scene, the cutscene captions) and it is what the handful of people who
// actually KNOW him say out loud — the colleague who swings at him on the HQ
// floor, Ada's mother in his garage, his old bench partner, the machine that
// took his job and kept his file.
//
// **THE NAME IS PRESENTATION, NOT SIMULATION.** Nothing here reaches the
// state: a name changes no roll, no seed and no tick, so it is deliberately
// NOT a `RunParams` field and never travels the wire. Authored content writes
// {@link HERO_NAME_TOKEN} where the name goes and every surface that DRAWS
// authored text resolves it against the name of the hero that viewer is
// playing (`localHero`'s character, app-side) — which is also the only answer
// that makes sense in a party, where the box on each screen belongs to a
// different person.
//
// This module imports nothing on purpose: the token has to be readable from
// the engine's dialogue path, from the app's overlays, and from the content
// schemas that police it, without any of them dragging a catalog along.

/**
 * What authored text writes where the player's own hero name goes —
 * `I KNOW WHO YOU ARE, {HERO}.`
 *
 * Braces because no line in the game legitimately contains one, so a leftover
 * token is a bug that is impossible to mistake for prose. The pixel font has
 * no brace glyph, which makes an unresolved token loud on the screen as well
 * (`PixelText` prints an unknown character as `?`) rather than quietly
 * shipping.
 */
export const HERO_NAME_TOKEN = "{HERO}";

/**
 * What the name resolves to when the caller has no player to ask — a headless
 * simulation, an engine test, the library's published pages, a developer
 * preview. The game itself always has a name, so this is a floor rather than a
 * default anybody plays with.
 *
 * It is the NEW GAME field's own placeholder (`NewGame.tsx`) rather than the
 * first person the box used to print, because the token now has to work in
 * BOTH positions: as the label over his own words, and as a vocative inside
 * somebody else's line. "HELLO AGAIN, HERO." is a sentence; "HELLO AGAIN, ME."
 * is a bug report.
 */
export const HERO_NAME_FALLBACK = "HERO";

/** The name to print for this hero, falling back for a caller with none. */
export function heroNameOr(heroName?: string | null): string {
  const trimmed = heroName?.trim();
  return trimmed ? trimmed : HERO_NAME_FALLBACK;
}

/**
 * Resolve every {@link HERO_NAME_TOKEN} in one authored line.
 *
 * Returns the SAME string when there is nothing to replace, so a caller can
 * use the result's identity to skip re-wrapping text that did not change —
 * which is what keeps this cheap enough to run on every render of a box that
 * re-renders per typed character.
 *
 * `split`/`join` rather than `replaceAll`: a replacement string is interpreted
 * by the latter, so a hero who named himself `$&` would be replaced with the
 * token he was replacing.
 */
export function withHeroName(text: string, heroName?: string | null): string {
  if (!text.includes(HERO_NAME_TOKEN)) return text;
  return text.split(HERO_NAME_TOKEN).join(heroNameOr(heroName));
}

/**
 * Resolve a page of lines, preserving the array's IDENTITY when no line
 * carried the token (the overwhelmingly common case — only a handful of the
 * campaign's lines name him). That is the whole point of the pass: a box
 * re-renders per typed character, and an authored page handed back unchanged
 * lets the memoized wrap/pagination above it stand.
 *
 * Generic in the array type so a page comes back as it went in: the engine's
 * own `string[]` stays mutable, and an authored (readonly) page —
 * `LevelDef.intro`, a giver's `greeting` — is not forced through a copy at the
 * call site, which would defeat the identity check above.
 */
export function withHeroNameLines<T extends readonly string[]>(
  lines: T,
  heroName?: string | null,
): T {
  let changed = false;
  const out = lines.map((line) => {
    const resolved = withHeroName(line, heroName);
    if (resolved !== line) changed = true;
    return resolved;
  });
  // `map` widens a readonly array to `string[]`; the copy is the same shape as
  // its source, and this says so.
  return changed ? (out as unknown as T) : lines;
}
