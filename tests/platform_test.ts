// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The vibration-capability probe (pwa/src/app/platform.ts): canVibrate is
// true ONLY where a buzz can actually land — a touch-primary device whose
// browser exposes the Vibration API (Android browser or PWA), or the native
// shell (Taptic bridge) — and false on desktop (API present, no motor) and all
// of iOS (no API). This is what gates the VIBRATION setting row.

import { afterEach, describe, expect, it, vi } from "vitest";

import { canVibrate } from "../pwa/src/app/platform.ts";

/** Stub `navigator` and `window` so the probe reads a chosen environment. */
function stubEnv(opts: {
  userAgent?: string;
  hasVibrate?: boolean;
  pointerCoarse?: boolean;
  native?: boolean;
}): void {
  vi.stubGlobal("navigator", {
    userAgent: opts.userAgent ?? "",
    vibrate: opts.hasVibrate ? () => true : undefined,
  });
  vi.stubGlobal("window", {
    __GIS_NATIVE__: opts.native ? true : undefined,
    matchMedia: (query: string) => ({
      matches:
        query === "(pointer: coarse)" ? Boolean(opts.pointerCoarse) : false,
    }),
  });
}

const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120";
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("canVibrate", () => {
  it("is true on Android in a browser tab (API + touch primary)", () => {
    stubEnv({ userAgent: ANDROID_UA, hasVibrate: true, pointerCoarse: true });
    expect(canVibrate()).toBe(true);
  });

  it("is true on an installed Android PWA (same capability)", () => {
    // Install state doesn't matter — the motor + API do.
    stubEnv({ userAgent: ANDROID_UA, hasVibrate: true, pointerCoarse: true });
    expect(canVibrate()).toBe(true);
  });

  it("is true inside the native shell, regardless of the web API", () => {
    stubEnv({ userAgent: IPHONE_UA, hasVibrate: false, native: true });
    expect(canVibrate()).toBe(true);
  });

  it("is false on iOS Safari (no Vibration API)", () => {
    stubEnv({ userAgent: IPHONE_UA, hasVibrate: false, pointerCoarse: true });
    expect(canVibrate()).toBe(false);
  });

  it("is false on an installed iOS PWA (still no API)", () => {
    stubEnv({ userAgent: IPHONE_UA, hasVibrate: false, pointerCoarse: true });
    expect(canVibrate()).toBe(false);
  });

  it("is false on desktop Chrome (API present, but no motor / fine pointer)", () => {
    stubEnv({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120",
      hasVibrate: true,
      pointerCoarse: false,
    });
    expect(canVibrate()).toBe(false);
  });

  it("is false on a desktop touchscreen laptop (fine primary pointer)", () => {
    // A touch-capable laptop still reports a fine PRIMARY pointer and has no
    // vibration motor, so it stays excluded.
    stubEnv({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120",
      hasVibrate: true,
      pointerCoarse: false,
    });
    expect(canVibrate()).toBe(false);
  });
});
