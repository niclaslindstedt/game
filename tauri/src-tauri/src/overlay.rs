// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! VALVE'S OVERLAY, GIVEN SOMETHING TO DRAW ON — the effects half of the overlay
//! block in [`adastrail_shell::steam`], and the peer of the two Chromium
//! switches `electron/src/steam.ts` appends.
//!
//! The whole argument for why a decoy swap chain is what a webview shell has to
//! offer lives at that seam. What lives HERE is the three moments it takes:
//!
//!  1. **[`install`]** — register the plugin, before the event loop, and only on
//!     a launch [`overlay_plan`](adastrail_shell::steam::overlay_plan) said is
//!     worth it. The plugin raises the surface itself once the game's window
//!     exists.
//!  2. **[`arm`]** — hand the plugin Steam's `GameOverlayActivated` callback,
//!     which is what tells it to show the sheet, take the cursor, freeze a
//!     backdrop, and put every one of those back on close.
//!  3. **[`activate`]** — Shift+Tab, arriving from the page.
//!
//! **THE ORDER OF 1 AND 2 IS LOAD-BEARING, and it is not the order they are
//! written in.** The plugin creates its GPU device when the main window appears;
//! Valve's library has to be resident and initialized before that, or the device
//! is made against an unhooked adapter and the overlay never finds it. So [`arm`]
//! is called from `setup()` BEFORE `window::build` — and it is also what forces
//! the Steam handshake to have happened by then, since asking for the client is
//! what performs it.
//!
//! **Shift+Tab never reaches this process.** The keystroke belongs to the
//! webview, which is a process this shell does not own, so the chord is listened
//! for in the PAGE (`crate::page`) and arrives here as a command. That is the one
//! piece Electron gets for free: its overlay is hooked into a Chromium the shell
//! started, so Steam's own input hook sees the key first.
//!
//! Everything Windows-shaped is `#[cfg(windows)]` and the rest of the file is the
//! no-op every other desktop gets, because the decoy is a DXGI arrangement — see
//! `Cargo.toml` for why the dependency is gated the same way.

use adastrail_shell::output;
use adastrail_shell::steam::OverlayPlan;
use tauri::{AppHandle, Wry};

/// The overlay page Shift+Tab opens: Steam's own default, which is what the
/// chord does over a native game. Named rather than passed as `""` at the call
/// site, because an empty string reads like a value somebody forgot to fill in.
const OVERLAY_DIALOG_DEFAULT: &str = "";

/// Register the decoy surface, on a launch that has something to hook it.
///
/// Takes and returns the builder so the decision stays one line at the call
/// site, and so a launch with no overlay carries no plugin at all rather than a
/// plugin that checks a flag on every window event.
#[cfg(windows)]
pub fn install(builder: tauri::Builder<Wry>, plan: OverlayPlan) -> tauri::Builder<Wry> {
    if plan != OverlayPlan::Surface {
        return builder;
    }
    builder.plugin(
        tauri_plugin_steam_overlay_surface::Builder::new()
            // The window the sheet covers — the same label `window::build` uses
            // and everything else in this shell looks the game up by.
            .main_window_label("main")
            .overlay_title(adastrail_shell::steam::OVERLAY_SURFACE_TITLE)
            // A frozen frame of the game painted behind Steam's UI, so the
            // overlay dims a game rather than dimming black. The sheet's own
            // frames are empty by design, and Steam composites onto whatever it
            // finds there.
            .snapshot_backdrop(true)
            .build(),
    )
}

#[cfg(not(windows))]
pub fn install(builder: tauri::Builder<Wry>, _plan: OverlayPlan) -> tauri::Builder<Wry> {
    builder
}

/// Hand the plugin Steam's `GameOverlayActivated` callback.
///
/// **Called before the window is built** — see the module header for the half of
/// that ordering which is about the GPU device rather than about the callback.
///
/// The callback is deliberately never unregistered: it is wanted for the whole
/// life of the process, and a `CallbackHandle` that goes out of scope takes the
/// registration with it, which would leave a surface nobody ever tells to show
/// itself. `forget` is the plugin's own documented shape for this.
#[cfg(windows)]
pub fn arm(app: &AppHandle, plan: OverlayPlan) {
    if plan != OverlayPlan::Surface {
        return;
    }
    let Some(client) = crate::steam::steam_client() else {
        // The plan said Steam started us and the handshake still failed — the
        // client was closed underneath us, or the app id is not one it knows.
        // Ordinary enough not to be fatal, odd enough to say out loud.
        output::warn(
            "steam overlay: the surface is up but there is no Steam client to hear \
             the overlay from, so Shift+Tab will do nothing this launch",
        );
        return;
    };
    let handle = app.clone();
    let registered = client.register_callback(move |event: steamworks::GameOverlayActivated| {
        tauri_plugin_steam_overlay_surface::on_overlay_activated(&handle, event.active);
    });
    std::mem::forget(registered);
    output::info(
        "steam overlay: the decoy surface is armed — Shift+Tab opens Valve's overlay over the game",
    );
}

#[cfg(not(windows))]
pub fn arm(_app: &AppHandle, _plan: OverlayPlan) {}

/// SHIFT+TAB, forwarded from the page.
///
/// NOT gated on the plan, and that is on purpose: the question this asks is
/// whether Valve's library is in this process RIGHT NOW
/// (`ISteamUtils::IsOverlayEnabled`), which is a runtime fact and the same one
/// the achievements board asks before claiming to have opened anything. A player
/// who has the overlay disabled in Steam's own settings gets a line in the log
/// rather than a key that silently does nothing.
pub fn activate() {
    let Some(client) = crate::steam::steam_client() else {
        return;
    };
    if !crate::steam::overlay_loaded() {
        output::info(
            "steam overlay: Shift+Tab, but no overlay is loaded into this process — \
             see tauri/README.md",
        );
        return;
    }
    client
        .friends()
        .activate_game_overlay(OVERLAY_DIALOG_DEFAULT);
}
