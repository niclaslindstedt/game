// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! THE COLD-START RECORDER — the one module whose bugs are invisible by
//! construction: a startup number that is quietly wrong still looks like a
//! startup number, and it is read once, in a table, next to another build's.
//!
//! So what is asserted here is not "it records a number" but the three ways a
//! recorded number could lie: a mark that went backwards, a mark neither shell
//! agreed to, and a launch that never reached the page reporting a fast total.

use adastrail_shell::metrics::{
    known_mark, rotate, StartupMetrics, FIRST_MARK, KEEP_LAUNCHES, LAST_MARK, MARKS,
};
use serde_json::Value;

#[test]
fn the_mark_vocabulary_is_ordered_and_starts_where_it_says() {
    // The list IS the contract with `electron/src/metrics.ts`, and
    // `scripts/shell-parity.mjs` reads both. These two are what the rest of the
    // module indexes by name.
    assert_eq!(MARKS.first().map(|(mark, _)| *mark), Some(FIRST_MARK));
    assert_eq!(MARKS.last().map(|(mark, _)| *mark), Some(LAST_MARK));
    assert!(known_mark("window-shown"));
    assert!(!known_mark("first-frame"), "no shell can see one");
}

#[test]
fn every_mark_says_what_it_means() {
    // A mark with no prose beside it is one the next reader guesses at, and a
    // guessed mark is a comparison between two different events.
    for (mark, meaning) in MARKS {
        assert!(!meaning.is_empty(), "{mark} has no explanation");
    }
}

#[test]
fn a_full_launch_reports_its_total_and_its_steps() {
    let mut metrics = StartupMetrics::new();
    metrics.mark("process", 0);
    metrics.mark("shell-resolved", 120);
    metrics.mark("window-created", 180);
    metrics.mark("window-shown", 210);
    metrics.mark("page-loaded", 640);

    assert!(metrics.complete());
    assert_eq!(metrics.cold_start_ms(), Some(640));

    // The log line is INTERVALS, because the reader's question is what each
    // step cost and subtracting five numbers by hand is how they get it wrong.
    let summary = metrics.summary();
    assert!(summary.contains("640ms total"), "{summary}");
    assert!(summary.contains("shell-resolved +120ms"), "{summary}");
    assert!(summary.contains("page-loaded +430ms"), "{summary}");
}

#[test]
fn a_launch_that_never_reached_the_page_reports_no_total() {
    // The failure this prevents: a build that dies before the window appears
    // lands in the bench table as the FASTEST one in the run.
    let mut metrics = StartupMetrics::new();
    metrics.mark("process", 0);
    metrics.mark("shell-resolved", 90);

    assert!(!metrics.complete());
    assert_eq!(metrics.cold_start_ms(), None);
    assert!(metrics.summary().contains("incomplete"));

    let document = metrics.document("tauri", "1.2.3", 1700000000);
    assert_eq!(document["complete"], Value::Bool(false));
    assert_eq!(document["coldStartMs"], Value::Null);
}

#[test]
fn a_mark_that_went_backwards_is_flattened_rather_than_recorded() {
    // Real cause: a coarse platform clock, or a mark taken on a thread that
    // started before the one that stamped the previous mark. A negative
    // interval inside a median is a number nobody can see is wrong.
    let mut metrics = StartupMetrics::new();
    metrics.mark("process", 0);
    metrics.mark("shell-resolved", 300);
    metrics.mark("window-created", 250);

    assert_eq!(metrics.at("window-created"), Some(300));
    // Flattened to zero rather than reported as a step of minus fifty.
    let summary = metrics.summary();
    assert!(summary.contains("window-created +0ms"), "{summary}");
    assert!(!summary.contains("+-"), "{summary}");
}

#[test]
fn a_mark_neither_shell_agreed_to_is_dropped_and_said_so() {
    let mut metrics = StartupMetrics::new();
    metrics.mark("process", 0);
    metrics.mark("splash-gone", 10);

    assert_eq!(metrics.at("splash-gone"), None);
    assert_eq!(metrics.marks().len(), 1);
    let notes = metrics.document("tauri", "1.2.3", 0)["notes"].to_string();
    assert!(notes.contains("splash-gone"), "{notes}");
}

#[test]
fn stamping_the_same_mark_twice_keeps_the_first() {
    // The second stamp is always the later one, so taking it would quietly
    // inflate the step before it.
    let mut metrics = StartupMetrics::new();
    metrics.mark("process", 0);
    metrics.mark("window-shown", 200);
    metrics.mark("window-shown", 900);

    assert_eq!(metrics.at("window-shown"), Some(200));
}

#[test]
fn a_launch_that_is_not_a_fair_sample_says_why() {
    let mut metrics = StartupMetrics::new();
    metrics.mark("process", 0);
    metrics.note("GIS_GAME_URL was set — this launch loaded a remote site");

    let notes = metrics.document("tauri", "1.2.3", 0)["notes"].to_string();
    assert!(notes.contains("remote site"), "{notes}");
}

#[test]
fn the_document_names_the_shell_that_wrote_it() {
    // Both shells append to a file of the same name in folders a bench harness
    // is told about separately; a line that did not say which build wrote it
    // would be unattributable the moment one is copied into a bug report.
    let mut metrics = StartupMetrics::new();
    metrics.mark("process", 0);
    metrics.mark("shell-resolved", 5);
    metrics.mark("window-created", 6);
    metrics.mark("window-shown", 7);
    metrics.mark("page-loaded", 8);

    let document = metrics.document("tauri", "0.9.0", 1700000000);
    assert_eq!(document["shell"], "tauri");
    assert_eq!(document["version"], "0.9.0");
    assert_eq!(document["coldStartMs"], 8);
    assert_eq!(document["marks"]["window-shown"], 7);
    assert!(document["os"].is_string());
}

#[test]
fn the_file_keeps_the_newest_launches_and_drops_the_oldest() {
    let mut file = String::new();
    for launch in 0..(KEEP_LAUNCHES + 5) {
        file = rotate(&file, &format!(r#"{{"n":{launch}}}"#));
    }
    let lines: Vec<&str> = file.lines().collect();
    assert_eq!(lines.len(), KEEP_LAUNCHES);
    assert_eq!(lines[0], format!(r#"{{"n":{}}}"#, 5));
    assert_eq!(
        lines[KEEP_LAUNCHES - 1],
        format!(r#"{{"n":{}}}"#, KEEP_LAUNCHES + 4)
    );
}

#[test]
fn a_half_written_line_from_a_killed_launch_is_thrown_away() {
    // The harness reads this file with a JSON parser, and a process killed
    // mid-append would otherwise leave a fragment at the top of it forever.
    let file = rotate("{\"n\":1}\n{\"n\":2,\"marks\":{\"pro", "{\"n\":3}");
    assert_eq!(file, "{\"n\":1}\n{\"n\":3}\n");
    for line in file.lines() {
        assert!(serde_json::from_str::<Value>(line).is_ok());
    }
}
