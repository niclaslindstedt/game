// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Where the app is running — enough to tell an installed iOS home-screen PWA
// apart from iOS Safari, the native store wrapper, and every non-iOS platform.
//
// The one caller today is the VIBRATION setting. An iOS PWA is the single
// context that can NEVER buzz: iOS exposes no Vibration API, and — unlike the
// native shell (app/src/injected.ts) which polyfills `navigator.vibrate` onto a
// Taptic bridge — a home-screen PWA has nothing to forward to. So the toggle is
// hidden there rather than shown as a dead switch. Plain feature detection
// can't draw this line (iOS Safari lacks `navigator.vibrate` too, yet we still
// surface the row there), so this is a deliberate, narrow platform check.

import { isNativeApp } from "./native.ts";

/** True on an Apple touch device (iPhone/iPod/iPad), including iPadOS 13+,
 * which masquerades as a Mac in its user agent but reports multiple touch
 * points where a real Mac reports none. */
function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent ?? "";
  if (/iP(hone|od|ad)/.test(ua)) return true;
  return (
    navigator.platform === "MacIntel" &&
    typeof navigator.maxTouchPoints === "number" &&
    navigator.maxTouchPoints > 1
  );
}

/** True when the game runs as an installed iOS home-screen PWA (launched in
 * standalone display mode from the Home Screen), and NOT inside the native
 * shell (which polyfills vibration). False in iOS Safari, in any desktop or
 * Android browser, and on every non-iOS platform. */
export function isIosPwa(): boolean {
  if (typeof window === "undefined") return false;
  if (isNativeApp()) return false;
  if (!isIosDevice()) return false;
  // `navigator.standalone` is the iOS-only home-screen flag; the display-mode
  // media query is the standards-track equivalent. Either marks an installed
  // launch rather than a Safari tab.
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    (typeof window.matchMedia === "function" &&
      window.matchMedia("(display-mode: standalone)").matches)
  );
}
