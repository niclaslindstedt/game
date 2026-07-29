// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Where the desktop shell points itself, and which Steam app it is.
//
// The peer of native/src/config.ts. By default the app is self-contained: it
// serves the website copied inside it (`webroot/`, a gitignored build artifact
// from scripts/bundle-web.mjs) over a private scheme, so the game runs
// on-device and offline and updates only when a new build ships to Steam.
//
// A build-time override, GIS_GAME_URL, points the window at a remote URL
// instead (e.g. the `/preview/` deploy slot, for debugging against live
// content). When set, the bundled webroot is skipped entirely.

/** A remote URL to load instead of the bundled site, or undefined to serve the
 * copy inside the app. */
export const REMOTE_GAME_URL: string | undefined =
  process.env.GIS_GAME_URL || undefined;

/**
 * The private scheme the bundled site is served from.
 *
 * NOT `file://`: the site is built with `base: "/"`, so its absolute asset
 * paths and ES-module imports need a real origin to resolve against, and a
 * `file://` page is treated as an opaque origin — which would leave
 * `localStorage` unable to persist the player's roster between launches. A
 * registered standard scheme gives one stable origin (`game://app`) that the
 * saves are keyed to for the life of the install.
 */
export const APP_SCHEME = "game";

/** The origin the bundled site loads from. Stable across updates — the saves
 * are keyed to it, so changing it would orphan every existing roster. */
export const APP_ORIGIN = `${APP_SCHEME}://app`;

/**
 * The Steam application id.
 *
 * 480 is Spacewar, Valve's public test app: it lets the whole Steamworks path
 * — overlay, cloud, achievements — be exercised locally before the real app id
 * exists (Steam Direct is a paid registration, so the id genuinely does not
 * exist until the storefront work is done). Ship-blocking on purpose: a store
 * build must set GIS_STEAM_APP_ID, and `isPlaceholderAppId` is what the build
 * script and the shell check so a 480 build cannot be shipped by accident.
 */
export const STEAM_APP_ID: number = Number(
  process.env.GIS_STEAM_APP_ID ?? 480,
);

/** Valve's Spacewar test app id — usable for development, never for release. */
export const SPACEWAR_APP_ID = 480;

/** True when the shell is running against the shared test app rather than our
 * own — a development build. */
export function isPlaceholderAppId(appId: number = STEAM_APP_ID): boolean {
  return appId === SPACEWAR_APP_ID;
}

/**
 * Whether to talk to Steam at all. Off lets the desktop app be run and
 * debugged without the Steam client (`init` throws when Steam isn't running),
 * which is how most local work on the shell happens.
 */
export const STEAM_ENABLED = process.env.GIS_STEAM !== "off";

/** The dark brand background (game.config.json theme_color). It paints the
 * window behind the page so no white flash shows through while it loads. */
export const BRAND_BG = "#0b0d10";
