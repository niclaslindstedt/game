// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Measures the live width of a text column in the UNSCALED font pixels the
// pixel font speaks, so an overlay can re-break its authored copy to the box
// it is actually being drawn in. Every dialogue surface needs the same three
// steps — read the element's CSS width, divide out the integer text scale and
// the root font-size bump the large-screen breakpoints apply, re-measure on
// resize — so they live here once rather than once per overlay. Generic
// React/UI game code: lives in pwa/src/lib/ (imported as @ui/lib/*) so it can
// be extracted into oss-framework once mature.

import { useLayoutEffect, useState, type RefObject } from "react";

/** CSS px per rem at the default root font-size (styles.css bumps the root on
 * large screens; the hook reads the live value, this is only the reference). */
const REM_BASE_PX = 16;

/**
 * The width of `ref`'s box in unscaled font pixels — the unit `PixelFont.wrap`
 * and `measure` speak — or null until it has been measured.
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
export function useTextColumn(
  ref: RefObject<HTMLElement | null>,
  scale: number,
): number | null {
  const [fontPx, setFontPx] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
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
  }, [ref, scale]);
  return fontPx;
}
