// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// JavaScript injected into the game WebView. Two jobs, both invisible to the
// game's own code:
//
//  1. HAPTICS_BRIDGE — the reason the app exists on iOS. iOS WKWebView never
//     exposes `navigator.vibrate`, so the game's web haptics driver
//     (website/src/lib/haptics.ts `webVibrationDriver`) silently no-ops there.
//     We define `navigator.vibrate` BEFORE the game boots, so the driver's
//     feature detection (`typeof navigator.vibrate === "function"`) passes and
//     every buzz the game emits is forwarded to the native side, which fires
//     the Taptic Engine. No game code changes — it just detects support.
//
//  2. VIEWPORT_HARDENING — make the page feel like an app, not a document:
//     kill the long-press callout/selection and rubber-band scroll that a raw
//     WKWebView still allows even with the website's own viewport meta.

/** Runs via `injectedJavaScriptBeforeContentLoaded` — before the game's own
 * scripts, so `navigator.vibrate` exists by the time the haptics driver probes
 * for it. Must be an IIFE ending in `true;` (iOS requires the injected script
 * to evaluate to a primitive or it warns/aborts). */
export const HAPTICS_BRIDGE = `(function () {
  try {
    var forward = function (pattern) {
      try {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(
            JSON.stringify({ __gisHaptics: true, pattern: pattern })
          );
        }
      } catch (e) {}
      // The Vibration API returns a boolean; the game ignores it but match it.
      return true;
    };
    try {
      Object.defineProperty(navigator, "vibrate", {
        configurable: true,
        writable: true,
        value: forward,
      });
    } catch (e) {
      try {
        navigator.vibrate = forward;
      } catch (e2) {}
    }
  } catch (e) {}
  true;
})();`;

/** Runs via `injectedJavaScript` — after the document exists — to append a
 * small stylesheet that suppresses the iOS long-press callout and text
 * selection (except in inputs, so the character-name field still works) and
 * blocks overscroll bounce. Also ends in `true;`. */
export const VIEWPORT_HARDENING = `(function () {
  try {
    var css =
      "html,body{overscroll-behavior:none;touch-action:none;}" +
      "*:not(input):not(textarea){-webkit-touch-callout:none !important;" +
      "-webkit-user-select:none !important;user-select:none !important;}";
    var style = document.createElement("style");
    style.setAttribute("data-gis-app", "");
    style.appendChild(document.createTextNode(css));
    (document.head || document.documentElement).appendChild(style);
  } catch (e) {}
  true;
})();`;
