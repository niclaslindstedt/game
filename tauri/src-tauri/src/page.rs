// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! THE PAGE'S WHOLE VIEW OF THE SHELL — the peer of `electron/src/preload.ts`
//! and of `native/src/injected.ts`.
//!
//! It is one initialization script, evaluated before the game's own scripts on
//! every load, and it exposes exactly seven things — five constants, the page →
//! shell pipe, and the snapshot channel's page-side half
//! ([`adastrail_shell::snapshot`]), which is how a session's twenty frames a
//! second reach the page without the shell in the path:
//!
//! | Global                | What it says                                              |
//! | --------------------- | --------------------------------------------------------- |
//! | `__GIS_NATIVE__`      | a store shell, so the PWA update lifecycle is off         |
//! | `__GIS_PLATFORM__`    | WHICH PLATFORM — `steam`, the same product Electron ships |
//! | `__GIS_SHELL__`       | WHICH BINARY — `tauri`, for a bug report and nothing else |
//! | `__GIS_CAPS__`        | what this launch may honour, as plain names               |
//! | `__GIS_UNLOCKED__`    | …and whether the COMMAND LINE is what turned it on        |
//! | `__gisShell.post`     | the page → shell pipe                                     |
//! | `__gisShell.onNetPort`| a session's frames, as the `MessagePort` the page expects |
//!
//! **`__GIS_PLATFORM__` stays `steam` on purpose.** The page asks that question
//! to decide whether a coin store exists and whether there is a vibration
//! motor — questions about the PRODUCT, which is the same product on the same
//! store whichever binary is showing it. A fourth platform value would make
//! every one of those answers something a reader has to check twice.
//!
//! The RETURN path is not here: the shell calls the page's own
//! `window.__gis*Event(...)` from outside (`webview.eval`), exactly as the
//! mobile shell calls them with `injectJavaScript` and Electron with
//! `executeJavaScript`. That is why the web side's receiving half needed no
//! change to run on this shell.
//!
//! **The page never sees Tauri.** `withGlobalTauri` is off, `capabilities/
//! default.json` grants the window almost nothing, and the one command it may
//! reach is looked up at CALL time inside `post` rather than captured here —
//! so nothing in this script hands the game a handle it could keep.

use adastrail_shell::capabilities::{capability_list, Capabilities};
use adastrail_shell::channels::{
    CAPS_GLOBAL, NATIVE_GLOBAL, PLATFORM_GLOBAL, SHELL_COMMAND, SHELL_GLOBAL, SHELL_ID_GLOBAL,
    UNLOCKED_GLOBAL,
};
use adastrail_shell::media::lockout_script;
use adastrail_shell::snapshot::{adapter_script, shell_member};

/// Which PLATFORM the page is on. Not which binary — see the module header.
pub const PLATFORM: &str = "steam";

/// Which BINARY is showing the page. Read by nothing in the game.
pub const SHELL_ID: &str = "tauri";

/// The internal command the fullscreen key press invokes.
///
/// Electron intercepts F11 and Alt+Enter with `before-input-event`, which a
/// webview has no counterpart for — the keys never reach the native side at
/// all. So the shell listens for them IN the page, on the capture phase, and
/// asks itself to toggle. It stays shell code either way: the game has no
/// fullscreen of its own to fight over, since the Fullscreen API belongs to a
/// browser chrome this window does not have.
pub const FULLSCREEN_COMMAND: &str = "shell_toggle_fullscreen";

/// The internal command Shift+Tab invokes.
///
/// **The chord never reaches this process.** Valve's overlay catches Shift+Tab
/// with an input hook inside the game's own process — which on the Electron
/// build is the process showing the page, and here is not: the keystroke belongs
/// to the webview's process, which this shell does not own. So the shell listens
/// for it in the page, exactly as it does for F11, and asks Steam to raise the
/// overlay itself.
///
/// The listener is installed ONLY on a launch that has an overlay to raise (see
/// [`crate::overlay`]). Everywhere else Shift+Tab stays what the platform makes
/// it — swallowing a browser's reverse-tab chord for a feature that is not there
/// would be a small accessibility regression bought for nothing.
pub const OVERLAY_COMMAND: &str = "shell_activate_overlay";

/// The script the window is built with.
///
/// `overlay` is whether this launch forwards Shift+Tab — the plan
/// (`adastrail_shell::steam::OverlayPlan`) reduced to the one bit the page needs.
pub fn initialization_script(capabilities: &Capabilities, overlay: bool) -> String {
    let caps =
        serde_json::to_string(&capability_list(capabilities)).unwrap_or_else(|_| "[]".to_string());
    // The licence acknowledgement's one bit — see `UNLOCKED_GLOBAL`. Stated on
    // every launch, `false` included, so the page's read stays a plain equality
    // rather than a guess about what an absent global meant.
    let unlocked = capabilities.unlocked;
    // THE SNAPSHOT CHANNEL's page-side half, and the MICROPHONE's floor. Both
    // are decisions with tests, spliced in rather than written here — see
    // `adastrail_shell::snapshot` and `adastrail_shell::media`.
    let net = adapter_script();
    let net_member = shell_member();
    let lockout = lockout_script(capabilities.voice());
    let overlay_key = overlay_script(overlay);
    format!(
        r#"(function () {{
  var define = function (name, value) {{
    Object.defineProperty(window, name, {{ value: value, writable: false, configurable: false }});
  }};
  define({NATIVE_GLOBAL:?}, true);
  define({PLATFORM_GLOBAL:?}, {PLATFORM:?});
  define({SHELL_ID_GLOBAL:?}, {SHELL_ID:?});
  define({CAPS_GLOBAL:?}, Object.freeze({caps}));
  define({UNLOCKED_GLOBAL:?}, {unlocked});
{lockout}
{net}

  // The pipe is resolved on every call rather than captured: this script and
  // Tauri's own are both injected at document start, and depending on one
  // having run first is the kind of ordering that works until it doesn't.
  var send = function (command, args) {{
    var internals = window.__TAURI_INTERNALS__;
    if (!internals || typeof internals.invoke !== 'function') return;
    try {{ internals.invoke(command, args); }} catch (e) {{ /* page tearing down */ }}
  }};

  define({SHELL_GLOBAL:?}, Object.freeze({{
    post: function (message) {{
      // Only strings cross. The shell parses and validates; a structured
      // object would let the page hand the bridge something with a prototype
      // to argue about, and the protocol is JSON on every other shell anyway.
      if (typeof message !== 'string') return;
      send({SHELL_COMMAND:?}, {{ message: message }});
    }},
{net_member}
  }}));

  // F11 / Alt+Enter — see FULLSCREEN_COMMAND. Capture phase, so a game that
  // swallows the key for its own reasons does not take the window's chrome
  // with it.
  window.addEventListener('keydown', function (event) {{
    if (event.key !== 'F11' && !(event.key === 'Enter' && event.altKey)) return;
    event.preventDefault();
    send({FULLSCREEN_COMMAND:?}, {{}});
  }}, true);
{overlay_key}
}})();"#
    )
}

/// SHIFT+TAB → the overlay, or nothing at all.
///
/// Empty on a launch with no overlay behind it, so the chord keeps whatever the
/// platform gives it — see [`OVERLAY_COMMAND`] for why the shell has to listen
/// for this key in the page at all.
///
/// Capture phase and `preventDefault`, for the same reason F11 is: the game must
/// not be able to swallow the window's own chrome, and Shift+Tab moving the
/// focus ring backwards through a game the player is holding a pointer on is the
/// browser behaviour the overlay is replacing.
fn overlay_script(enabled: bool) -> String {
    if !enabled {
        return String::new();
    }
    format!(
        r#"
  // Shift+Tab — see OVERLAY_COMMAND. `event.key` is 'Tab' with the modifier
  // reported separately, on every engine this shell runs on.
  window.addEventListener('keydown', function (event) {{
    if (event.key !== 'Tab' || !event.shiftKey) return;
    event.preventDefault();
    send({OVERLAY_COMMAND:?}, {{}});
  }}, true);"#
    )
}
