// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Text-fitting helpers for the tap-to-scroll dialogue overlays. A page arrives
// from the catalogs as a handful of AUTHORED lines, and the box it lands in is
// a different width on every device — so the two steps here are "reflow the
// page to the column it is actually being drawn in" and "cut the result into
// screenfuls the player pages through" (see DialogueOverlay / IntroOverlay).
// Both are pure and DOM-free so they unit-test without a canvas. Generic
// React/UI game code: lives in pwa/src/lib/ (imported as @ui/lib/*) so it can
// be extracted into oss-framework once mature.

/**
 * Break an authored page into the visual rows it is actually drawn as.
 *
 * A page arrives as a list of authored lines and each one is FLOWED into the
 * column the box really has: the entry is the text, the column decides where
 * it breaks. A page therefore wants to be ONE entry — the box then fills its
 * whole width on a desktop and folds gracefully on a portrait phone — and a
 * SECOND entry is an explicit, deliberate line break (a beat, a held pause),
 * which is why the content authors them sparingly. Rows come back flattened
 * in order, so the caller can page and typewriter them as one list.
 *
 * `wrap` is null until the column has been measured (the very first layout
 * pass); the authored lines are handed back untouched so that frame still
 * reads correctly instead of flashing one long line off the edge.
 */
export function wrapPage(
  lines: readonly string[],
  wrap: ((text: string) => string[]) | null,
): string[] {
  if (!wrap) return [...lines];
  return lines.flatMap((line) => wrap(line));
}

/**
 * Chunk pre-wrapped visual `lines` into screens of at most `maxPerScreen`
 * rows, in order. Always returns at least one screen (an empty one for empty
 * input) so a caller can safely index `[0]`. A non-positive `maxPerScreen` is
 * clamped to one row per screen so the loop can never stall.
 */
export function paginateLines(
  lines: readonly string[],
  maxPerScreen: number,
): string[][] {
  const size = Math.max(1, Math.floor(maxPerScreen));
  const screens: string[][] = [];
  for (let i = 0; i < lines.length; i += size) {
    screens.push(lines.slice(i, i + size));
  }
  return screens.length > 0 ? screens : [[]];
}
