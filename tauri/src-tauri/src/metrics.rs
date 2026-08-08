// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! THE CLOCK BEHIND THE COLD-START MARKS — the effects half of
//! [`adastrail_shell::metrics`], which owns every rule about what a mark means
//! and what a recorded number is allowed to be.
//!
//! It is a global, exactly as [`adastrail_shell::output`] is, and for the same
//! reason: the moments worth stamping happen in four different modules on the
//! way up, and threading a recorder through a window builder to reach the
//! webview's load callback would put a measurement instrument into the
//! signature of every function it passes. The alternative — stamping only what
//! `main` can see — is the one that loses the two marks that matter.
//!
//! [`start`] is called first thing in `main`, before anything else runs, so the
//! zero really is the process's own beginning rather than the first moment
//! somebody remembered to ask.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use adastrail_shell::metrics::{append_startup, StartupMetrics};
use adastrail_shell::output;

/// Which build wrote a line, so a file copied into a bug report is still
/// attributable.
const SHELL: &str = "tauri";

fn started() -> &'static Instant {
    static STARTED: OnceLock<Instant> = OnceLock::new();
    STARTED.get_or_init(Instant::now)
}

fn recorder() -> &'static Mutex<StartupMetrics> {
    static RECORDER: OnceLock<Mutex<StartupMetrics>> = OnceLock::new();
    RECORDER.get_or_init(|| Mutex::new(StartupMetrics::new()))
}

/// Stamp the beginning. Called first thing in `main`.
pub fn start() {
    let _ = started();
    mark("process");
}

/// Stamp a mark now. Unknown names are refused by the decision layer rather
/// than here — see [`adastrail_shell::metrics::StartupMetrics::mark`].
pub fn mark(name: &str) {
    let millis = u64::try_from(started().elapsed().as_millis()).unwrap_or(u64::MAX);
    if let Ok(mut recorder) = recorder().lock() {
        recorder.mark(name, millis);
    }
}

/// Say why this launch is not a fair sample of a cold start.
pub fn note(note: &str) {
    if let Ok(mut recorder) = recorder().lock() {
        recorder.note(note);
    }
}

/// Write the launch down: one line in the launch log, one line in
/// `startup.jsonl`.
///
/// Called when the last mark lands. A launch that never gets there writes
/// nothing, which is correct — an incomplete row in the file would be read as a
/// very fast one, and there is already a launch log saying what went wrong.
///
/// **ONCE PER PROCESS**, and the guard is load-bearing rather than defensive:
/// the caller is the webview's page-load callback, which fires again for every
/// in-site navigation the player makes (the library, the privacy page). Without
/// it, `startup.jsonl` would fill with rows that are not launches and the bench
/// harness's median would be a median of page loads.
pub fn finish(user_data: &std::path::Path, version: &str) {
    static WRITTEN: AtomicBool = AtomicBool::new(false);
    if WRITTEN.swap(true, Ordering::SeqCst) {
        return;
    }
    let Ok(recorder) = recorder().lock() else {
        return;
    };
    output::info(&recorder.summary());
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|since| since.as_secs())
        .unwrap_or_default();
    append_startup(user_data, &recorder.document(SHELL, version, stamp));
}
