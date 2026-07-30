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
