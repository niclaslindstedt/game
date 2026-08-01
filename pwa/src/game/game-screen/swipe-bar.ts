// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The SWIPE BARS gesture's geometry — the pure half of SwipeDock.tsx, split
// out so the numbers that decide "did that swipe mean it" and "where does the
// bar fit" are testable without a DOM. The component owns the pointers and
// the DOM; this module owns the arithmetic.

/** Which screen edge a reveal swipe came in from. There is no top edge on
 * purpose: the top of the screen is the HUD's (vitals, minimap), and a bar
 * opening under the XP strip would sit over the fight's busiest chrome. */
export type SwipeEdge = "left" | "right" | "bottom";

/** How deep the invisible edge strips run (CSS px). Deliberately narrow: a
 * touch landing here is eaten by the gesture instead of anchoring the
 * steering dpad, so the strip must cost as little field as it can while
 * staying catchable by a thumb aiming at the screen's rim. */
export const SWIPE_ZONE_PX = 24;

/** How far a touch must travel INWARD from its edge before the reveal
 * commits (CSS px). Past the strip's own width, so a resting thumb or a
 * fidget on the rim never pops the bar — only a deliberate pull does. */
export const SWIPE_OPEN_PX = 32;

/** The breathing room the opened bar keeps from every screen edge (CSS px). */
export const SWIPE_BAR_MARGIN_PX = 8;

/** How far a touch has travelled INWARD from its edge — positive is "into
 * the field", negative is off-screen. The cross-axis component is ignored:
 * a swipe that drifts along the edge while pulling inward still means it. */
export function inwardTravel(
  edge: SwipeEdge,
  start: { x: number; y: number },
  now: { x: number; y: number },
): number {
  switch (edge) {
    case "left":
      return now.x - start.x;
    case "right":
      return start.x - now.x;
    case "bottom":
      return start.y - now.y;
  }
}

/**
 * Clamp the bar's centre so a bar `size` px long stays `margin` clear of both
 * ends of a viewport `span` px long. The swipe's own coordinate is the ASK —
 * "open it here, where my thumb is" — and this is the only correction applied
 * to it, so a swipe at 70% height centres the bar at 70% height unless the
 * bar would hang off the screen there. A bar too long for the span at all
 * (a tiny viewport) parks in the middle.
 */
export function clampBarCenter(
  center: number,
  size: number,
  span: number,
  margin: number = SWIPE_BAR_MARGIN_PX,
): number {
  const half = size / 2;
  const lo = margin + half;
  const hi = span - margin - half;
  if (lo > hi) return span / 2;
  return Math.min(hi, Math.max(lo, center));
}
