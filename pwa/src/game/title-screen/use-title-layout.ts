// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The title screen's layout probes: the compact/wide viewport flags that pick
// the logo scale and blurb wrap, and the overflow measurement that decides
// whether a tall row list (levels, BALANCE, seed) must cap and scroll.

import { useEffect, useLayoutEffect, useState, type RefObject } from "react";

// Straight from the view module, NOT the `render.ts` facade: the facade pulls
// every draw pass (effects, player, enemies, hazards…) in behind it, which put
// the whole canvas renderer in the title screen's entry chunk for one scale
// helper. `render/view.ts` depends on nothing but a type.
import { uiScaleFor } from "../render/view.ts";
import type { MenuEntry } from "./menu-model.ts";

// Landscape phones are short and portrait ones narrow: pick a logo scale
// that keeps the title logo plus the menu inside both. `wide` gates the
// big desktop logo (scale 10, ~510 CSS px), so it must track the 2×
// root-font regime (UI_SCALE_BREAKPOINT_PX): past that breakpoint the logo
// renders at ~1020 *physical* px, so the width gate doubles too. A plain
// (min-width: 760px) media query counted an iPad portrait (820×1180) as
// wide and clipped the title off both screen edges.
function isCompact(): boolean {
  return window.innerHeight <= 480;
}
function isWide(): boolean {
  const { innerWidth: w, innerHeight: h } = window;
  const scale = uiScaleFor(w, h);
  // The gate tracks the scale rather than testing for one specific tier: the
  // logo's PHYSICAL width grows with the root font, so a fixed desktop number
  // would let a 3× screen think it had room for a logo half again as wide as
  // the one it measured. 540×scale reproduces the tuned 1080 at 2× exactly.
  return w >= (scale === 1 ? 760 : 540 * scale);
}

export function useViewportFlags(): { compact: boolean; wide: boolean } {
  const [compact, setCompact] = useState(isCompact);
  const [wide, setWide] = useState(isWide);
  useEffect(() => {
    const onResize = () => {
      setCompact(isCompact());
      setWide(isWide());
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, []);
  return { compact, wide };
}

/** The viewport width in CSS px and the ACTIVE UI scale (1× on a phone, 2×
 * past UI_SCALE_BREAKPOINT_PX), refreshed on resize. A PixelText line is drawn
 * at `measure(text) × scale` font pixels but SIZED in rem, so it occupies
 * `measure × scale × uiScale` CSS px — the pair a width budget for one has to
 * be measured against (see MenuHeading's `fitScale`). */
export function useViewportMetrics(): { width: number; uiScale: number } {
  const read = () => {
    const { innerWidth: w, innerHeight: h } = window;
    return { width: w, uiScale: uiScaleFor(w, h) };
  };
  const [metrics, setMetrics] = useState(read);
  useEffect(() => {
    const onResize = () => setMetrics(read());
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, []);
  return metrics;
}

/** CSS px per rem at the default root font-size — PixelText's own rem base. */
const REM_BASE_PX = 16;

/** The share of the viewport the settings tree's bottom help line may span
 * before it folds. A sentence running wall to wall reads as a block of text
 * rather than a line of help — worst on a portrait phone, where a long blurb
 * touches both screen edges — so it wraps well inside them instead. */
const HELP_WIDTH_SHARE = 0.8;

/** The help line's wrap width in rem: HELP_WIDTH_SHARE of the viewport,
 * converted through the ACTIVE root font-size, which the 2× regime past
 * UI_SCALE_BREAKPOINT_PX doubles (styles.css). PixelText sizes its canvas in
 * rem, so a rem cap is displayed at `cap × root px` — dividing by that same
 * root size holds the one share on a phone, a tablet and a desktop alike. */
function helpWrapRem(): number {
  const { innerWidth: w, innerHeight: h } = window;
  return (HELP_WIDTH_SHARE * w) / (REM_BASE_PX * uiScaleFor(w, h));
}

export function useHelpWrapRem(): number {
  const [rem, setRem] = useState(helpWrapRem);
  useEffect(() => {
    const onResize = () => setRem(helpWrapRem());
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, []);
  return rem;
}

/** Decide whether the row list overflows the room the centered column leaves
 * it. The level list only needs to scroll when it genuinely can't fit — a
 * long ladder (20+ levels) on a short viewport. With the handful of levels
 * this game ships it fits with room to spare, so an unconditional cap would
 * show a needless scrollbar (and clip the top row). Measure the list against
 * the space the column leaves it and only cap+scroll on real overflow. Runs
 * when the list or viewport changes; the measurement reads the list's full
 * natural height (`scrollHeight`, independent of any cap) and the space left
 * over after the title/heading, so it never oscillates once a cap is applied.
 * Off the tall screens (`active` false) it stays false. */
export function useMenuOverflow(
  contentRef: RefObject<HTMLDivElement | null>,
  menuRef: RefObject<HTMLElement | null>,
  active: boolean,
  entries: MenuEntry[],
): boolean {
  const [overflow, setOverflow] = useState(false);
  useLayoutEffect(() => {
    const measure = () => {
      if (!active) {
        setOverflow(false);
        return;
      }
      // The menu rows live in the .title-content scroll column — measure
      // against IT (it owns the row gap and the height cap), not the screen
      // root, whose only in-flow child is that column.
      const host = contentRef.current;
      const nav = menuRef.current;
      if (!host || !nav) return;
      const hostStyle = getComputedStyle(host);
      const gap = parseFloat(hostStyle.rowGap) || 0;
      const pad =
        (parseFloat(hostStyle.paddingTop) || 0) +
        (parseFloat(hostStyle.paddingBottom) || 0);
      let siblings = 0;
      let inFlow = 0;
      for (const child of Array.from(host.children)) {
        const el = child as HTMLElement;
        // Skip the absolutely-positioned decorative layers (stars, asteroids).
        if (getComputedStyle(el).position === "absolute") continue;
        inFlow += 1;
        if (el !== nav) siblings += el.offsetHeight;
      }
      const avail =
        host.clientHeight - pad - siblings - gap * Math.max(0, inFlow - 1);
      setOverflow(nav.scrollHeight > avail + 1);
    };
    // Measure on the next frame (not synchronously in the effect) so the pass
    // reads settled layout and React owns the resulting class toggle.
    const raf = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
    };
  }, [contentRef, menuRef, active, entries]);
  return overflow;
}
