// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! THE MODS SEAM's rules — which folders hold mods, which of them may be
//! published, and what crosses to the page.
//!
//! The one that matters most is [`is_local_mod`]: `folder` is the ONE path the
//! page hands INWARD, publishing is an upload, and a folder outside the
//! player's own mods directory is not something the page has any business
//! naming.

use std::path::{Path, PathBuf};

use adastrail_shell::mods::{
    archive_stamp, folder_key, is_local_mod, list_event, local_mods_dir, parse, portable_mods_path,
    publish_event, read_item_id, safe_slug, workshop_url, InstalledMod, ModSource, PortableEnv,
    PublishOutcome, RevealTarget,
};
use serde_json::{json, Value};

fn env(packaged: bool, platform: &str) -> PortableEnv {
    PortableEnv {
        packaged,
        platform: platform.to_string(),
        exe_dir: PathBuf::from("/Applications/Adas Trail.app/Contents/MacOS"),
        cwd: PathBuf::from("/home/nic/game"),
    }
}

#[test]
fn a_reveal_names_one_of_two_folders_and_never_a_path() {
    // The page picking from a closed set is what keeps "open this in the file
    // manager" from becoming "open anything on this disk in the file manager".
    let local = parse(&json!({ "action": "reveal", "which": "local" }));
    assert_eq!(local.which, RevealTarget::Local);
    assert_eq!(
        parse(&json!({ "action": "reveal", "which": "portable" })).which,
        RevealTarget::Portable
    );
    // Anything else — including a path — falls back to the authoring folder
    // rather than being honoured.
    assert_eq!(
        parse(&json!({ "action": "reveal", "which": "/etc" })).which,
        RevealTarget::Local
    );
    assert_eq!(
        parse(&json!({ "action": "reveal" })).which,
        RevealTarget::Local
    );
}

#[test]
fn a_publish_may_only_name_a_folder_inside_the_authoring_directory() {
    let root = Path::new("/home/nic/.local/share/adastrail-tauri/mods");
    assert!(is_local_mod(
        Path::new("/home/nic/.local/share/adastrail-tauri/mods/greenhouse"),
        root
    ));

    // The directory itself is not a mod, and neither is anything beside it.
    assert!(!is_local_mod(root, root));
    assert!(!is_local_mod(
        Path::new("/home/nic/.local/share/adastrail-tauri/mods-elsewhere/x"),
        root
    ));
    assert!(!is_local_mod(Path::new("/etc"), root));
    // …and `..` cannot climb out of it, which is the whole reason the check is
    // lexical rather than a string prefix.
    assert!(!is_local_mod(
        Path::new("/home/nic/.local/share/adastrail-tauri/mods/../../secrets"),
        root
    ));
    // A path that leans on `.` and `..` and still lands inside is fine.
    assert!(is_local_mod(
        Path::new("/home/nic/.local/share/adastrail-tauri/mods/./a/../greenhouse"),
        root
    ));
}

#[test]
fn macos_has_no_folder_beside_the_app_and_that_is_the_platform_rather_than_an_omission() {
    // An installed app lives in /Applications, which the player does not own —
    // and writing inside the bundle breaks the signature it is notarized under.
    assert_eq!(portable_mods_path(&env(true, "macos")), None);
    assert_eq!(
        portable_mods_path(&env(true, "windows")),
        Some(PathBuf::from(
            "/Applications/Adas Trail.app/Contents/MacOS/mods"
        ))
    );
    // Unpackaged is a developer's own tree on every platform, macOS included.
    assert_eq!(
        portable_mods_path(&env(false, "macos")),
        Some(PathBuf::from("/home/nic/game/mods"))
    );
}

#[test]
fn the_authoring_folder_hangs_off_the_apps_own_user_data() {
    assert_eq!(
        local_mods_dir(Path::new("/home/nic/.local/share/adastrail-tauri")),
        PathBuf::from("/home/nic/.local/share/adastrail-tauri/mods")
    );
}

#[test]
fn a_mod_that_did_not_compile_crosses_with_its_reasons() {
    // A silent omission would leave a subscriber with an empty list and no way
    // to find out why the thing they paid attention to is not playable.
    let broken = InstalledMod {
        key: "3141592".to_string(),
        folder: "/steam/workshop/3141592".to_string(),
        source: ModSource::Workshop,
        bundle: Value::Null,
        errors: vec!["items/spade.yaml: unknown field `dmg`".to_string()],
        needs_update: true,
    };
    let event = list_event(
        5,
        std::slice::from_ref(&broken),
        Path::new("/home/nic/mods"),
        None,
    );
    assert_eq!(event["ok"], json!(true), "the LIST succeeded");
    assert_eq!(event["mods"][0]["bundle"], Value::Null);
    assert_eq!(
        event["mods"][0]["errors"][0],
        json!("items/spade.yaml: unknown field `dmg`")
    );
    assert_eq!(event["mods"][0]["source"], json!("workshop"));
    assert_eq!(event["mods"][0]["needsUpdate"], json!(true));
    // macOS has no portable folder, and the page draws one row fewer for it.
    assert_eq!(event["folders"]["portable"], Value::Null);
    assert_eq!(event["folders"]["local"], json!("/home/nic/mods"));
}

#[test]
fn the_agreement_is_its_own_outcome_because_it_is_the_one_the_player_must_act_on() {
    // Steam refuses to SHOW an item until its author accepts the Workshop terms
    // in a browser — and the item exists in the meantime, invisible.
    let event = publish_event(
        6,
        &PublishOutcome::Published {
            item_id: "3141592".to_string(),
            needs_to_accept_agreement: true,
        },
    );
    assert_eq!(event["ok"], json!(true));
    assert_eq!(event["itemId"], json!("3141592"));
    assert_eq!(event["needsToAcceptAgreement"], json!(true));

    let refused = publish_event(
        6,
        &PublishOutcome::Refused {
            reason: "not-a-mod",
            detail: None,
        },
    );
    assert_eq!(refused["reason"], json!("not-a-mod"));
    assert!(refused.get("detail").is_none());
}

#[test]
fn the_workshop_door_is_built_from_our_own_app_id() {
    // The one thing this action must not become is an open-arbitrary-URL
    // channel, so nothing the page sent reaches the string.
    assert_eq!(workshop_url(480), "steam://url/SteamWorkshopPage/480");
}

#[test]
fn an_archive_is_re_extracted_when_the_file_changes_and_not_before() {
    // Keyed by size and modification time, so replacing a zip with a newer one
    // is picked up on the next list and a launch that changed nothing pays a
    // stat instead of an unpack.
    assert_eq!(
        archive_stamp(4_096, 1_700_000_000_000),
        "4096-1700000000000"
    );
    assert_ne!(archive_stamp(4_096, 1), archive_stamp(4_097, 1));
}

#[test]
fn an_archives_own_name_becomes_a_name_and_nothing_else() {
    // It is a filename the player chose, and it is about to be a path.
    assert_eq!(safe_slug("greenhouse"), "greenhouse");
    assert_eq!(safe_slug("green house v2"), "green-house-v2");
    assert_eq!(safe_slug("../../etc/passwd"), "etc-passwd");
    assert_eq!(safe_slug("...."), "archive");
    assert_eq!(safe_slug(""), "archive");
    assert!(safe_slug(&"x".repeat(200)).len() <= 64);
}

#[test]
fn a_row_is_keyed_by_where_it_came_from() {
    assert_eq!(
        folder_key(ModSource::Local, "greenhouse"),
        "local:greenhouse"
    );
    assert_eq!(
        folder_key(ModSource::Portable, "sent.zip"),
        "portable:sent.zip"
    );
}

#[test]
fn a_remembered_workshop_id_is_a_number_or_it_is_nothing() {
    // The id lives beside the mod so that copying the folder to another machine
    // still updates the same item rather than minting a second one — and a
    // file somebody edited must not become a publish against a stranger's item.
    assert_eq!(read_item_id("3141592\n"), Some("3141592".to_string()));
    assert_eq!(read_item_id("  3141592  "), Some("3141592".to_string()));
    assert_eq!(read_item_id(""), None);
    assert_eq!(read_item_id("not an id"), None);
    assert_eq!(read_item_id("314 592"), None);
}
