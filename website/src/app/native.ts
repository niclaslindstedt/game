// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Detects the native App Store / Play Store shell (the Expo WebView in `app/`).
// The shell injects `window.__GIS_NATIVE__ = true` before the game's scripts
// run (app/src/injected.ts, HAPTICS_BRIDGE), so this reads true from the very
// first render inside the app and false in every browser/PWA context.
//
// The app bundles the game on-device and ships updates through the store, so it
// disables the whole PWA update lifecycle: with no service worker there is no
// precache and no "a new version is ready" toast — players update by
// downloading a new build (see the `enabled` gate in App.tsx). Loading the
// remote site with the service worker off would break offline play, so this
// switch belongs with the local bundle, not a remote-loading shell.

declare global {
  interface Window {
    __GIS_NATIVE__?: boolean;
  }
}

/** True when running inside the native shell (Expo WebView), false in a
 * browser or installed PWA. */
export function isNativeApp(): boolean {
  return typeof window !== "undefined" && window.__GIS_NATIVE__ === true;
}
