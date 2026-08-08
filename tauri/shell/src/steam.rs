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
//!  2. **The overlay** — which the migration doc called impossible here and
//!     which now works, by a different route than Electron's. Electron appends
//!     two CHROMIUM command line switches; a platform webview has no command
//!     line, so this shell gives Valve's injected library a SURFACE OF ITS OWN
//!     to hook instead: see [`OverlaySupport`] and [`overlay_plan`].
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
/// It is written down here, at the seam, because this is the file somebody opens
/// when they ask why Shift+Tab does or does not answer over the Tauri build.
///
/// The overlay is not something a game switches on. It is a library Steam
/// injects into the process, which hooks the graphics API the game presents its
/// frames with (D3D/OpenGL/Vulkan/Metal) and draws over the swap chain. A game
/// gets it for free precisely because it owns that surface.
///
/// A webview shell does not own that surface — the webview does — and the two
/// shells reach the overlay from opposite ends:
///
///  - **Electron** exposes `electronEnableSteamOverlay()`, which is not a
///    request to draw anything: it appends the Chromium switches
///    `in-process-gpu` and `disable-direct-composition`, moving the GPU work
///    into the browser process and off the compositor path, which is what leaves
///    a swap chain in the process Steam has hooked. That is a CHROMIUM
///    arrangement, reached through Chromium's own command line, and a platform
///    webview has no such command line to reach.
///  - **This shell gives the injected library a surface of its own.** A
///    transparent, click-through, undecorated window is opened over the game's
///    window and a thread presents EMPTY frames into it at vsync through a real
///    in-process swap chain. Steam's hook finds that swap chain, composites the
///    overlay into the frames it was already presenting, and the player sees the
///    overlay over the game exactly as they would over a native title — because
///    everywhere the overlay does not draw, the sheet is transparent and the
///    webview shows through. The decoy is only VISIBLE while the overlay is
///    open; the rest of the time it is hidden, and hidden means not presenting.
///
/// The technique is not ours: it is `tauri-plugin-steam-overlay-surface` (MIT),
/// and every invariant that makes it safe rather than a black rectangle over the
/// game lives in that crate with the failure that taught it. What lives HERE is
/// the decision of whether to raise it at all — see [`overlay_plan`].
///
/// Two things the surface does NOT buy, and both are why
/// [`crate::screenshots_provider`] still exists on this shell and does not on
/// Electron's:
///
///  - **Steam's screenshot key still photographs the decoy**, whose frames are
///    empty by construction. So the game goes on filing its own pictures through
///    `AddScreenshotToLibrary` rather than leaving F12 to Valve.
///  - **Shift+Tab is not seen by this process.** The keystroke goes to the
///    webview's own process, so the shell listens for it in the PAGE and asks
///    Steam to open the overlay itself — see `src-tauri/src/page.rs`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OverlaySupport {
    /// A decoy swap chain in this process gives Valve's injected library
    /// something to hook. Windows, today.
    DecoySurface,
    /// No decoy on this platform yet. The same technique could be carried here —
    /// the overlay IS injected into native games on both — but a Metal or a
    /// Vulkan sheet is a different piece of work, and claiming one that does not
    /// exist would be worse than saying so.
    NotYet,
}

/// The verdict for one webview. See [`OverlaySupport`].
pub fn overlay_support(webview: Webview) -> OverlaySupport {
    match webview {
        // Windows: `gameoverlayrenderer64.dll` is resident, and a DXGI swap
        // chain in this process is all it was ever waiting for.
        Webview::WebView2 => OverlaySupport::DecoySurface,
        Webview::WkWebView | Webview::WebKitGtk => OverlaySupport::NotYet,
    }
}

/// The title the decoy window carries.
///
/// Nothing draws it — the window has no decorations — but everything that
/// ENUMERATES windows shows it: a capture picker, a task manager, a bug
/// reporter's screenshot of both. So it names the game and says what it is,
/// rather than being Tauri's default "Tauri App" floating over somebody's
/// desktop with no explanation.
pub const OVERLAY_SURFACE_TITLE: &str = "Ada's Trail — Steam overlay surface";

/// WHAT THIS LAUNCH DOES ABOUT THE OVERLAY.
///
/// Three outcomes, and the two that raise nothing are ordinary rather than
/// failures — which is the reason this is a type and not a bool.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OverlayPlan {
    /// Raise the decoy surface: Steam started this process, so its library is
    /// injected, and this webview's platform has a decoy to offer it.
    Surface,
    /// Nothing is injected into this process, so there is nothing to hand a
    /// surface to. A checkout run from a terminal, or `GIS_STEAM=off`.
    NotInjected,
    /// The platform has no decoy yet — see [`OverlaySupport::NotYet`].
    NoDecoy,
}

/// Whether to raise the decoy surface for THIS launch.
///
/// **A surface nobody is going to hook is pure cost**: a second window, a wgpu
/// device, and a thread presenting a screenful of nothing at vsync for the whole
/// session. So it is raised only where all three hold — the platform has a
/// decoy, Steam is being talked to at all, and STEAM STARTED US, which is the
/// one honest signal that its library is in this process.
///
/// `GIS_STEAM_OVERLAY=1` forces the last of those on, which is how the overlay
/// is tested from a checkout launched under Spacewar; `=0` forces it off. Both
/// are already [`steam_overlay_wanted`]'s, so the escape hatch is the same one
/// the Electron shell has and is spelled the same way.
pub fn overlay_plan(webview: Webview, enabled: bool, started_by_steam: bool) -> OverlayPlan {
    match overlay_support(webview) {
        OverlaySupport::NotYet => OverlayPlan::NoDecoy,
        OverlaySupport::DecoySurface if enabled && started_by_steam => OverlayPlan::Surface,
        OverlaySupport::DecoySurface => OverlayPlan::NotInjected,
    }
}

/// The line the shell logs about the overlay, once per launch.
///
/// A sentence rather than a flag, because the reader is somebody comparing the
/// two desktop builds with a log file open and wondering why Shift+Tab answers
/// on one of them — and, now that it answers on both, wondering why the
/// screenshot key still does not.
pub fn overlay_explanation(plan: OverlayPlan, webview: Webview) -> String {
    let where_ = match webview {
        Webview::WebView2 => "WebView2",
        Webview::WkWebView => "WKWebView",
        Webview::WebKitGtk => "WebKitGTK",
    };
    match plan {
        OverlayPlan::Surface => format!(
            "steam: the overlay draws on a decoy surface — Steam started this process and the \
             game is drawn by {where_}, so the shell presents transparent frames in a window of \
             its own for Valve's library to hook. Shift+Tab is forwarded from the page; Steam's \
             own screenshot key is not, and the game files its own pictures instead. \
             See tauri/README.md."
        ),
        OverlayPlan::NotInjected => format!(
            "steam: no overlay this launch — Steam did not start this process, so nothing is \
             injected into it and the decoy surface is not raised (it would cost a window and a \
             swap chain to be hooked by nobody). {where_} is otherwise able to carry one: launch \
             from the Steam library, or set GIS_STEAM_OVERLAY=1. See tauri/README.md."
        ),
        OverlayPlan::NoDecoy => format!(
            "steam: no overlay on this desktop — the game is drawn by {where_}, which composites \
             through the system compositor, and the decoy surface that carries the overlay on \
             Windows has no counterpart here yet. Shift+Tab and Steam's own screenshot key are \
             unavailable; the game files its own pictures instead. See tauri/README.md."
        ),
    }
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
