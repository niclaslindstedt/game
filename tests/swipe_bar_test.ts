// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SWIPE BARS GEOMETRY (game-screen/swipe-bar.ts) — the pure half of the
// edge-swipe reveal. Two promises are pinned: an inward pull is measured off
// its OWN edge (a drift along the edge never counts), and the bar opens where
// the swipe asked unless it would hang off the screen — the whole feature is
// "the bar comes to the thumb", so the clamp must be the only correction.

import { describe, expect, it } from "vitest";

import {
  clampBarCenter,
  inwardTravel,
  SWIPE_BAR_MARGIN_PX,
  SWIPE_OPEN_PX,
  SWIPE_ZONE_PX,
} from "../pwa/src/game/game-screen/swipe-bar.ts";

describe("inwardTravel", () => {
  it("measures the pull off each edge's own axis", () => {
    const start = { x: 10, y: 200 };
    expect(inwardTravel("left", start, { x: 50, y: 200 })).toBe(40);
    expect(inwardTravel("right", { x: 830, y: 200 }, { x: 790, y: 200 })).toBe(
      40,
    );
    expect(inwardTravel("bottom", { x: 400, y: 380 }, { x: 400, y: 340 })).toBe(
      40,
    );
  });

  it("ignores drift along the edge", () => {
    // A thumb pulling in off the left rim wanders up or down as it goes; only
    // the inward component decides whether the gesture meant it.
    const start = { x: 10, y: 200 };
    expect(inwardTravel("left", start, { x: 10 + SWIPE_OPEN_PX, y: 320 })).toBe(
      SWIPE_OPEN_PX,
    );
  });

  it("reads a pull the wrong way as negative", () => {
    expect(inwardTravel("bottom", { x: 400, y: 380 }, { x: 400, y: 390 })).toBe(
      -10,
    );
  });

  it("commits only past the strip's own width", () => {
    // The threshold must out-reach the strip, or a touch that never left the
    // rim could pop the bar.
    expect(SWIPE_OPEN_PX).toBeGreaterThan(SWIPE_ZONE_PX);
  });
});

describe("clampBarCenter", () => {
  // The reference landscape phone: a 390px-tall viewport, a bar ~180px long.
  const SPAN = 390;
  const SIZE = 180;

  it("honors the swipe's own coordinate when the bar fits", () => {
    // A swipe at 70% height opens the bar centred at 70% height — the ask in
    // the feature request, verbatim.
    expect(clampBarCenter(0.7 * SPAN, SIZE, SPAN)).toBe(0.7 * SPAN);
  });

  it("pulls a bar back on screen at either extreme", () => {
    const half = SIZE / 2;
    expect(clampBarCenter(0, SIZE, SPAN)).toBe(SWIPE_BAR_MARGIN_PX + half);
    expect(clampBarCenter(SPAN, SIZE, SPAN)).toBe(
      SPAN - SWIPE_BAR_MARGIN_PX - half,
    );
  });

  it("parks a bar too long for the span in the middle", () => {
    expect(clampBarCenter(10, 500, SPAN)).toBe(SPAN / 2);
  });
});
