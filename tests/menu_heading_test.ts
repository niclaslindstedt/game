// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SUB-SCREEN HEADER'S WIDTH MATH — `heading-fit.ts`, the font-free leaf
// that decides where the breadcrumb breaks and how big the page title may be
// drawn beside what is left (`MenuHeading.tsx` only draws what it decides).
//
// It is worth its own suite because the failure it prevents is a LAYOUT one and
// therefore invisible to every other test in the tree: a header four screens
// deep (SETTINGS » DEVELOPER » PLAYGROUND » MINIGAMES) is wider than a portrait
// phone before the title is drawn at all, and an unbreakable trail simply ran
// off both edges with the leaf's own name clipped in half.
//
// `crumbTail` is the half that has to agree with the BROWSER: it walks the
// crumbs the way `flex-wrap` walks them, so the title's fitted scale is
// measured against the line the layout is actually about to produce. The
// numbers below are plain CSS px — the units MenuHeading measures in.

import { describe, expect, it } from "vitest";

import {
  crumbTail,
  fitScale,
  trailCrumbs,
} from "../pwa/src/game/title-screen/heading-fit.ts";

describe("trailCrumbs", () => {
  it("keeps a separator on every crumb, so a wrapped line ends on it", () => {
    // The path still reads as "and then" across the break, rather than a line
    // opening with a stray guillemet.
    expect(trailCrumbs("SETTINGS » DEVELOPER » PLAYGROUND")).toEqual([
      "SETTINGS »",
      "DEVELOPER »",
      "PLAYGROUND »",
    ]);
  });

  it("has nothing to draw for a screen one step from the front door", () => {
    // `trailFor` leaves the breadcrumb undefined when the only ancestor is the
    // root, whose logo IS the header.
    expect(trailCrumbs(undefined)).toEqual([]);
    expect(trailCrumbs("")).toEqual([]);
  });

  it("leaves a single crumb whole", () => {
    expect(trailCrumbs("SETTINGS")).toEqual(["SETTINGS »"]);
  });
});

describe("crumbTail", () => {
  const GAP = 5;

  it("reports the one line's width when every crumb fits on it", () => {
    // 40 + 5 + 60 = 105 used, plus the gap that separates the path from the
    // title: the title is fitted against 200 - 110.
    expect(crumbTail([40, 60], GAP, 200, 20)).toBe(110);
  });

  it("measures only the LAST line once the crumbs have wrapped", () => {
    // 80 + 5 + 80 = 165 fits; adding the third would make 250, so it starts a
    // fresh line carrying its own width — which is the only line the title can
    // land beside.
    expect(crumbTail([80, 80, 60], GAP, 200, 20)).toBe(65);
  });

  it("gives the title the whole line when what is left cannot hold it", () => {
    // 0 is the signal that the title starts a line of its own, which is what
    // lets a leaf pushed onto a fresh line be drawn LARGE instead of stranded
    // at the floor scale.
    expect(crumbTail([180], GAP, 200, 40)).toBe(0);
  });

  it("gives the title the whole line when there is no trail at all", () => {
    expect(crumbTail([], GAP, 200, 40)).toBe(0);
  });

  it("does not let one over-wide crumb steal the line from the title", () => {
    // A crumb wider than the budget cannot be broken any further, so it holds
    // its line alone and the title takes the next one.
    expect(crumbTail([260], GAP, 200, 20)).toBe(0);
  });
});

describe("fitScale", () => {
  // Widths below are unscaled font pixels — what `PixelFont.measure` returns.
  // At uiScale 1 the drawn width is that many CSS px per step of scale, so a
  // 1000 px viewport carries an 840 px budget: a 100-wide title fits at 5x
  // (500) but not at 9x.

  it("takes the biggest step the budget holds", () => {
    expect(fitScale(100, 0, 1000, 1)).toBe(5);
    expect(fitScale(200, 0, 1000, 1)).toBe(4);
    expect(fitScale(280, 0, 1000, 1)).toBe(3);
  });

  it("charges the trail's width against the title's budget", () => {
    // The same title, given 500 px of path to sit beside: 840 - 500 = 340, so
    // 100 wide can only take 3x.
    expect(fitScale(100, 500, 1000, 1)).toBe(3);
  });

  it("never falls below the floor, however little room is left", () => {
    // A heading that cannot fit at all is still drawn as a heading rather than
    // shrunk into the rows' own text — which is what makes the WRAP, not a
    // smaller title, the answer to an overrunning header.
    expect(fitScale(400, 900, 1000, 1)).toBe(3);
  });

  it("holds one budget across the 2x root-font regime", () => {
    // Past UI_SCALE_BREAKPOINT_PX everything is drawn twice as wide, and the
    // viewport is wider to match: the fitted step is the same one.
    expect(fitScale(100, 0, 2000, 2)).toBe(fitScale(100, 0, 1000, 1));
  });

  it("honours the caller's own ceiling", () => {
    // The compact (landscape phone) header caps a step lower, and the studio
    // card borrows the fit with a bigger one.
    expect(fitScale(100, 0, 1000, 1, 4)).toBe(4);
    expect(fitScale(100, 0, 1000, 1, 8)).toBe(8);
  });
});
