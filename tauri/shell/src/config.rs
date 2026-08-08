// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! Where the desktop shell points itself — the peer of `electron/src/config.ts`.
//!
//! By default the app is self-contained: it serves the website copied inside it
//! (`webroot/`, a gitignored build artifact from `scripts/bundle-web.mjs`) over
//! a private scheme, so the game runs on-device and offline and updates only
//! when a new build ships.
//!
//! A launch-time override, `GIS_GAME_URL`, points the window at a remote URL
//! instead (e.g. the `/preview/` deploy slot, for debugging against live
//! content). When set, the bundled webroot is skipped entirely.

/// The private scheme the bundled site is served from.
///
/// NOT `file://`: the site is built with `base: "/"`, so its absolute asset
/// paths and ES-module imports need a real origin to resolve against, and a
/// `file://` page is treated as an opaque origin — which would leave
/// `localStorage` unable to persist the player's roster between launches. A
/// registered scheme gives one stable origin that the saves are keyed to for
/// the life of the install.
pub const APP_SCHEME: &str = "game";

/// The host the bundled site is served under.
///
/// `localhost` rather than Electron's `app`, and that is a platform fact rather
/// than a preference: WebView2 maps a registered scheme onto
/// `http://<scheme>.localhost`, so the host has to be one the platform will
/// accept in that shape. What matters is that it is a CONSTANT — the origin is
/// what the player's roster is keyed to, so changing this word later orphans
/// every save on the machine.
pub const APP_HOST: &str = "localhost";

/// The page inside the bundle that the window opens on.
pub const APP_ENTRY: &str = "index.html";

/// The dark brand background (`game.config.json`'s theme colour). It paints the
/// window behind the page so no white flash shows through while it loads.
pub const BRAND_BG: &str = "#0b0d10";

/// What the window is called before the page has said otherwise.
pub const WINDOW_TITLE: &str = "Ada's Trail";

/// What the title bar says a developer build is, for as long as it is open.
pub const DEVELOPER_TITLE_SUFFIX: &str = " — DEVELOPER BUILD (debugging only)";

/// A remote URL to load instead of the bundled site, or `None` to serve the
/// copy inside the app.
pub fn remote_game_url() -> Option<String> {
    std::env::var("GIS_GAME_URL")
        .ok()
        .filter(|url| !url.is_empty())
}

/// The URL the window opens, given the origin the platform actually granted the
/// registered scheme.
///
/// Passed in rather than composed here, because the two desktop webviews spell
/// it differently — `game://localhost` on macOS and Linux, `http://
/// game.localhost` on Windows — and only the app crate knows which one it got.
pub fn start_url(origin: &str) -> String {
    format!("{}/{APP_ENTRY}", origin.trim_end_matches('/'))
}

/// Is this URL somewhere the game window may navigate to itself?
///
/// The site's own pages (the library, privacy, contact) are same-origin and
/// navigate normally; anything else — the repo link, an external credit — opens
/// in the player's browser rather than replacing the game with a web page it
/// cannot leave.
pub fn is_internal_url(url: &str, origin: &str, remote: Option<&str>) -> bool {
    let origin = origin.trim_end_matches('/');
    if url == origin || url.starts_with(&format!("{origin}/")) {
        return true;
    }
    remote.is_some_and(|remote| !remote.is_empty() && url.starts_with(remote))
}

/// WHAT A BUILD NOBODY PACKAGED IS.
///
/// A binary with no packaging stamp on it was made by somebody working on the
/// game, out of their own tree — it is a debugging tool, not a copy of the game
/// to play or to hand to anybody. That is easy to forget once it is an
/// application icon like any other, so it is stated on every launch and carried
/// in the window title for as long as the window is open. The suffix is
/// deliberately not a one-time dialog: what it guards against is a build that
/// has been sitting on somebody's desktop for a month.
pub const DEVELOPER_NOTICE: &str = concat!(
    "This is a developer build of the game, built from sources rather than ",
    "packaged for release.\n\n",
    "It is for debugging the game as a developer and for no other purpose. It ",
    "is not licensed for play, for sharing, or for distribution in any form."
);

/// WHAT A PHASE-3 BUILD IS, said once per launch.
///
/// The Tauri shell is feature-complete as of phase 3 (`docs/tauri-migration.md`)
/// and is still not the shipping desktop build — that decision belongs to phase
/// 4, after the two shells have been played side by side. So the line no longer
/// lists absent features, because there is one left and it is not coming: the
/// Steam overlay cannot be injected into a platform webview
/// (`crate::steam::overlay_support`). What it says instead is which binary this
/// is and which one is the release, because that is the fact a bug report needs.
pub const MIGRATION_NOTICE: &str = concat!(
    "This is the TAURI desktop shell. It runs the whole game — Steam cloud ",
    "save, achievements, screenshots, mods, multiplayer and voice — and it is ",
    "NOT the shipping desktop build: the Electron one is, until the two have ",
    "been compared. The Steam overlay is the one thing it cannot have. ",
    "See docs/tauri-migration.md."
);
