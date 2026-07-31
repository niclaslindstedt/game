// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Measures the live width of a text column in the UNSCALED font pixels the
// pixel font speaks, so an overlay can re-break its authored copy to the box
// it is actually being drawn in. Every dialogue surface needs the same three
// steps — read the element's CSS width, divide out the integer text scale and
// the root font-size bump the large-screen breakpoints apply, re-measure on
// resize — so they live here once rather than once per overlay. Generic
// React/UI game code: lives in pwa/src/lib/ (imported as @ui/lib/*) so it can
// be extracted into oss-framework once mature.

import { useLayoutEffect, useState } from "react";

/** CSS px per rem at the default root font-size (styles.css bumps the root on
 * large screens; the hook reads the live value, this is only the reference). */
const REM_BASE_PX = 16;

/**
 * The width of a text column in unscaled font pixels — the unit
 * `PixelFont.wrap` and `measure` speak — plus the ref to attach to it.
 *
 * **IT HANDS BACK A CALLBACK REF, NOT A `useRef` OBJECT, AND THAT IS THE FIX
 * FOR A SHIPPED BUG.** A ref object is not reactive: mutating `ref.current`
 * neither re-renders nor re-runs an effect that lists the ref in its deps (the
 * OBJECT is stable; only its contents moved). An effect keyed on `[ref]`
 * therefore runs once, reads whatever was there at first commit, and never
 * looks again — so a surface that mounts one branch first and the measured one
 * second measured `null` and stayed null for its whole life. QuestOverlay does
 * exactly that: it opens on the giver's PICK LIST, whose column is a different
 * element from the offer's speech, so every row of the ask fell back to the
 * loose safety cap — which on a portrait phone is wider than the modal, and the
 * speech ran out of the box and was clipped by its edge. React calls a callback
 * ref with the node on attach and `null` on detach, which is precisely the
 * signal that was missing.
 *
 * `scale` is the integer `PixelText` scale the column's rows are drawn at: one
 * font pixel occupies `scale` canvas px, each shown at `rootPx/16` CSS px, so
 * the CSS width divides by their product.
 *
 * Measured in a LAYOUT effect (before paint) so the first painted frame already
 * carries correctly-broken text — no flash of a line running off the box — and
 * re-measured through a ResizeObserver so a rotation or a window drag re-breaks
 * it. The setter ignores sub-pixel jitter so an observer callback can't spin.
 */
export function useTextColumn(scale: number): {
  /** Attach to the column element: `<div ref={ref}>`. */
  ref: (el: HTMLElement | null) => void;
  /** Its width in unscaled font px, or null until it has been measured. */
  fontPx: number | null;
} {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [fontPx, setFontPx] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!el) return;
    const measure = () => {
      const rootPx =
        parseFloat(getComputedStyle(document.documentElement).fontSize) ||
        REM_BASE_PX;
      const cssPerFontPx = (scale * rootPx) / REM_BASE_PX;
      const w = el.clientWidth;
      if (w > 0 && cssPerFontPx > 0) {
        const next = w / cssPerFontPx;
        setFontPx((prev) =>
          prev !== null && Math.abs(prev - next) < 0.5 ? prev : next,
        );
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [el, scale]);
  // `setEl` is stable across renders, so the callback ref never re-attaches.
  return { ref: setEl, fontPx };
}

/**
 * The `PixelText.maxWidth` (in rem) that AGREES with a measured column — i.e.
 * the cap that makes the component's own wrap a no-op over rows already flowed
 * to that column. `fallbackRem` is used until the column has a width.
 *
 * **A FLOWED ROW MUST BE HANDED THIS, NEVER A CONSTANT.** `PixelText` wraps
 * again at its own `maxWidth`, so the two widths are not independent knobs:
 *   - a constant NARROWER than the column re-breaks a fitted row and drops its
 *     last word onto a line of its own (a lone "I" under a full line);
 *   - a constant WIDER — or none at all — lets a canvas grow past its parent,
 *     and since these columns are flex items whose automatic minimum size is
 *     their content, the parent then grows to match, the observer re-measures
 *     the bigger box, and the text runs off the modal it is inside.
 * Both were shipped, in that order. Passing the column's own width closes it:
 * `PixelText` re-breaks at exactly the width the flow used, so it cannot
 * disagree, and the cap still bounds the un-measured first frame.
 *
 * The arithmetic is the inverse of the hook's: it divides the CSS width by
 * `scale × rootPx / 16` to reach font px, so multiplying back by `scale / 16`
 * returns rem — and the root-font bump cancels, because a `PixelText` canvas is
 * sized in rem and rides that bump too.
 */
export function columnCapRem(
  fontPx: number | null,
  scale: number,
  fallbackRem: number,
): number {
  if (fontPx == null || fontPx <= 0) return fallbackRem;
  return (fontPx * scale) / REM_BASE_PX;
}
