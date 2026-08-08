// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! FINDING THE THINGS THAT ARE NOT RUST — the two layouts, and the refusals
//! that turn a missing piece into one legible line instead of an OS error about
//! a path nobody recognises.

use std::path::{Path, PathBuf};

use adastrail_shell::runtime::{Resources, NODE_EXECUTABLE};

fn packaged() -> Resources {
    Resources::packaged("/opt/adastrail/resources")
}

fn checkout() -> Resources {
    Resources::checkout("/home/nic/game")
}

#[test]
fn the_packaged_layout_mirrors_the_repo_where_it_matters() {
    // The mod toolchain finds its neighbours by relative path
    // (`../../scripts/…`), so the packaged tree keeps `mod/tools/` intact and
    // only the root differs.
    let app = packaged();
    assert_eq!(
        app.mod_tools("build.mjs"),
        PathBuf::from("/opt/adastrail/resources/modtools/mod/tools/build.mjs")
    );
    assert_eq!(
        app.server_entry(),
        PathBuf::from("/opt/adastrail/resources/server/server/main.js")
    );
    assert_eq!(
        app.mod_compiler(),
        PathBuf::from("/opt/adastrail/resources/modtools/mod-compile.mjs")
    );
    assert!(app.is_packaged());
}

#[test]
fn a_checkout_reads_what_the_repos_own_build_already_produced() {
    // One compiler and one server, so "it works in my mod" and "it works in the
    // game" mean the same thing — building either a second time for this shell
    // would be two copies that could disagree.
    let repo = checkout();
    assert_eq!(
        repo.mod_tools("build.mjs"),
        PathBuf::from("/home/nic/game/mod/tools/build.mjs")
    );
    assert_eq!(
        repo.server_entry(),
        PathBuf::from("/home/nic/game/electron/server-dist/server/main.js")
    );
    assert_eq!(
        repo.mod_compiler(),
        PathBuf::from("/home/nic/game/tauri/scripts/mod-compile.mjs")
    );
    assert!(!repo.is_packaged());
    assert_eq!(repo.root(), Path::new("/home/nic/game"));
}

#[test]
fn the_reference_catalog_sits_beside_the_tools_in_both_shapes() {
    for app in [packaged(), checkout()] {
        let catalog = app.mod_catalog();
        assert!(catalog.ends_with("catalog.json"), "{}", catalog.display());
        assert!(catalog.to_string_lossy().contains("mod"));
    }
}

#[test]
fn a_packaged_build_carries_its_own_node_and_a_checkout_uses_the_one_that_built_it() {
    // A player has no reason to have Node; a developer built this tree with
    // one. The bundled path is absolute and cannot be shadowed by a PATH the
    // player never set up.
    assert_eq!(
        packaged().node(),
        PathBuf::from("/opt/adastrail/resources/runtime").join(NODE_EXECUTABLE)
    );
    assert_eq!(checkout().node(), PathBuf::from(NODE_EXECUTABLE));
}

#[test]
fn a_missing_piece_is_one_sentence_that_names_the_command_that_fixes_it() {
    // These paths do not exist on the test machine, which is exactly the case
    // the message is for.
    let repo = checkout();
    let sessions = repo.missing_for_sessions().expect("nothing is built here");
    assert!(sessions.contains("server-dist"), "{sessions}");
    assert!(sessions.contains("npm run server:build"), "{sessions}");

    let mods = repo.missing_for_mods().expect("nothing is built here");
    assert!(mods.contains("mod-compile.mjs"), "{mods}");
}

#[test]
fn a_checkouts_node_is_never_reported_missing() {
    // A bare `node` is resolved by the OS's own PATH search; a shell that tried
    // to resolve one itself would be re-implementing that search and getting it
    // wrong on somebody's version manager. The refusal above is about the
    // SERVER, which is a real path.
    let repo = checkout();
    let sessions = repo.missing_for_sessions().expect("the server is missing");
    assert!(
        !sessions.contains("Node runtime"),
        "a checkout's node is the developer's: {sessions}"
    );
}
