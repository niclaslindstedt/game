// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! The names the page and the shell reach each other by — the peer of
//! `electron/src/channels.ts`.
//!
//! Both halves of every bridge protocol are named here so a rename is one edit
//! rather than a hunt. The page's own half of these names lives in
//! `pwa/src/app/shell-bridge.ts` and in each bridge module beside it, and is
//! IDENTICAL on all three shells — the Expo WebView, Electron and this one —
//! which is the whole reason adding a shell has never changed a protocol.

/// The Tauri command every JSON bridge message travels on: the page calls it,
/// the shell routes what arrives.
///
/// This is the pipe, and it is the only thing about a bridge that differs
/// between shells — `ReactNativeWebView.postMessage` on the phone,
/// `ipcRenderer.send` under Electron, an `invoke` here.
pub const SHELL_COMMAND: &str = "shell_post";

/// The object the page posts through, exposed by the initialization script.
/// `pwa/src/app/shell-bridge.ts` looks for exactly this name.
pub const SHELL_GLOBAL: &str = "__gisShell";

/// The page is inside a store shell, so the PWA update lifecycle is off
/// (`pwa/src/app/native.ts`). The app bundles the game and ships updates as
/// builds; a service worker here would precache a build the player can no
/// longer be given.
pub const NATIVE_GLOBAL: &str = "__GIS_NATIVE__";

/// WHICH PLATFORM — read by `pwa/src/app/shell-bridge.ts` to answer
/// platform-feature questions (that this platform does not sell coins, and has
/// no vibration motor).
pub const PLATFORM_GLOBAL: &str = "__GIS_PLATFORM__";

/// WHICH SHELL, which is a different question from which platform and is asked
/// by nothing in the game.
///
/// The page must go on believing it is the desktop store build, because it IS —
/// same store, same product, same absent coin store. This global exists for a
/// bug report and a screenshot to be attributable to a binary while two of them
/// exist, and `tauri/README.md` is the rule that keeps it out of any
/// gameplay decision.
pub const SHELL_ID_GLOBAL: &str = "__GIS_SHELL__";

/// What this launch may honour, as plain names.
pub const CAPS_GLOBAL: &str = "__GIS_CAPS__";

/// WHETHER THE COMMAND LINE — rather than the packaging — is what turned any of
/// that on, which the game states before it shows the player a menu.
///
/// Multiplayer and mods are licensed with the store edition, so a copy running
/// them off `--multiplayer` / `--mods` / `--voice` is being played outside the
/// terms it was given; `pwa/src/game/LaunchNotice.tsx` is where somebody says
/// they understand that, and this is the only thing it is told. It FAILS
/// CLOSED in the page — an absent global is a launch with nothing to answer —
/// so it is defined on every launch rather than only on an unlocked one.
pub const UNLOCKED_GLOBAL: &str = "__GIS_UNLOCKED__";

/// WHETHER THE COMMAND LINE GAVE THIS LAUNCH THE AUTO PILOT, which the game
/// states in the same box and before the same menu.
///
/// No desktop build carries the ride — it is a cheat in a session, and this is
/// a game people play together — so `--autopilot` is a DEVELOPER switch that
/// costs the launch its multiplayer (`capabilities::resolve_capabilities`). The
/// page is told twice, on purpose and in two directions: the capability list
/// says whether the ride may be OFFERED and fails open, this says whether it
/// was switched on BY HAND and fails closed. Defined on every launch, `false`
/// included, so the page's read stays a plain equality.
pub const AUTOPILOT_GLOBAL: &str = "__GIS_AUTOPILOT__";

/// What the page answers to. The shell calls these from OUTSIDE — the return
/// path needed no abstraction on any shell, which is why the web side's
/// receiving half is byte-identical across all three.
pub const EVENT_GLOBALS: &[(&str, &str)] = &[
    ("cloud", "__gisCloudEvent"),
    ("achievements", "__gisAchievementsEvent"),
    ("scores", "__gisScoresEvent"),
    ("mods", "__gisModsEvent"),
    ("net", "__gisNetEvent"),
    ("shots", "__gisShotsEvent"),
];

/// The page's event callback for one protocol, by the protocol's own name.
pub fn event_global(protocol: &str) -> Option<&'static str> {
    EVENT_GLOBALS
        .iter()
        .find(|(name, _)| *name == protocol)
        .map(|(_, global)| *global)
}
