// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Where the native shell points its WebView. The app is a thin wrapper whose
// entire content IS the deployed website — so it looks and plays exactly like
// the PWA — with the game's URL sourced from the identity config
// (game.config.json → app.config.js `extra.gameUrl`).
//
// Override at build time with EXPO_PUBLIC_GAME_URL (e.g. to point a preview
// build at the `/preview/` slot) without touching code.

import Constants from "expo-constants";

const extra = (Constants.expoConfig?.extra ?? {}) as { gameUrl?: string };

/** The URL the WebView loads. Priority: build-time env override → app.config
 * `extra.gameUrl` → the production site as a last-resort default. */
export const GAME_URL: string =
  process.env.EXPO_PUBLIC_GAME_URL ??
  extra.gameUrl ??
  "https://game.niclaslindstedt.se";

/** The origin of {@link GAME_URL}, used to tell in-app navigation (stay in the
 * WebView) from outbound links (hand off to the system browser). */
export const GAME_ORIGIN: string = (() => {
  try {
    return new URL(GAME_URL).origin;
  } catch {
    return "https://game.niclaslindstedt.se";
  }
})();

/** The dark brand background (game.config.json theme_color / color-scheme). It
 * paints the shell behind the WebView so no white flash shows through while the
 * page loads or during safe-area insets. */
export const BRAND_BG = "#0b0d10";
