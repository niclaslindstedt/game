// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Keyboard-aware viewport — pins a fixed, full-screen element to the *visual*
// viewport rather than the layout viewport, so it stays fully visible when the
// mobile on-screen keyboard opens. On iOS (Safari and standalone PWAs) the
// software keyboard does not shrink the layout viewport: a `position: fixed;
// inset: 0` shell keeps its full height and its centred content ends up hidden
// behind the keyboard. The VisualViewport API reports the region that is
// actually visible above the keyboard; mirroring its height and offset onto the
// element makes flex centring land in that region instead.
// Generic React/UI game code: lives in website/src/lib/ (imported as @ui/lib/*)
// so it can be extracted into oss-framework once mature.

import { useEffect, type RefObject } from "react";

/**
 * Keep a `position: fixed` element sized and positioned to the visual viewport,
 * so it tracks the space left above the on-screen keyboard. Overrides `height`,
 * `top` and `bottom` inline while mounted (restoring them on cleanup); the
 * element should be `position: fixed` so the offsets apply. A no-op where the
 * VisualViewport API is unavailable, leaving the CSS layout untouched.
 *
 * Use it on screens with a focusable text field (name entry, search) that must
 * stay centred when the keyboard is up.
 *
 * @param ref the fixed, full-screen element to pin to the visual viewport
 */
/**
 * While `active`, keep an element centred in its nearest scroll container,
 * re-centring whenever the visual viewport resizes or shifts (the on-screen
 * keyboard opening, closing, or animating). Pair it with
 * {@link useVisualViewportBox}: that hook shrinks the screen to the band above
 * the keyboard; this one scrolls the element that matters (a focused text
 * field) to the middle of that band instead of leaving the scroll box
 * top-anchored with the field cut off at the keyboard's edge.
 *
 * `scrollIntoView({ block: "center" })` is a no-op when everything already
 * fits, so it is safe to run on desktop and when the keyboard is closed.
 *
 * @param ref the element to keep centred (e.g. the input's frame)
 * @param active center only while true (e.g. while the input is focused)
 */
export function useCenterWhileFocused(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
): void {
  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;
    const center = () =>
      el.scrollIntoView({ block: "center", inline: "nearest" });
    center();
    const vv = window.visualViewport;
    vv?.addEventListener("resize", center);
    vv?.addEventListener("scroll", center);
    return () => {
      vv?.removeEventListener("resize", center);
      vv?.removeEventListener("scroll", center);
    };
  }, [ref, active]);
}

export function useVisualViewportBox(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    const vv = window.visualViewport;
    if (!el || !vv) return;

    const clear = () => {
      el.style.height = "";
      el.style.top = "";
      el.style.bottom = "";
    };

    const apply = () => {
      // Only take over the layout while the keyboard is actually shrinking the
      // visible area — otherwise leave the resting CSS (which owns iOS safe-area
      // extension) untouched. A small slack absorbs rounding/toolbar jitter.
      const shrunk = window.innerHeight - vv.height > 24 || vv.offsetTop > 0;
      if (!shrunk) {
        clear();
        return;
      }
      el.style.height = `${vv.height}px`;
      // offsetTop is how far the layout viewport has scrolled up under the
      // visual viewport (iOS shifts it to reveal a focused field); tracking it
      // keeps the pinned box aligned to the visible band's top edge.
      el.style.top = `${vv.offsetTop}px`;
      el.style.bottom = "auto";
    };

    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
      clear();
    };
  }, [ref]);
}
