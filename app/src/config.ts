// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Where the native shell points its WebView. By default the app is
// self-contained: it serves the website bundled inside the app over a local
// HTTP server (src/localServer.ts), so the game runs on-device and offline and
// updates only when a new build ships to the store.
//
// A build-time override, EXPO_PUBLIC_GAME_URL, points the WebView at a remote
// URL instead (e.g. the `/preview/` deploy slot for debugging against live
// content). When set, the local server is skipped entirely.

import Constants from "expo-constants";

const extra = (Constants.expoConfig?.extra ?? {}) as { gameUrl?: string };

/** A remote URL to load instead of the bundled site, or undefined to serve the
 * bundle locally. Priority: build-time env override → app.config
 * `extra.gameUrl` (unset by default). */
export const REMOTE_GAME_URL: string | undefined =
  process.env.EXPO_PUBLIC_GAME_URL ?? extra.gameUrl;

/** The dark brand background (game.config.json theme_color / color-scheme). It
 * paints the shell behind the WebView so no white flash shows through while the
 * page loads or during safe-area insets. */
export const BRAND_BG = "#0b0d10";
