// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Placing a floating box BESIDE the thing that raised it, in viewport
// coordinates — the one rule every hover card in the game follows.
//
// The rule that matters is what it REFUSES to do: it never covers the anchor.
// A card parked over the cell you tapped hides the icon you are deciding about,
// and on touch (where the first tap raises the card and the second commits) it
// hides the very target the second tap has to hit. So the box goes to the
// anchor's right, flips to its left, and only when neither side has room drops
// below or above it — clamped to the viewport on the cross axis, never over the
// anchor on the main one.
//
// Generic React/UI, so it lives in lib/ and is imported as `@ui/lib/anchor-box.ts`.

import { clamp } from "@game/lib/vec.ts";

/** Where a floating box should sit, in viewport (fixed-position) pixels. */
export type BoxPos = { left: number; top: number };

/** How big the box is, and how big the space it has to fit in. */
export type BoxRect = { width: number; height: number };

export type PlaceOpts = {
  /** Gap between the anchor and the box (px). */
  gap?: number;
  /** Keep-out margin from the viewport edges (px). */
  margin?: number;
  /** Viewport size; defaults to the window's inner box. */
  viewport?: BoxRect;
};

/** The shared defaults — the numbers the inventory tooltip was written with,
 * so every surface that adopts this helper looks identical to it. */
const GAP = 10;
const MARGIN = 6;

/**
 * Place `box` beside `anchor`: right, else left, else below, else above —
 * clamped inside the viewport. The returned position is always ON SCREEN; it
 * only stops honouring "never over the anchor" when the box is so large that no
 * side fits at all, in which case the last fallback (above) is clamped and may
 * overlap. Callers that can't tolerate that should shrink the box.
 */
export function placeBeside(
  anchor: DOMRect,
  box: BoxRect,
  opts: PlaceOpts = {},
): BoxPos {
  const gap = opts.gap ?? GAP;
  const margin = opts.margin ?? MARGIN;
  const vw = opts.viewport?.width ?? window.innerWidth;
  const vh = opts.viewport?.height ?? window.innerHeight;
  const { width: w, height: h } = box;
  // Beside the anchor — right, else left — never over it.
  if (anchor.right + gap + w <= vw - margin) {
    return {
      left: anchor.right + gap,
      top: clamp(anchor.top, margin, Math.max(margin, vh - margin - h)),
    };
  }
  if (anchor.left - gap - w >= margin) {
    return {
      left: anchor.left - gap - w,
      top: clamp(anchor.top, margin, Math.max(margin, vh - margin - h)),
    };
  }
  // No side room (a narrow portrait phone): below the anchor, else above.
  const left = clamp(anchor.left, margin, Math.max(margin, vw - margin - w));
  const top =
    anchor.bottom + gap + h <= vh - margin
      ? anchor.bottom + gap
      : Math.max(margin, anchor.top - gap - h);
  return { left, top };
}

/** Do two placed boxes overlap? Used to keep a second card off the first. */
export function boxesOverlap(
  a: BoxPos & BoxRect,
  b: BoxPos & BoxRect,
): boolean {
  return (
    a.left < b.left + b.width &&
    a.left + a.width > b.left &&
    a.top < b.top + b.height &&
    a.top + a.height > b.top
  );
}

/**
 * Place TWO boxes that belong together — a card and the card it is being
 * compared against — as ONE object beside the anchor.
 *
 * It exists because placing them one at a time fails: put the first box down,
 * and the second has to find a free spot around it that is also on screen and
 * also off the anchor. On a small phone or a 2×-scaled tablet there often is
 * no such spot, and the caller's only remaining move is to drop the second box
 * — which is the comparison itself going missing exactly where it is hardest
 * to do in your head. Sized and placed as one block, the pair fits wherever a
 * block that size fits, so the second card stops being optional.
 *
 * `primary` is the box the anchor is ABOUT (the inspected item's card); it is
 * kept on the side nearest the anchor, so the eye travels icon → its card →
 * the thing it is being weighed against. The pair lays out in a ROW when a row
 * fits and a COLUMN otherwise, since which axis has room is a property of the
 * screen rather than of the cards.
 */
export function placePair(
  anchor: DOMRect,
  primary: BoxRect,
  secondary: BoxRect,
  opts: PlaceOpts = {},
): { primary: BoxPos; secondary: BoxPos } {
  const gap = opts.gap ?? GAP;
  const margin = opts.margin ?? MARGIN;
  const vw = opts.viewport?.width ?? window.innerWidth;
  const vh = opts.viewport?.height ?? window.innerHeight;
  const row = {
    width: primary.width + gap + secondary.width,
    height: Math.max(primary.height, secondary.height),
  };
  const col = {
    width: Math.max(primary.width, secondary.width),
    height: primary.height + gap + secondary.height,
  };
  // Both shapes are actually PLACED and then scored, rather than picked on
  // size alone: a row can be narrow enough for the viewport and still have
  // nowhere to sit beside the anchor, which lands it back over the cell it is
  // describing. Spilling off the screen is the worse of the two faults, so it
  // dominates the score; covering the anchor breaks the tie. A row wins an
  // outright tie — reading two cards side by side beats reading them stacked.
  const opts2 = { gap, margin, viewport: { width: vw, height: vh } };
  const cost = (box: BoxRect, at: BoxPos) => {
    const off =
      Math.max(0, margin - at.left) +
      Math.max(0, at.left + box.width - (vw - margin)) +
      Math.max(0, margin - at.top) +
      Math.max(0, at.top + box.height - (vh - margin));
    const over = boxesOverlap(
      { ...at, ...box },
      {
        left: anchor.left,
        top: anchor.top,
        width: anchor.width,
        height: anchor.height,
      },
    )
      ? 1
      : 0;
    return off * 4 + over;
  };
  const rowAt = placeBeside(anchor, row, opts2);
  const colAt = placeBeside(anchor, col, opts2);
  const asRow = cost(row, rowAt) <= cost(col, colAt);
  const box = asRow ? row : col;
  const at = asRow ? rowAt : colAt;
  // Which end of the block the anchor is at, judged against the block's MIDDLE
  // rather than its far edge: when the pair had to be clamped it can end a few
  // pixels short of clearing the anchor, and a rule that demands full
  // separation flips the wrong way on exactly those layouts. Past the middle
  // means the anchor is on the far side, so the primary card takes that end
  // and still lands nearest the cell it describes.
  const flip = asRow
    ? anchor.left >= at.left + box.width / 2
    : anchor.top >= at.top + box.height / 2;
  if (asRow) {
    const primaryLeft = flip ? at.left + box.width - primary.width : at.left;
    const secondaryLeft = flip ? at.left : at.left + primary.width + gap;
    return {
      primary: { left: primaryLeft, top: at.top },
      secondary: { left: secondaryLeft, top: at.top },
    };
  }
  const primaryTop = flip ? at.top + box.height - primary.height : at.top;
  const secondaryTop = flip ? at.top : at.top + primary.height + gap;
  return {
    primary: { left: at.left, top: primaryTop },
    secondary: { left: at.left, top: secondaryTop },
  };
}
