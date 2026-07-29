// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Detects a STORE SHELL — a build that wraps the site and ships through a
// storefront rather than over the web. Two exist: the Expo WebView (`native/`,
// App Store / Play Store) and the Electron desktop app (`electron/`, Steam).
// Each sets `window.__GIS_NATIVE__ = true` before the game's scripts run
// (native/src/injected.ts `HAPTICS_BRIDGE`; electron/src/preload.ts), so this
// reads true from the very first render inside either app and false in every
// browser/PWA context.
//
// What the flag MEANS is "the game is bundled here and updates through a
// store", which is why both shells set it: it is what turns the PWA update
// lifecycle off, and that reasoning is about how the build is delivered, not
// about React Native. To ask WHICH shell — a question about platform features,
// like whether coins are sold here — use `shellPlatform()` (./shell-bridge.ts).
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

/** True when running inside a store shell (the Expo WebView or the Electron
 * desktop app), false in a browser or installed PWA. */
export function isNativeApp(): boolean {
  return typeof window !== "undefined" && window.__GIS_NATIVE__ === true;
}
