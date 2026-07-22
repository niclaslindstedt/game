// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Windowing helper for tap-to-scroll text overlays. A dialogue box only shows
// a few rows at once; when text wraps past that, the box pages through it a
// screenful at a time (see DialogueOverlay). This module owns the pure "cut a
// list of already-wrapped lines into fixed-size screens" step — DOM-free so it
// unit-tests without a canvas. Generic React/UI game code: lives in
// pwa/src/lib/ (imported as @ui/lib/*) so it can be extracted into
// oss-framework once mature.

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
