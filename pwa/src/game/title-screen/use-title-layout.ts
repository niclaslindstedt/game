// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The title screen's layout probes: the compact/wide viewport flags that pick
// the logo scale and blurb wrap, and the overflow measurement that decides
// whether a tall row list (levels, BALANCE, seed) must cap and scroll.

import { useEffect, useLayoutEffect, useState, type RefObject } from "react";

import { uiScaleFor } from "../render.ts";
import type { MenuEntry } from "./menu-model.ts";

// Landscape phones are short and portrait ones narrow: pick a logo scale
// that keeps the title logo plus the menu inside both. `wide` gates the
// big desktop logo (scale 10, ~510 CSS px), so it must track the 2×
// root-font regime (UI_SCALE_BREAKPOINT_PX): past that breakpoint the logo
// renders at ~1020 *physical* px, so the width gate doubles too. A plain
// (min-width: 760px) media query counted an iPad portrait (820×1180) as
// wide and clipped the title off both screen edges.
const isCompact = () => window.innerHeight <= 480;
const isWide = () => {
  const { innerWidth: w, innerHeight: h } = window;
  return w >= (uiScaleFor(w, h) === 2 ? 1080 : 760);
};

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
