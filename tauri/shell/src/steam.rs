// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! EVERY DECISION THE STEAM HANDSHAKE NEEDS — the peer of the top half of
//! `electron/src/steam.ts`, minus the client itself.
//!
//! The client lives in `src-tauri/src/steam.rs`, because a `steamworks::Client`
//! is a handle to a running program; what lives HERE is everything that has to
//! be decided before or around it and can therefore be tested on a machine with
//! no Steam client, no GUI and no network:
//!
//!  - which app id this build is talking to, and whether it is the placeholder;
//!  - whether to talk to Steam at all;
//!  - whether to ASK Steam to relaunch us;
//!  - whether the overlay has any chance of drawing on this webview.
//!
//! ## THE ORDER OF THE PRE-READY WORK, and why it is a decision rather than a
//! detail
//!
//! Two things must happen before the event loop, and only one of them survived
//! the move from Electron:
//!
//!  1. **`restart_app_if_necessary`** — relaunch through the Steam client if the
//!     player started the binary directly. Same call, same rule, same reason:
//!     Steam's APIs need the client, and a process that is about to be replaced
//!     must not go on to build a window. [`restart_wanted`] is the decision.
//!  2. **The overlay** — and this is the open question the migration doc names.
//!     Electron's `electronEnableSteamOverlay()` appends two CHROMIUM command
//!     line switches. There is no such call for a platform webview, because
//!     there is no such switch: see [`OverlaySupport`].
//!
//! There is a third ordering trap that is specific to the Rust binding and bites
//! silently: `Client::init_app` STAMPS `SteamAppId` and `SteamGameId` into this
//! process's own environment before handshaking. [`steam_overlay_wanted`] reads
//! exactly those variables to decide whether STEAM started us — so it must be
//! asked BEFORE the handshake, or every launch looks like a Steam launch and the
//! log says the overlay is coming when it is not.

/// Valve's Spacewar test app — usable for development, never for release.
///
/// It lets the whole Steamworks path (cloud, achievements, the handshake) be
/// exercised locally before the real app id exists, since Steam Direct is a paid
/// registration and the id genuinely does not exist until the storefront work is
/// done.
pub const SPACEWAR_APP_ID: u32 = 480;

/// How the shell reads its environment.
///
/// Handed in rather than reached for, so every decision in this module is
/// testable from a literal table. `src-tauri` passes [`process_env`].
pub type Env<'a> = &'a dyn Fn(&str) -> Option<String>;

/// The real environment, for the app crate to pass in.
pub fn process_env(name: &str) -> Option<String> {
    std::env::var(name).ok()
}

/// The Steam application id this build talks to.
///
/// Three sources, narrowest first: `GIS_STEAM_APP_ID` in the LAUNCH
/// environment (a developer pointing a checkout somewhere), then the id the
/// PACKAGER baked in, then Valve's Spacewar.
///
/// **The stamp is what makes an installed copy right**, and it is the one place
/// this shell is stricter than the Electron peer: `electron/src/config.ts` reads
/// the same variable at launch and has nowhere to bake one, so a packaged copy
/// falls back to Spacewar unless the machine's environment happens to say
/// otherwise. Here `src-tauri/src/stamp.rs` reads it with `option_env!`, so the
/// app id is a property of the binary. Ship-blocking either way:
/// [`is_placeholder_app_id`] is what the packaging script checks so a 480 build
/// cannot be shipped by accident.
pub fn steam_app_id(env: Env, stamped: Option<&str>) -> u32 {
    let read = |value: String| value.trim().parse::<u32>().ok().filter(|id| *id > 0);
    env("GIS_STEAM_APP_ID")
        .and_then(read)
        .or_else(|| stamped.map(str::to_string).and_then(read))
        .unwrap_or(SPACEWAR_APP_ID)
}

/// True when the shell is running against the shared test app rather than our
/// own — a development build.
pub fn is_placeholder_app_id(app_id: u32) -> bool {
    app_id == SPACEWAR_APP_ID
}

/// Whether to talk to Steam at all.
///
/// Off lets the desktop app be run and debugged without the Steam client (the
/// handshake fails when Steam isn't running), which is how most local work on
/// this shell happens.
pub fn steam_enabled(env: Env) -> bool {
    env("GIS_STEAM").as_deref() != Some("off")
}

/// Should this launch ask Steam to relaunch it?
///
/// Only for a REAL app id. Spacewar is shared by every developer testing against
/// it, and asking Steam to relaunch us as Spacewar would send a local run
/// somewhere surprising — it is also the one call here with a side effect on the
/// player's machine, so it is gated on the narrowest condition that can be
/// stated.
pub fn restart_wanted(enabled: bool, app_id: u32) -> bool {
    enabled && !is_placeholder_app_id(app_id)
}

/// Was this process started BY Steam?
///
/// The Steam client stamps these variables into a game's environment when it
/// launches it, so their presence is the one honest way to tell a copy started
/// from the library apart from a copy started from a checkout. `GIS_STEAM_OVERLAY=1`
/// forces the answer on for testing, `=0` forces it off — the same two escape
/// hatches the Electron shell has.
///
/// **Ask this BEFORE the handshake.** See the module header: the Rust binding
/// writes two of these three variables itself.
pub fn steam_overlay_wanted(env: Env) -> bool {
    match env("GIS_STEAM_OVERLAY").as_deref() {
        Some("1") => return true,
        Some("0") => return false,
        _ => {}
    }
    ["SteamAppId", "SteamGameId", "SteamClientLaunch"]
        .iter()
        .any(|name| env(name).is_some_and(|value| !value.is_empty()))
}

/// Which webview is showing the game, which is the same question as which
/// platform on every desktop.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Webview {
    /// Windows — Edge WebView2, a Chromium.
    WebView2,
    /// macOS — WKWebView.
    WkWebView,
    /// Linux — WebKitGTK.
    WebKitGtk,
}

/// The webview this binary was compiled for.
pub fn current_webview() -> Webview {
    if cfg!(windows) {
        Webview::WebView2
    } else if cfg!(target_os = "macos") {
        Webview::WkWebView
    } else {
        Webview::WebKitGtk
    }
}

/// WHETHER VALVE'S OVERLAY CAN DRAW OVER THIS WINDOW.
///
/// **This is the phase-2 finding the migration doc asked for, and the answer is
/// "not by anything this shell can do".** It is written down here, at the seam,
/// because this is the file somebody opens when they ask why Shift+Tab does
/// nothing over the Tauri build.
///
/// The overlay is not something a game switches on. It is a library Steam
/// injects into the process, which hooks the graphics API the game presents its
/// frames with (D3D/OpenGL/Vulkan/Metal) and draws over the swap chain. A game
/// gets it for free precisely because it owns that surface.
///
/// A webview shell does not own that surface — the webview does — and the two
/// shells differ in what follows:
///
///  - **Electron** exposes `electronEnableSteamOverlay()`, which is not a
///    request to draw anything: it appends the Chromium switches
///    `in-process-gpu` and `disable-direct-composition`, moving the GPU work
///    into the browser process and off the compositor path, which is what leaves
///    a swap chain in the process Steam has hooked. That is a CHROMIUM
///    arrangement, reached through Chromium's own command line.
///  - **A platform webview has no such command line.** WebView2 runs its GPU
///    work in a browser process this shell does not start and cannot pass
///    switches to; WKWebView composites through the system compositor; WebKitGTK
///    the same. There is no supported switch, and nothing to fake one with —
///    which is why this returns a verdict rather than a call.
///
/// So the honest answer is the one the migration doc predicted: **no overlay on
/// this shell**, on any of the three desktops, stated at the seam rather than
/// worked around. What it costs the player is Shift+Tab, the in-game browser and
/// Steam's own screenshot key — and the last of those is why
/// [`crate::screenshots_provider`] exists at all on this shell and does not on
/// Electron's.
///
/// It is a verdict per webview rather than a flat `false` because the WebView2
/// case is the one with a plausible future: it is a Chromium, and if Microsoft
/// ever exposes the additional-browser-arguments surface for the GPU process,
/// this becomes the one place that changes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OverlaySupport {
    /// The overlay cannot draw, and nothing this shell does will change that.
    Unsupported,
    /// The overlay cannot draw today, but the platform is one where it might
    /// become possible — see the note on the variant's own line.
    NotYet,
}

/// The verdict for one webview. See [`OverlaySupport`].
pub fn overlay_support(webview: Webview) -> OverlaySupport {
    match webview {
        // A Chromium we do not start and cannot pass switches to. If the
        // additional-browser-arguments surface ever reaches the GPU process,
        // this is the line that moves.
        Webview::WebView2 => OverlaySupport::NotYet,
        // Both composite through the system compositor; there is no swap chain
        // in this process for the overlay to hook, and no switch to make one.
        Webview::WkWebView | Webview::WebKitGtk => OverlaySupport::Unsupported,
    }
}

/// The line the shell logs about the overlay, once per launch.
///
/// A sentence rather than a flag, because the reader is somebody comparing the
/// two desktop builds with a log file open and wondering why Shift+Tab answers
/// on one of them.
pub fn overlay_explanation(webview: Webview, started_by_steam: bool) -> String {
    let where_ = match webview {
        Webview::WebView2 => "WebView2",
        Webview::WkWebView => "WKWebView",
        Webview::WebKitGtk => "WebKitGTK",
    };
    let prospect = match overlay_support(webview) {
        OverlaySupport::NotYet => {
            "it is a Chromium, so a future browser-argument surface could change that"
        }
        OverlaySupport::Unsupported => {
            "it composites through the system compositor, so there is no swap chain to hook"
        }
    };
    let launched = if started_by_steam {
        "Steam started this process"
    } else {
        "Steam did not start this process"
    };
    format!(
        "steam: no overlay on the Tauri shell — {launched}, and the game is drawn by {where_}, \
         where Valve's overlay cannot be injected ({prospect}). Shift+Tab and Steam's own \
         screenshot key are unavailable; the game files its own pictures instead. \
         See docs/tauri-migration.md."
    )
}

/// How the handshake went, in the words the launch log wants.
///
/// A type rather than a bool because "no Steam here" is an ORDINARY state — a
/// developer build, a machine with the client closed, `GIS_STEAM=off` — and the
/// three read very differently to somebody holding a bug report.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SteamStatus {
    /// `GIS_STEAM=off`: nobody asked for Steam.
    Disabled,
    /// Connected, as this player, to this app id.
    Connected {
        /// The signed-in player's name, or `unknown player`.
        player: String,
        /// The app id the handshake was made against.
        app_id: u32,
        /// Whether that app id is Spacewar.
        placeholder: bool,
    },
    /// Tried and there is no Steam here. The game plays on device-locally.
    Unavailable {
        /// What the binding said, for the log.
        reason: String,
    },
}

/// The line the shell logs for a handshake outcome.
pub fn describe_status(status: &SteamStatus) -> String {
    match status {
        SteamStatus::Disabled => {
            "steam: disabled (GIS_STEAM=off) — running without Steam".to_string()
        }
        SteamStatus::Connected {
            player,
            app_id,
            placeholder,
        } => format!(
            "steam: connected as {player} (app {app_id}{})",
            if *placeholder {
                ", SPACEWAR TEST APP"
            } else {
                ""
            }
        ),
        SteamStatus::Unavailable { reason } => format!(
            "steam: unavailable — {reason}. Cloud save and achievements are off; \
             the game plays device-locally."
        ),
    }
}
