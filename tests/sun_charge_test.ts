// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TAP LADDER — the first movement of the hidden developer gesture
// (pwa/src/game/title-screen/use-sun-charge.ts).
//
// What is pinned here is the promise the build-up makes to a player who is NOT
// looking for it: a run of fast taps on the title sun buys absolutely nothing
// until the eleventh, and only from there does the star start to answer. The
// ramp itself is `sunChargeIntensity` — the one 0..1 number every charge layer,
// the charge sound and the haptic read — so stating it here states all of them
// at once.

import { describe, expect, it } from "vitest";

import {
  SUN_SILENT_TAPS,
  SUN_TAPS,
  sunChargeIntensity,
} from "../pwa/src/game/title-screen/use-sun-charge.ts";

describe("the silent taps", () => {
  it("keeps the sun at zero for the first ten taps", () => {
    expect(SUN_SILENT_TAPS).toBe(10);
    for (let tap = 0; tap <= SUN_SILENT_TAPS; tap++) {
      expect(sunChargeIntensity(tap)).toBe(0);
    }
  });

  it("first reacts on the eleventh tap, and only faintly", () => {
    const first = sunChargeIntensity(SUN_SILENT_TAPS + 1);
    expect(first).toBeGreaterThan(0);
    // Below every layer's own threshold but the glare's (see styles.css) and
    // below the charge sound's 0.3 floor — a whisper, not a tell.
    expect(first).toBeCloseTo(0.2, 6);
  });
});

describe("the build-up above them", () => {
  it("climbs to full fury on the tap before the race arms", () => {
    expect(sunChargeIntensity(SUN_TAPS - 1)).toBe(1);
    // Five rungs of build-up sit above the silent ten.
    expect(SUN_TAPS - 1 - SUN_SILENT_TAPS).toBe(5);
  });

  it("never goes backwards, and never past the top", () => {
    let prev = -1;
    for (let tap = 0; tap <= SUN_TAPS + 4; tap++) {
      const t = sunChargeIntensity(tap);
      expect(t).toBeGreaterThanOrEqual(prev);
      expect(t).toBeLessThanOrEqual(1);
      prev = t;
    }
  });
});
