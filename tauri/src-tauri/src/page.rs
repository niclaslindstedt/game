// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! THE PAGE'S WHOLE VIEW OF THE SHELL — the peer of `electron/src/preload.ts`
//! and of `native/src/injected.ts`.
//!
//! It is one initialization script, evaluated before the game's own scripts on
//! every load, and it exposes exactly five things:
//!
//! | Global                | What it says                                              |
//! | --------------------- | --------------------------------------------------------- |
//! | `__GIS_NATIVE__`      | a store shell, so the PWA update lifecycle is off         |
//! | `__GIS_PLATFORM__`    | WHICH PLATFORM — `steam`, the same product Electron ships |
//! | `__GIS_SHELL__`       | WHICH BINARY — `tauri`, for a bug report and nothing else |
//! | `__GIS_CAPS__`        | what this launch may honour, as plain names               |
//! | `__gisShell.post`     | the page → shell pipe                                     |
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
};

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

/// The script the window is built with.
pub fn initialization_script(capabilities: &Capabilities) -> String {
    let caps =
        serde_json::to_string(&capability_list(capabilities)).unwrap_or_else(|_| "[]".to_string());
    format!(
        r#"(function () {{
  var define = function (name, value) {{
    Object.defineProperty(window, name, {{ value: value, writable: false, configurable: false }});
  }};
  define({NATIVE_GLOBAL:?}, true);
  define({PLATFORM_GLOBAL:?}, {PLATFORM:?});
  define({SHELL_ID_GLOBAL:?}, {SHELL_ID:?});
  define({CAPS_GLOBAL:?}, Object.freeze({caps}));

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
    }}
  }}));

  // F11 / Alt+Enter — see FULLSCREEN_COMMAND. Capture phase, so a game that
  // swallows the key for its own reasons does not take the window's chrome
  // with it.
  window.addEventListener('keydown', function (event) {{
    if (event.key !== 'F11' && !(event.key === 'Enter' && event.altKey)) return;
    event.preventDefault();
    send({FULLSCREEN_COMMAND:?}, {{}});
  }}, true);
}})();"#
    )
}
