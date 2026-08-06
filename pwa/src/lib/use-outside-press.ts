// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// "A press that misses the raised thing puts it away" — the one rule every
// floating card in the game dismisses by. Generic React code (usable by any
// game), so it lives in pwa/src/lib/, the pool a later game keeps as-is.

import { useEffect, useRef } from "react";

/**
 * Is this press ON something that OWNS the raised surface — the surface itself,
 * or the cell that raised it?
 *
 * Answered from the DOM (`closest`) rather than from the React tree, and that
 * is the whole point: a floating card is PORTALED to <body>, so React's own
 * event propagation still routes its presses through the panel that rendered
 * it, and a panel-level "did this press miss my cells?" test judges a press
 * that landed squarely INSIDE the card to be a miss — dismissing the very card
 * the player was trying to read.
 *
 * A press with no `closest` (the document itself, a window-level synthetic) is
 * OUTSIDE: nothing that owns a card is unable to answer.
 *
 * THE SELECTOR MUST NAME OWNERS, NOT NEIGHBOURS. A grid's cell class is the
 * tempting spelling and the wrong one: a bag is mostly EMPTY cells, which raise
 * nothing and do nothing, so exempting the class hands most of the panel's
 * surface a press that neither opens anything nor closes anything. The game's
 * callers therefore stamp `data-card` on the cells actually holding a piece and
 * exempt that.
 */
export function pressIsInside(
  target: EventTarget | null,
  insideSelector: string,
): boolean {
  const el = target as { closest?: (selectors: string) => unknown } | null;
  return typeof el?.closest === "function"
    ? el.closest(insideSelector) != null
    : false;
}

/**
 * While `active`, dismiss on any press that lands outside `insideSelector`.
 *
 * Bound on `window` in the CAPTURE phase, which buys two things a handler on
 * the panel cannot: it sees presses ANYWHERE (a card raised over a full-screen
 * overlay is dismissed by a press on the backdrop too, not only by one inside
 * the panel), and it is immune to a `stopPropagation` somewhere on the way up.
 * The press that RAISED the surface can never be seen by it — the listener is
 * bound by an effect, which runs after that press's handler has already had its
 * say — so this never eats its own opening gesture.
 *
 * It only DISMISSES: the press goes on to reach whatever it landed on, so a
 * button under a raised card still fires on the same press that puts it away.
 */
export function useDismissOnOutsidePress(
  active: boolean,
  insideSelector: string,
  onDismiss: () => void,
): void {
  // Latched so a caller may pass a fresh closure every render (an overlay with
  // a typewriter in it renders every frame) without rebinding the listener.
  const latest = useRef(onDismiss);
  useEffect(() => {
    latest.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!active) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (pressIsInside(event.target, insideSelector)) return;
      latest.current();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, [active, insideSelector]);
}
