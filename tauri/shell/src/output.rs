// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! The Tauri shell's central output module — the peer of
//! `electron/src/output.ts`, and of `engine/output.ts` for a tree that runs as a
//! native binary rather than in a browser (OSS_GAME_SPEC §19.4: diagnostics go
//! through one module so they can be silenced, redirected or timestamped in one
//! place, and never scattered as raw `println!` calls).
//!
//! A desktop app has no devtools console a player will ever open, so the
//! shell's stdout IS its diagnostic surface: it is what a bug report pastes.
//! Two rules keep it worth reading —
//!
//!  1. every line is PREFIXED with what emitted it (`webroot:`, `bridge:`), so
//!     a log with three subsystems in it can still be read; and
//!  2. it stays QUIET by default in a release build, because a shipped game
//!     should not narrate itself. `GIS_VERBOSE=1` turns the chatter back on;
//!     warnings and errors are never suppressed, since those are the lines
//!     someone is looking for when they go looking at all.
//!
//! ## THE LAUNCH LOG
//!
//! A packaged game on Windows has no console at all — it is started from an icon
//! or from Steam, and a line written to stderr goes to a stream nobody is
//! holding. So a shell that fails to start is, from the player's side, a program
//! that does nothing when double-clicked; the whole diagnosis is a file or it
//! does not exist. Every line the shell emits is therefore also appended there,
//! INFO included and regardless of verbosity — a log written only when things go
//! well is the wrong way round.
//!
//! One file per launch (the previous one is kept beside it as `.prev`, which is
//! the copy a player still has after restarting to "see if it does it again"),
//! and written SYNCHRONOUSLY: the lines worth having are the ones emitted
//! immediately before the process dies, and a buffered writer loses exactly
//! those.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

/// How loud this launch is. A debug build narrates itself; a release build is
/// quiet unless asked.
fn verbose() -> bool {
    static VERBOSE: OnceLock<bool> = OnceLock::new();
    *VERBOSE.get_or_init(|| {
        cfg!(debug_assertions) || std::env::var_os("GIS_VERBOSE").is_some_and(|value| value == "1")
    })
}

fn log_file() -> &'static Mutex<Option<PathBuf>> {
    static LOG_FILE: OnceLock<Mutex<Option<PathBuf>>> = OnceLock::new();
    LOG_FILE.get_or_init(|| Mutex::new(None))
}

/// Point the log at a directory (the app's user-data path).
///
/// Best-effort: a read-only or missing directory must never be the reason the
/// game won't start, so a failure here downgrades to console-only output.
pub fn log_to_file(dir: &Path) {
    let path = dir.join("launch.log");
    let started = fs::create_dir_all(dir).and_then(|()| {
        // No previous launch to keep is the normal first-run case, so the
        // rename's failure is ignored while the write's is not.
        let _ = fs::rename(&path, path.with_extension("log.prev"));
        fs::write(&path, format!("— launch {} —\n", stamp()))
    });
    if let Ok(mut slot) = log_file().lock() {
        *slot = started.ok().map(|()| path);
    }
}

/// Where the launch log is, or `None` when there isn't one. Named in the error
/// dialog so a bug report has a file to attach.
pub fn log_path() -> Option<PathBuf> {
    log_file().lock().ok().and_then(|slot| slot.clone())
}

/// Seconds since the epoch, which is all a launch stamp has to be: the file is
/// read next to a bug report that carries its own date, and pulling a date
/// formatter into the shell for one line is not a trade worth making.
fn stamp() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|since| format!("{}s since the epoch", since.as_secs()))
        .unwrap_or_else(|_| "an unreadable clock".to_string())
}

fn record(level: &str, message: &str) {
    let Ok(mut slot) = log_file().lock() else {
        return;
    };
    let Some(path) = slot.clone() else {
        return;
    };
    let written = OpenOptions::new()
        .append(true)
        .open(&path)
        .and_then(|mut file| writeln!(file, "[{level}] {message}"));
    if written.is_err() {
        // A log that cannot be written is not worth failing a launch over —
        // and not worth trying again on every line either.
        *slot = None;
    }
}

/// Progress and state worth seeing while developing; silent in a quiet build.
pub fn info(message: &str) {
    if verbose() {
        println!("{message}");
    }
    record("info", message);
}

/// Something degraded but the game keeps running — always shown.
pub fn warn(message: &str) {
    eprintln!("{message}");
    record("warn", message);
}

/// Something failed — always shown.
pub fn error(message: &str) {
    eprintln!("{message}");
    record("error", message);
}
