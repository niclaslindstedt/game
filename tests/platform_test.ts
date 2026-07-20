// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The install/platform probe (website/src/app/platform.ts): isIosPwa is true
// ONLY for an installed iOS home-screen PWA — the one context that can never
// buzz — and false in iOS Safari, the native shell (which polyfills vibration),
// Android, and desktop. This is what gates the VIBRATION setting row.

import { afterEach, describe, expect, it, vi } from "vitest";

import { isIosPwa } from "../website/src/app/platform.ts";

/** Stub `navigator` and `window` so the probe reads a chosen environment. */
function stubEnv(opts: {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
  standalone?: boolean;
  displayModeStandalone?: boolean;
  native?: boolean;
}): void {
  vi.stubGlobal("navigator", {
    userAgent: opts.userAgent ?? "",
    platform: opts.platform ?? "",
    maxTouchPoints: opts.maxTouchPoints ?? 0,
    standalone: opts.standalone,
  });
  vi.stubGlobal("window", {
    __GIS_NATIVE__: opts.native ? true : undefined,
    matchMedia: (query: string) => ({
      matches:
        query === "(display-mode: standalone)"
          ? Boolean(opts.displayModeStandalone)
          : false,
    }),
  });
}

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isIosPwa", () => {
  it("is true for an installed iPhone home-screen PWA (navigator.standalone)", () => {
    stubEnv({ userAgent: IPHONE_UA, standalone: true });
    expect(isIosPwa()).toBe(true);
  });

  it("is true via the display-mode media query on iOS", () => {
    stubEnv({ userAgent: IPHONE_UA, displayModeStandalone: true });
    expect(isIosPwa()).toBe(true);
  });

  it("is true for iPadOS 13+ (masquerades as a Mac, but has touch)", () => {
    stubEnv({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)",
      platform: "MacIntel",
      maxTouchPoints: 5,
      standalone: true,
    });
    expect(isIosPwa()).toBe(true);
  });

  it("is false in iOS Safari (not installed — still shows the row)", () => {
    stubEnv({ userAgent: IPHONE_UA, standalone: false });
    expect(isIosPwa()).toBe(false);
  });

  it("is false inside the native shell, even standalone on iOS", () => {
    stubEnv({ userAgent: IPHONE_UA, standalone: true, native: true });
    expect(isIosPwa()).toBe(false);
  });

  it("is false for an installed Android PWA", () => {
    stubEnv({
      userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8)",
      displayModeStandalone: true,
    });
    expect(isIosPwa()).toBe(false);
  });

  it("is false on desktop (a real Mac has no touch points)", () => {
    stubEnv({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)",
      platform: "MacIntel",
      maxTouchPoints: 0,
      displayModeStandalone: true,
    });
    expect(isIosPwa()).toBe(false);
  });
});
