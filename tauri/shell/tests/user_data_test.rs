// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! WHERE THE PLAYER'S THINGS LIVE, and the one time that moves — the peer of
//! `electron/tests/user-data_test.ts`.
//!
//! The move is conservative in both directions, and both directions are a way
//! to lose somebody's window layout, mods and launch history: moving onto a
//! folder that already exists overwrites a fresh install, and merging two would
//! mean guessing which one is real.

use std::path::{Path, PathBuf};

use adastrail_shell::user_data::{
    plan_user_data_move, user_data_dir, UserDataMove, APP_DIR_NAME, LEGACY_DIR_NAMES,
};

/// A fake filesystem: the set of directories that exist.
fn existing(paths: &[PathBuf]) -> impl Fn(&Path) -> bool + '_ {
    move |path: &Path| paths.iter().any(|candidate| candidate == path)
}

#[test]
fn a_fresh_install_moves_nothing() {
    let root = Path::new("/appdata");
    assert_eq!(plan_user_data_move(root, &existing(&[])), None);
}

#[test]
fn an_install_that_already_has_the_folder_is_left_alone() {
    // Either a fresh install or a migration that already happened. Both are
    // "do not touch".
    let root = Path::new("/appdata");
    let ours = user_data_dir(root);
    assert_eq!(plan_user_data_move(root, &existing(&[ours])), None);
}

#[test]
fn the_folder_is_the_declared_name_rather_than_the_bundle_identifier() {
    // Tauri would name it after the reverse-domain identifier, which nobody has
    // ever seen. The executable's own name is the one the docs can print.
    assert_eq!(
        user_data_dir(Path::new("/appdata")),
        Path::new("/appdata").join(APP_DIR_NAME)
    );
    assert!(
        !APP_DIR_NAME.contains('.'),
        "a path segment, not a bundle id"
    );
    assert!(
        !APP_DIR_NAME.contains(' ') && !APP_DIR_NAME.contains('\''),
        "an apostrophe must never reach a path"
    );
}

#[test]
fn the_tauri_shell_keeps_its_own_folder_while_both_shells_exist() {
    // Two desktop shells are installable at once during the migration, and two
    // running games sharing one window-state.json and one launch.log is a fight
    // neither can win. The day only one desktop wrapper is left is what
    // changes this word.
    assert_ne!(
        APP_DIR_NAME, "adastrail",
        "sharing the other desktop build's folder is a decision, not a default"
    );
}

#[test]
fn a_legacy_folder_is_adopted_rather_than_orphaned() {
    // LEGACY_DIR_NAMES is empty today — this shell has shipped under one name —
    // so the test drives the planner the way that rename will, through the
    // same seam rather than through a second code path written later.
    let root = Path::new("/appdata");
    let Some(legacy) = LEGACY_DIR_NAMES.first() else {
        assert!(
            plan_user_data_move(root, &existing(&[root.join("anything-else")])).is_none(),
            "with no legacy names, nothing is ever adopted"
        );
        return;
    };
    let from = root.join(legacy);
    let planned = plan_user_data_move(root, &existing(std::slice::from_ref(&from)));
    assert_eq!(
        planned,
        Some(UserDataMove {
            from,
            to: user_data_dir(root)
        })
    );
}
