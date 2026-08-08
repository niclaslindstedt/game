// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! THE CAPABILITY STAMP, read at COMPILE time.
//!
//! `option_env!` resolves when the binary is built, so what a copy of this game
//! may do is baked into the machine code rather than kept in a file beside it.
//! That is the one place this shell is stricter than the Electron one, which
//! reads the same set out of its packaged `package.json`: an installed Tauri
//! build has nothing to edit at all.
//!
//! The switches are the SAME names the Makefile already sets for the Electron
//! packaging targets (`GIS_ENABLE_MULTIPLAYER` and friends), so one set of
//! build environment variables drives both shells and nobody has to learn a
//! second vocabulary.
//!
//! **A rebuild is required for a stamp change to take**, and Cargo does not
//! know that on its own — `option_env!` is not a tracked input. `build.rs`
//! would have to emit `cargo:rerun-if-env-changed` for each one; until the
//! packaging phase needs it (phase 2), the packaging targets build clean
//! anyway.

use adastrail_shell::capabilities::{read_build_capabilities, BuildCapabilities, BuildStamp};

/// WHICH STEAM APP this binary talks to, baked in by the packager.
///
/// Not one of the capability switches — it is not something a build MAY do, it
/// is who the build IS — but it travels the same way and for the same reason:
/// an installed copy must not depend on the environment it happens to be
/// started in. `adastrail_shell::steam::steam_app_id` lets the launch
/// environment override it anyway, which is how a checkout points itself at
/// somebody's test app.
pub const STEAM_APP_ID: Option<&str> = option_env!("GIS_STEAM_APP_ID");

/// What this binary was stamped with, exactly as the packager spelled it.
pub const STAMP: BuildStamp<'static> = BuildStamp {
    stamped: option_env!("GIS_STAMP_CAPABILITIES"),
    multiplayer: option_env!("GIS_ENABLE_MULTIPLAYER"),
    mods: option_env!("GIS_ENABLE_MODS"),
    port_map: option_env!("GIS_ENABLE_UPNP"),
    voice: option_env!("GIS_ENABLE_VOICE"),
    licensed: option_env!("GIS_ENABLE_LICENSED"),
};

/// The capabilities this build carries before the command line is read.
pub fn build_capabilities() -> BuildCapabilities {
    read_build_capabilities(&STAMP)
}

/// True when nothing packaged this binary for distribution — a checkout, or a
/// build made without the packaging switches. Such a build is a developer's own
/// tool for debugging the game and is not a copy of the game to play or pass
/// on, and it says so at startup rather than leaving that to be assumed.
pub fn developer_build() -> bool {
    !adastrail_shell::capabilities::is_stamped(&STAMP)
}
