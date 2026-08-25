// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// HOW WIDE A PIXEL-TEXT BLOCK MAY GET — a share of the viewport, in the rem
// `PixelText.maxWidth` speaks.
//
// A PixelText canvas is sized in rem, so a FIXED `maxWidth` is a fixed share of
// the ROOT FONT SIZE and no share at all of the screen. Every UI scale tier
// (styles.css bumps the root to 200% and then 300%) therefore multiplies the
// block's real width while the screen it has to fit inside does not follow, and
// a caption that sat neatly inside a phone runs off both edges of a tablet. The
// same trap in reverse is a narrow portrait phone, where a generous cap is
// already wider than the device before any tier applies.
//
// So the cap is MEASURED rather than authored: a share of the live viewport,
// divided by the root font size the browser is actually using, which is the CSS
// itself rather than a copy of its breakpoints. The caller's `max` is the
// ceiling for a wide screen, where a line running wall to wall reads as a block
// of text rather than as one caption.

import { useEffect, useState } from "react";

/** CSS px per rem at the default root font-size — PixelText's own rem base and
 * the fallback for a document that cannot be measured (a test renderer). */
const REM_BASE_PX = 16;

function rootFontPx(): number {
  const size = Number.parseFloat(
    getComputedStyle(document.documentElement).fontSize,
  );
  return Number.isFinite(size) && size > 0 ? size : REM_BASE_PX;
}

function wrapRem(share: number, max: number): number {
  return Math.min(max, (share * window.innerWidth) / rootFontPx());
}

/**
 * A wrap width for `PixelText.maxWidth`: `share` of the viewport (0–1), never
 * more than `max` rem. Re-measured on resize, which is also what catches a
 * phone being turned over and a UI tier being crossed.
 */
export function usePixelWrapRem(share: number, max: number): number {
  const [rem, setRem] = useState(() => wrapRem(share, max));
  useEffect(() => {
    const onResize = () => setRem(wrapRem(share, max));
    onResize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, [share, max]);
  return rem;
}
