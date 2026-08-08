// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! THE ROSTER CHECK — "the cloud holds the roster that went into it", reduced
//! to one command per desktop build.
//!
//! Two failure modes are worth more than the rest of this file put together,
//! and both are the kind that pass:
//!
//!  1. **A check that clears because it compared a shell against itself.** Both
//!     invocations look identical in a terminal history, and the digests match
//!     for the least interesting reason there is.
//!  2. **A restore that flattens the roster it was called to verify.** A
//!     verification tool with a destructive door has to refuse that door by
//!     default, or the first bad evening costs a real player's heroes.

use adastrail_shell::cloud_provider::{CloudPlayer, CloudRead};
use adastrail_shell::roster::{
    blob_of, compare, digest, envelope, refuse_restore, roster_mode, RosterMode, RosterReport,
    Verdict,
};
use serde_json::Value;

/// A save envelope the way `pwa/src/game/cloud-save.ts` writes one.
fn save(heroes: &[&str], written_by: &str) -> String {
    let characters: Vec<String> = heroes
        .iter()
        .map(|name| format!(r#"{{"id":"h-{name}","name":"{name}"}}"#))
        .collect();
    format!(
        r#"{{"format":"adas-trail/cloud-save","version":1,"writtenAt":1700000000000,
            "writtenBy":"{written_by}","characters":[{}],"tombstones":{{"h-old":1}},
            "coins":{{}},"scores":{{}},"driveScores":[]}}"#,
        characters.join(",")
    )
}

fn report(shell: &str, read: CloudRead) -> RosterReport {
    RosterReport {
        shell: shell.to_string(),
        provider: Some("steam".to_string()),
        available: true,
        player: Some(CloudPlayer {
            id: "76561".to_string(),
            name: "Ada".to_string(),
        }),
        read,
    }
}

#[test]
fn the_modes_are_read_off_a_command_line() {
    let argv =
        |line: &str| -> Vec<String> { line.split_whitespace().map(str::to_string).collect() };
    assert_eq!(roster_mode(&argv("--fullscreen")), None);
    assert_eq!(
        roster_mode(&argv("--roster-check")),
        Some(RosterMode::Check {
            out: None,
            against: None
        })
    );
    assert_eq!(
        roster_mode(&argv("--roster-check --out a.json --against b.json")),
        Some(RosterMode::Check {
            out: Some("a.json".into()),
            against: Some("b.json".into())
        })
    );
    assert_eq!(
        roster_mode(&argv("--roster-restore a.json --overwrite")),
        Some(RosterMode::Restore {
            file: "a.json".into(),
            overwrite: true
        })
    );
}

#[test]
fn a_flag_whose_value_is_missing_does_not_swallow_the_next_flag() {
    // `--out --against b.json` is a typo somebody makes at the end of a long
    // evening, and reading `--against` as a FILE NAME would write the report to
    // a file called `--against` and then compare against nothing.
    let argv: Vec<String> = "--roster-check --out --against b.json"
        .split_whitespace()
        .map(str::to_string)
        .collect();
    assert_eq!(
        roster_mode(&argv),
        Some(RosterMode::Check {
            out: None,
            against: Some("b.json".into())
        })
    );
}

#[test]
fn the_envelope_census_reads_what_the_game_stamps() {
    let envelope = envelope(&save(&["Ada", "Bex"], "steam-deck")).expect("an envelope");
    assert_eq!(envelope.format, "adas-trail/cloud-save");
    assert_eq!(envelope.version, 1);
    assert_eq!(envelope.heroes, vec!["Ada".to_string(), "Bex".to_string()]);
    assert_eq!(envelope.tombstones, 1);
    assert_eq!(envelope.written_by, "steam-deck");
}

#[test]
fn a_payload_from_a_format_this_build_does_not_know_is_reported_rather_than_refused() {
    // "the other shell wrote something this build cannot parse" is a FINDING.
    let envelope = envelope(r#"{"format":"adas-trail/cloud-save","version":9}"#).expect("read");
    assert_eq!(envelope.version, 9);
    assert!(envelope.heroes.is_empty());

    // …but bytes that are not a document at all are not an envelope.
    assert!(envelope_is_none("not json at all"));
    assert!(envelope_is_none("[1,2,3]"));
}

fn envelope_is_none(blob: &str) -> bool {
    envelope(blob).is_none()
}

#[test]
fn the_fingerprint_carries_the_length_in_front_of_the_hash() {
    let blob = save(&["Ada"], "desktop");
    assert_eq!(digest(&blob), digest(&blob));
    assert_ne!(digest(&blob), digest(&save(&["Ada", "Bex"], "desktop")));
    assert!(digest("abc").starts_with("3-"));
}

#[test]
fn a_read_that_failed_is_never_reported_as_an_empty_cloud() {
    // The distinction the whole seam is built around. A verification that
    // called an unreachable cloud "empty" sends somebody hunting a sync bug
    // that is not there.
    let failed = report("tauri", CloudRead::Failed).describe();
    assert!(failed.contains("THE READ FAILED"), "{failed}");
    assert!(
        failed.contains("not the same as an empty cloud"),
        "{failed}"
    );

    let missing = report("tauri", CloudRead::Missing).describe();
    assert!(missing.contains("nothing stored"), "{missing}");
}

#[test]
fn a_report_names_the_heroes_it_found() {
    let described = report(
        "electron",
        CloudRead::Blob(save(&["Ada", "Bex"], "desktop")),
    )
    .describe();
    assert!(described.contains("the electron shell"), "{described}");
    assert!(described.contains("Ada, Bex"), "{described}");
    assert!(described.contains("written by desktop"), "{described}");
}

#[test]
fn bytes_that_are_not_a_save_are_reported_as_unreadable_rather_than_as_empty() {
    let described = report("tauri", CloudRead::Blob("garbage".to_string())).describe();
    assert!(described.contains("UNREADABLE"), "{described}");
    // …and the size and fingerprint are still there, because "there IS
    // something under the key and it is 7 bytes" is the useful half.
    assert!(described.contains("7 bytes"), "{described}");
}

#[test]
fn two_shells_reading_the_same_roster_is_the_verdict_that_clears_a_handover() {
    let blob = save(&["Ada"], "desktop");
    let mine = report("tauri", CloudRead::Blob(blob.clone())).document();
    let theirs = report("electron", CloudRead::Blob(blob)).document();

    let (verdict, lines) = compare(&mine, &theirs);
    assert_eq!(verdict, Verdict::Same);
    assert!(lines.join(" ").contains("SAME roster"));
}

#[test]
fn comparing_a_shell_against_itself_proves_nothing_and_says_so() {
    // The most likely way to run this wrong: both invocations look identical in
    // a terminal history, and the digests match for the least interesting
    // reason there is.
    let blob = save(&["Ada"], "desktop");
    let mine = report("tauri", CloudRead::Blob(blob.clone())).document();
    let same_shell = report("tauri", CloudRead::Blob(blob)).document();

    let (verdict, lines) = compare(&mine, &same_shell);
    assert_eq!(verdict, Verdict::Inconclusive);
    assert!(lines.join(" ").contains("one report from each"));
}

#[test]
fn different_rosters_point_at_the_two_reasons_they_can_differ() {
    let mine = report("tauri", CloudRead::Blob(save(&["Ada"], "desktop"))).document();
    let theirs = report("electron", CloudRead::Blob(save(&["Bex"], "steam-deck"))).document();

    let (verdict, lines) = compare(&mine, &theirs);
    assert_eq!(verdict, Verdict::Different);
    let explanation = lines.join(" ");
    assert!(explanation.contains("write half"), "{explanation}");
    assert!(explanation.contains("Steam account"), "{explanation}");
}

#[test]
fn an_unreachable_cloud_on_either_side_is_inconclusive_rather_than_a_failure() {
    // "the test did not run" and "the test failed" are different answers, and
    // conflating them is how a precondition gets signed off on a laptop with
    // Steam closed.
    let mine = report("tauri", CloudRead::Blob(save(&["Ada"], "desktop"))).document();
    let theirs = report("electron", CloudRead::Failed).document();

    let (verdict, lines) = compare(&mine, &theirs);
    assert_eq!(verdict, Verdict::Inconclusive);
    assert!(lines.join(" ").contains("no roster to compare"));
}

#[test]
fn a_file_that_is_not_a_report_is_refused_before_it_is_compared() {
    let mine = report("tauri", CloudRead::Blob(save(&["Ada"], "desktop"))).document();
    let (verdict, lines) = compare(&mine, &serde_json::json!({ "shell": "electron" }));
    assert_eq!(verdict, Verdict::Inconclusive);
    assert!(lines.join(" ").contains("not a roster report"));
}

#[test]
fn the_report_carries_the_blob_so_the_same_file_can_restore_it() {
    let blob = save(&["Ada"], "desktop");
    let document = report("tauri", CloudRead::Blob(blob.clone())).document();
    assert_eq!(blob_of(&document), Some(blob));
    assert_eq!(document["envelope"]["heroes"][0], "Ada");
    assert_eq!(document["kind"], "adas-trail/roster-report");

    // A report with no roster in it has no blob to give back.
    assert_eq!(
        blob_of(&report("tauri", CloudRead::Missing).document()),
        None
    );
}

#[test]
fn a_restore_will_not_flatten_a_different_roster_without_being_told_to() {
    let incoming = save(&["Ada"], "desktop");
    let existing = CloudRead::Blob(save(&["Bex", "Cyd"], "steam-deck"));

    let refusal = refuse_restore(&incoming, &existing, false).expect("a refusal");
    assert!(refusal.contains("--overwrite"), "{refusal}");
    assert!(refusal.contains("2 hero(es)"), "{refusal}");

    assert_eq!(refuse_restore(&incoming, &existing, true), None);
}

#[test]
fn restoring_the_identical_bytes_needs_no_ceremony() {
    // Refusing the harmless case is how somebody learns to type --overwrite
    // without reading the line above it.
    let blob = save(&["Ada"], "desktop");
    let existing = CloudRead::Blob(blob.clone());
    assert_eq!(refuse_restore(&blob, &existing, false), None);
}

#[test]
fn an_empty_cloud_takes_a_restore_and_an_unreadable_one_does_not() {
    let blob = save(&["Ada"], "desktop");
    assert_eq!(refuse_restore(&blob, &CloudRead::Missing, false), None);

    let refusal = refuse_restore(&blob, &CloudRead::Failed, true).expect("a refusal");
    assert!(
        refusal.contains("no telling what this would replace"),
        "{refusal}"
    );
}

#[test]
fn a_launch_with_no_cloud_at_all_says_which_three_things_cause_that() {
    let described = RosterReport {
        shell: "tauri".to_string(),
        provider: None,
        available: false,
        player: None,
        read: CloudRead::Failed,
    }
    .describe();
    assert!(described.contains("GIS_STEAM=off"), "{described}");

    let document = RosterReport {
        shell: "tauri".to_string(),
        provider: None,
        available: false,
        player: None,
        read: CloudRead::Failed,
    }
    .document();
    assert_eq!(document["provider"], Value::Null);
    assert_eq!(document["read"], "failed");
}
