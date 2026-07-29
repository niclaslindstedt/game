// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The UI scale tiers, and the thing they exist to control: HOW MUCH OF THE MAP
// a screen shows.
//
// The zoom tiers look like a legibility knob and are really a balance one. The
// view rect is the viewport divided by the zoom, so without tiers a bigger
// monitor simply sees further — and in a game about being surrounded, seeing
// further is an advantage, not a preference. These tests pin the tiers AND the
// visible-area consequence, because the second is the reason for the first and
// is what silently regresses when someone retunes a breakpoint.

import { describe, expect, it } from "vitest";

import {
  uiScaleFor,
  UI_SCALE_BREAKPOINT_PX,
  UI_SCALE_3X_BREAKPOINT_PX,
  VIEW_SCALE,
} from "../pwa/src/game/render/view.ts";

/** World units visible at a viewport — the number the tiers exist to hold
 * roughly constant. */
function visibleArea(width: number, height: number): number {
  const scale = VIEW_SCALE * uiScaleFor(width, height);
  return (width / scale) * (height / scale);
}

/** The reference device from AGENTS.md: a phone held sideways. Everything the
 * game is tuned against is tuned at this. */
const PHONE = { width: 844, height: 390 };
const PHONE_AREA = visibleArea(PHONE.width, PHONE.height);

describe("uiScaleFor — the tiers", () => {
  it("keeps the phone baseline at 1×", () => {
    expect(uiScaleFor(PHONE.width, PHONE.height)).toBe(1);
    // Portrait too — the gate is on the SHORTER axis, so orientation alone
    // never changes the tier.
    expect(uiScaleFor(PHONE.height, PHONE.width)).toBe(1);
  });

  it("gates on the shorter axis, not on width", () => {
    // A very wide but short window is still a phone-shaped view of the world.
    expect(uiScaleFor(3440, 400)).toBe(1);
    expect(uiScaleFor(2000, 699)).toBe(1);
  });

  it("steps to 2× exactly at the breakpoint", () => {
    const b = UI_SCALE_BREAKPOINT_PX;
    expect(uiScaleFor(b - 1, b)).toBe(1);
    expect(uiScaleFor(b, b)).toBe(2);
  });

  it("steps to 3× exactly at the second breakpoint", () => {
    const b = UI_SCALE_3X_BREAKPOINT_PX;
    expect(uiScaleFor(b - 1, b)).toBe(2);
    expect(uiScaleFor(b, b)).toBe(3);
  });

  it("keeps every tier an integer", () => {
    // `VIEW_SCALE × uiScale` is the sprite upscale factor; a fractional one
    // resamples pixel art into mush.
    for (const [w, h] of [
      [844, 390],
      [1440, 900],
      [1920, 1080],
      [2560, 1440],
      [3840, 2160],
    ]) {
      expect(Number.isInteger(VIEW_SCALE * uiScaleFor(w!, h!))).toBe(true);
    }
  });
});

describe("uiScaleFor — how much moon a screen sees", () => {
  // The rule from AGENTS.md: a desktop never sees LESS than the phone. Being
  // zoomed in past the reference device would be its own balance problem.
  const NEVER_LESS = 0.95;

  it.each([
    ["laptop", 1440, 900],
    ["1080p", 1920, 1080],
    ["1440p", 2560, 1440],
    ["ultrawide", 3440, 1440],
    ["4K", 3840, 2160],
  ])("%s never sees less of the map than the phone", (_name, w, h) => {
    expect(visibleArea(w, h)).toBeGreaterThan(PHONE_AREA * NEVER_LESS);
  });

  it("stops a 1440p monitor from seeing nearly three times the phone's map", () => {
    // This is the regression the 3× tier exists to prevent: at the 2× tier a
    // 2560×1440 screen saw ~2.8× the phone's world area.
    const ratio = visibleArea(2560, 1440) / PHONE_AREA;
    expect(ratio).toBeLessThan(1.5);
  });

  it("keeps an ultrawide within reason", () => {
    expect(visibleArea(3440, 1440) / PHONE_AREA).toBeLessThan(2);
  });

  it("documents that 4K is still the largest view", () => {
    // The 3× tier helps 4K a lot — it was 6.3× the phone at the 2× tier — but
    // 2.8× is still the widest view any supported display gets. This is a
    // MARKER, not a verdict: if a fourth tier is ever added the number drops
    // and this test says so rather than quietly agreeing with the change.
    const ratio = visibleArea(3840, 2160) / PHONE_AREA;
    expect(ratio).toBeGreaterThan(2);
    expect(ratio).toBeLessThan(3);
  });

  it("is not monotonic across tiers, and that is expected", () => {
    // 1080p sits at the top of the 2× tier (1.57×) while 1440p sits near the
    // bottom of the 3× tier (1.24×), so the SMALLER monitor sees slightly more.
    // Discrete tiers cannot avoid this without a fractional zoom, which would
    // resample the pixel art. Pinned so the oddity is a known one.
    expect(visibleArea(1920, 1080)).toBeGreaterThan(visibleArea(2560, 1440));
  });
});
