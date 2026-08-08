// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! Tauri's own build step: it reads `tauri.conf.json`, generates the permission
//! schemas the `capabilities/` files are checked against, and on Windows
//! compiles the resource block that carries the icon and version.
//!
//! Plus the two things packaging needs from a build script.
//!
//! **THE CAPABILITY STAMP has to be declared a build input**, which is the one
//! thing `src/stamp.rs` cannot do for itself. `option_env!` resolves at compile
//! time but is NOT a tracked input, so Cargo would happily reuse a binary
//! stamped from a previous packaging run's environment — a `make
//! desktop-tauri-dist` immediately after a `make desktop-tauri-steam` would ship
//! the depot build's capabilities in a plain download.
//!
//! **VALVE'S REDISTRIBUTABLE has to end up beside the executable.** The
//! `steamworks-sys` build script copies its vendored `libsteam_api` into its own
//! `OUT_DIR` and links against it there — which satisfies the LINKER and not the
//! loader, so a binary built without this step starts and then reports
//! `libsteam_api.so => not found` at launch. Rather than making every developer
//! (and the packaging script) know where the file went, it is copied to the
//! target profile directory here, next to the executable Cargo is about to
//! write. `scripts/package.mjs` then picks it up from a path it can predict.
//!
//! Placing the file is only half of it: on Linux and macOS the loader does NOT
//! look beside the executable, so the binary is also given an rpath that says
//! to. Windows searches the executable's own directory already and needs
//! nothing.
//!
//! **AND THAT IS WHY `tauri.conf.json` NAMES NO `bundle.macOS.frameworks`.**
//! `tauri_build::build()` resolves that list AT COMPILE TIME on macOS and
//! fails the whole build with `Library not found: <path>` when an entry is
//! missing — so a path written into the static config has to name the profile
//! directory, and there is no profile a static string can name that is right
//! more than once. `../target/release/libsteam_api.dylib` broke every DEBUG
//! build on macOS (`npm run tauri`, `npm run tauri:lint`) on a checkout that
//! had never made a release build, which is every fresh clone. The list is a
//! COMPUTED thing — it depends on the profile and on `--target <triple>` — so
//! `scripts/package.mjs` owns it and hands it over in its `--config` patch,
//! the same way it owns every other value that cannot be static. A dev build
//! needs no entry at all: the copy below plus `@executable_path` is already
//! the whole of what the loader wants. `tests/content/tauri_config_test.ts`
//! keeps a build-output path from creeping back in.

use std::path::{Path, PathBuf};
use std::{env, fs};

/// The packaging environment `src/stamp.rs` reads, and therefore the set a
/// change to must force a rebuild. The same names the Makefile sets for the
/// Electron packaging targets, so one vocabulary drives both shells.
const STAMP_VARIABLES: &[&str] = &[
    "GIS_STAMP_CAPABILITIES",
    "GIS_ENABLE_MULTIPLAYER",
    "GIS_ENABLE_MODS",
    "GIS_ENABLE_UPNP",
    "GIS_ENABLE_VOICE",
    "GIS_ENABLE_LICENSED",
    // Not a capability — which Steam APP this build is — but baked in the same
    // way and needing the same rebuild trigger.
    "GIS_STEAM_APP_ID",
];

fn main() {
    for variable in STAMP_VARIABLES {
        println!("cargo:rerun-if-env-changed={variable}");
    }
    place_steam_redistributable();
    point_the_loader_beside_the_executable();
    tauri_build::build();
}

/// Teach the dynamic loader to look next to the executable for Valve's library.
///
/// `$ORIGIN` on Linux and `@executable_path` on macOS both mean "the directory
/// this binary is in", resolved at LOAD time — so one rpath covers a checkout's
/// `target/debug/`, a depot directory, and an installed copy alike. The macOS
/// build gets `../Frameworks` too, because that is where a `.app` bundle keeps
/// its dylibs and where `tauri.conf.json` files this one.
fn point_the_loader_beside_the_executable() {
    match env::var("CARGO_CFG_TARGET_OS").unwrap_or_default().as_str() {
        "linux" => println!("cargo:rustc-link-arg-bins=-Wl,-rpath,$ORIGIN"),
        "macos" => {
            println!("cargo:rustc-link-arg-bins=-Wl,-rpath,@executable_path");
            println!("cargo:rustc-link-arg-bins=-Wl,-rpath,@executable_path/../Frameworks");
        }
        // Windows searches the executable's own directory first, so the copy
        // above is the whole of it.
        _ => {}
    }
}

/// What Valve's shared library is called on the platform being built for.
fn redistributable_name() -> &'static str {
    let target = env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    match target.as_str() {
        "windows" => "steam_api64.dll",
        "macos" => "libsteam_api.dylib",
        _ => "libsteam_api.so",
    }
}

/// Copy `libsteam_api` next to the executable Cargo is building.
///
/// Best-effort and never fatal: a build that could not place it still compiles
/// and still runs, and reports Steam as unavailable — which is the same thing it
/// does on a machine with no Steam client. Failing the build over it would turn
/// a degraded feature into a tree that will not compile.
fn place_steam_redistributable() {
    let Ok(out_dir) = env::var("OUT_DIR") else {
        return;
    };
    // OUT_DIR is `<target>/<profile>/build/<crate>-<hash>/out`, so two hops up
    // is the directory holding EVERY build script's output and three is the
    // profile directory the executable lands in.
    let out_dir = PathBuf::from(out_dir);
    let Some(build_dir) = out_dir.parent().and_then(Path::parent) else {
        return;
    };
    let Some(profile_dir) = build_dir.parent() else {
        return;
    };
    let name = redistributable_name();
    let Some(source) = find_redistributable(build_dir, name) else {
        println!(
            "cargo:warning=could not find {name} beside steamworks-sys' build output — \
             the binary will report Steam as unavailable"
        );
        return;
    };
    if let Err(err) = fs::copy(&source, profile_dir.join(name)) {
        println!("cargo:warning=could not place {name} beside the executable — {err}");
    }
}

/// The `steamworks-sys` build script's copy of the redistributable.
fn find_redistributable(build_dir: &Path, name: &str) -> Option<PathBuf> {
    let entries = fs::read_dir(build_dir).ok()?;
    entries
        .flatten()
        .filter(|entry| {
            entry
                .file_name()
                .to_str()
                .is_some_and(|dir| dir.starts_with("steamworks-sys-"))
        })
        .map(|entry| entry.path().join("out").join(name))
        .find(|candidate| candidate.is_file())
}
