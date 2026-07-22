// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Where the app is running — enough to know whether this device can actually
// produce vibration feedback, which is the one thing the VIBRATION setting
// needs to decide whether to show its toggle at all.
//
// The web Vibration API only does something on a device with a real motor: a
// phone or tablet. Android (Chrome, Firefox, Edge, Samsung Internet…) supports
// it in both a browser tab and an installed PWA; iOS exposes no Vibration API
// anywhere (Safari or PWA). Desktop Chrome/Firefox *expose* `navigator.vibrate`
// but have no motor, so a call is a silent no-op — the API's presence alone is
// not enough. So "can this buzz?" is a real motor AND a working API: a
// touch-primary device whose browser has the Vibration API, or the native shell
// (native/src/injected.ts), which polyfills `navigator.vibrate` onto a Taptic
// bridge. Everywhere else the toggle would be a dead switch, so it's hidden.

import { isNativeApp } from "./native.ts";

/** True on a touch-primary device — a phone or tablet whose main pointer is
 * touch, where a vibration motor lives. Mirrors settings.ts' `touchFirst`
 * probe: a desktop (even a touchscreen laptop) reports a fine primary pointer
 * and is excluded, since it has the API but no motor. */
function isTouchPrimary(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches
  );
}

/** True when this device can actually produce vibration feedback: the native
 * shell (Taptic bridge), or a touch-primary device whose browser exposes the
 * Vibration API. False on desktop (API present, no motor) and on all of iOS
 * (no API) — the contexts where the VIBRATION toggle would do nothing.
 *
 * This mirrors the web haptics driver's own feature detection
 * (pwa/src/lib/haptics.ts `webVibrationDriver`) — the driver decides
 * whether a buzz fires; this decides whether the setting is worth offering. */
export function canVibrate(): boolean {
  if (isNativeApp()) return true;
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & {
    vibrate?: (pattern: number | number[]) => boolean;
  };
  if (typeof nav.vibrate !== "function") return false;
  return isTouchPrimary();
}
