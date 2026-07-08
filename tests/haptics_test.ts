// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The generic haptics surface (@ui/lib/haptics.ts). The behaviors that
// matter: the enabled toggle and driver capability gate every buzz, the
// pattern reaches the backend faithfully, a native driver can be swapped in
// at runtime, and a throwing/absent Vibration API degrades to a silent noop
// (the iOS story — no vibrate, no crash).

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createHaptics,
  noopHapticsDriver,
  webVibrationDriver,
  type HapticPattern,
  type HapticsDriver,
} from "@ui/lib/haptics.ts";

/** A driver that records what it was asked to vibrate. */
function recordingDriver(supported = true): HapticsDriver & {
  calls: HapticPattern[];
} {
  const calls: HapticPattern[] = [];
  return { supported, calls, vibrate: (pattern) => calls.push(pattern) };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createHaptics", () => {
  it("forwards patterns to the driver when active", () => {
    const driver = recordingDriver();
    const haptics = createHaptics(driver);
    expect(haptics.active).toBe(true);
    haptics.vibrate(12);
    haptics.vibrate([45, 40, 70]);
    expect(driver.calls).toEqual([12, [45, 40, 70]]);
  });

  it("goes silent when disabled, and resumes when re-enabled", () => {
    const driver = recordingDriver();
    const haptics = createHaptics(driver);
    haptics.setEnabled(false);
    expect(haptics.active).toBe(false);
    haptics.vibrate(12);
    expect(driver.calls).toEqual([]);
    haptics.setEnabled(true);
    haptics.vibrate(20);
    expect(driver.calls).toEqual([20]);
  });

  it("never touches an unsupported driver (the iOS path)", () => {
    const driver = recordingDriver(false);
    const haptics = createHaptics(driver);
    expect(haptics.active).toBe(false);
    haptics.vibrate(12);
    expect(driver.calls).toEqual([]);
  });

  it("lets a native driver be swapped in at runtime", () => {
    const haptics = createHaptics(noopHapticsDriver());
    expect(haptics.active).toBe(false);
    const native = recordingDriver();
    haptics.setDriver(native);
    expect(haptics.active).toBe(true);
    haptics.vibrate(30);
    expect(native.calls).toEqual([30]);
  });
});

describe("webVibrationDriver", () => {
  it("is a noop driver when the Vibration API is absent (iOS)", () => {
    vi.stubGlobal("navigator", {});
    const driver = webVibrationDriver();
    expect(driver.supported).toBe(false);
    // Must not throw.
    driver.vibrate(10);
  });

  it("calls navigator.vibrate with a mutable copy of an array pattern", () => {
    const vibrate = vi.fn((pattern: number | number[]) => pattern != null);
    vi.stubGlobal("navigator", { vibrate });
    const driver = webVibrationDriver();
    expect(driver.supported).toBe(true);
    const pattern = Object.freeze([45, 40, 70]);
    driver.vibrate(pattern);
    driver.vibrate(15);
    expect(vibrate).toHaveBeenNthCalledWith(1, [45, 40, 70]);
    // A frozen source array must not be handed straight to the API.
    const firstArg = vibrate.mock.calls[0]?.[0];
    expect(firstArg).not.toBe(pattern);
    expect(vibrate).toHaveBeenNthCalledWith(2, 15);
  });

  it("swallows a throwing Vibration API", () => {
    const vibrate = vi.fn(() => {
      throw new Error("blocked by feature policy");
    });
    vi.stubGlobal("navigator", { vibrate });
    const driver = webVibrationDriver();
    expect(() => driver.vibrate(10)).not.toThrow();
  });
});
