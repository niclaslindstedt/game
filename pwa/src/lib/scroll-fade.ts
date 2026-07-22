// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Soft scroll edges — fades content in and out of a scroll box instead of
// letting it clip in with a hard line at the top and bottom. Watches an
// element's scroll position and writes two 0..1 CSS variables (`--fade-top`,
// `--fade-bottom`) that a mask gradient in the stylesheet reads: 0 means the
// edge is at rest (no fade, so the first/last row stays fully visible when you
// reach it), 1 means there is hidden content past that edge (fade it out).
// Generic React/UI game code: lives in pwa/src/lib/ (imported as
// @ui/lib/*) so it can be extracted into oss-framework once mature. The mask
// itself is pure CSS; this hook owns only the scroll-position bookkeeping.

import { useEffect, type RefObject } from "react";

/** Scroll distance (CSS px) over which an edge's fade eases fully in. Keeping
 * it short means the fade is essentially "on" the moment content slips past
 * the edge, while still ramping in over the first sliver of travel rather than
 * snapping — and it reaches exactly 0 at the very top/bottom so the outermost
 * row is never dimmed once you scroll to it. */
const FADE_EASE_PX = 28;

/**
 * Keep an element's `--fade-top` / `--fade-bottom` in sync with its scroll
 * position, so a mask gradient can soften whichever edge has content hidden
 * past it. Re-measures whenever `deps` change (a screen swap, a list rebuild)
 * and on scroll, element resize, and window resize.
 *
 * @param ref   the scroll container to soften
 * @param deps  values that, when changed, warrant a fresh measurement
 */
export function useScrollFade(
  ref: RefObject<HTMLElement | null>,
  deps: readonly unknown[] = [],
): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const top = el.scrollTop;
      const bottom = el.scrollHeight - el.clientHeight - top;
      // Round-off and sub-pixel layout can leave a hair of phantom overflow;
      // clamp so a box that cannot actually scroll reports no fade at all.
      const fadeTop = Math.max(0, Math.min(1, top / FADE_EASE_PX));
      const fadeBottom = Math.max(0, Math.min(1, bottom / FADE_EASE_PX));
      el.style.setProperty("--fade-top", fadeTop.toFixed(3));
      el.style.setProperty("--fade-bottom", fadeBottom.toFixed(3));
    };

    measure();
    el.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    // The content can grow/shrink without a scroll or window resize — a screen
    // swaps its rows, a blurb wraps — so watch the box itself too.
    const observer =
      typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    observer?.observe(el);

    return () => {
      el.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, ...deps]);
}
