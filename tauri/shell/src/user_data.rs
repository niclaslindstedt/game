// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! WHERE THIS APP KEEPS THINGS — the peer of `electron/src/user-data.ts`, and
//! the one time that has to move.
//!
//! Tauri names the app-data directory after the bundle IDENTIFIER, which is a
//! reverse-domain string nobody has ever seen (`se.agilator.adastrail…`)
//! while the executable is `adastrail` and the window says _Ada's Trail_. So the
//! folder the player's things live in is DECLARED here instead, beside the
//! app-data root rather than under the identifier, and it is the executable's
//! own name — the same word `electron/src/user-data.ts` declares, for the same
//! reason.
//!
//! **It is `adastrail-tauri` rather than `adastrail`, and that is deliberate.**
//! Both desktop wrappers are installable at once while the two are being
//! compared (`docs/desktop-shells.md`), and two running games sharing one
//! `window-state.json` and one `launch.log` is a fight neither can win. The day
//! only one of them is left, the name becomes `adastrail` and this one joins
//! [`LEGACY_DIR_NAMES`] — which is exactly the machinery below, used as
//! designed.
//!
//! **What does NOT live here is the player's roster**, and the difference
//! matters: `localStorage` belongs to the WEBVIEW, which keeps its own store
//! under the bundle identifier. A window rect is ours; a hero is the web
//! platform's. That is also why the electron→tauri switch cannot carry a roster
//! across on disk at all — Chromium's storage is not WebKit's — and why cloud
//! save is the only bridge between them.

use std::fs;
use std::path::{Path, PathBuf};

/// The directory name, and the name the app reports for its own files.
pub const APP_DIR_NAME: &str = "adastrail-tauri";

/// The names an install could already be using, newest guess first.
///
/// Empty today: this shell has shipped under exactly one name. It is not an
/// oversight and not dead code — it is the seam a rename walks through, and
/// [`plan_user_data_move`] is already written and tested against it.
pub const LEGACY_DIR_NAMES: &[&str] = &[];

/// This app's own directory under the OS's app-data root.
pub fn user_data_dir(app_data_root: &Path) -> PathBuf {
    app_data_root.join(APP_DIR_NAME)
}

/// A move this install needs, from where to where.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UserDataMove {
    /// The directory that already holds the player's things.
    pub from: PathBuf,
    /// Where they should be instead.
    pub to: PathBuf,
}

/// Decide whether to move an existing user-data directory, and from where.
///
/// Pure so the decision is testable without a filesystem: it is handed the
/// app-data root and a way to ask what exists, and answers the rename to
/// perform (or `None`). The rules are conservative in both directions — a new
/// folder that already exists is never touched, because that is either a fresh
/// install or a migration that already happened, and an install carrying BOTH
/// is left alone rather than merged, since guessing which holds the real things
/// is exactly the wrong thing to be clever about.
pub fn plan_user_data_move(
    app_data_root: &Path,
    exists: &dyn Fn(&Path) -> bool,
) -> Option<UserDataMove> {
    let to = user_data_dir(app_data_root);
    if exists(&to) {
        return None;
    }
    for legacy in LEGACY_DIR_NAMES {
        let from = app_data_root.join(legacy);
        if from != to && exists(&from) {
            return Some(UserDataMove { from, to });
        }
    }
    None
}

/// Move the player's data to the declared folder, once.
///
/// Called before anything reads the user-data path — a rename under a live app
/// would leave open handles pointing at a path that no longer exists. A failure
/// is NOT fatal: the app then runs on the folder it already had, which is worse
/// than migrating and far better than not starting.
pub fn adopt_user_data(app_data_root: &Path, log: &mut dyn FnMut(&str)) {
    let Some(plan) = plan_user_data_move(app_data_root, &|path| path.exists()) else {
        return;
    };
    let name = |path: &Path| {
        path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("?")
            .to_string()
    };
    match fs::rename(&plan.from, &plan.to) {
        Ok(()) => log(&format!(
            "user data moved from {} to {APP_DIR_NAME}",
            name(&plan.from)
        )),
        Err(err) => log(&format!(
            "could not move user data from {} — {err}",
            name(&plan.from)
        )),
    }
}
