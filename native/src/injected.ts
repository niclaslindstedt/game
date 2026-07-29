// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// JavaScript injected into the game WebView. Three jobs, all invisible to the
// game's own code:
//
//  0. POLICY_BOOT — the device content switches (device-settings.ts), stamped
//     onto the page before it loads. Injected rather than messaged because the
//     game gates what it DRAWS on them: a policy that arrived a round trip late
//     would flash a hidden STORE row, or bleed on the first blow of a run a
//     parent turned the blood off for.
//
//  1. HAPTICS_BRIDGE — the reason the app exists on iOS. iOS WKWebView never
//     exposes `navigator.vibrate`, so the game's web haptics driver
//     (pwa/src/lib/haptics.ts `webVibrationDriver`) silently no-ops there.
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
    // Mark the page as running inside the native shell BEFORE the game boots,
    // so the web app can tell it apart from a browser/PWA on the very first
    // render. It uses this to disable the whole PWA update lifecycle (service
    // worker + "a new version is ready" toast): the app bundles the game and
    // ships updates through the store, so players update by downloading a new
    // build, never by an in-page reload (pwa/src/app/native.ts).
    try { window.__GIS_NATIVE__ = true; } catch (e) {}
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

/**
 * The device content switches, as a script to run BEFORE the game's own (see
 * job 0 above). Composed with HAPTICS_BRIDGE into
 * `injectedJavaScriptBeforeContentLoaded`, so `window.__GIS_POLICY__` is already
 * there when the game's first module reads it (pwa/src/app/device-policy.ts).
 *
 * `policy` is stringified rather than templated field by field so adding a third
 * switch needs no change here. Ends in `true;` like its siblings.
 */
export function policyBootScript(policy: {
  nsfw: boolean;
  store: boolean;
}): string {
  // Only ever booleans from the native module, so JSON.stringify cannot produce
  // anything that needs escaping here (contrast the event injector in App.tsx,
  // which carries player-supplied strings).
  return `(function () {
  try { window.__GIS_POLICY__ = ${JSON.stringify(policy)}; } catch (e) {}
  true;
})();`;
}

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
