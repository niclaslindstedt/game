// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! THE WINDOW SYSTEM THAT ISN'T THERE.
//!
//! The refusal has to be narrow in one direction and wide in the other: a shell
//! that refuses to start on a machine that COULD have run it is a worse bug
//! than the stack trace it replaces, and a shell that lets the event-loop
//! library unwrap a missing display greets a developer with fourteen frames of
//! backtrace instead of a sentence.

use adastrail_shell::display::{panic_report, refuse_windowless};

/// An environment holding exactly these variables.
fn env<'a>(pairs: &'a [(&'a str, &'a str)]) -> impl Fn(&str) -> Option<String> + 'a {
    move |name| {
        pairs
            .iter()
            .find(|(key, _)| *key == name)
            .map(|(_, value)| (*value).to_string())
    }
}

#[test]
fn a_linux_session_with_no_display_at_all_is_refused_with_a_sentence() {
    let refusal = refuse_windowless("linux", &env(&[])).expect("a refusal");
    assert!(refusal.contains("DISPLAY"), "{refusal}");
    assert!(refusal.contains("WAYLAND_DISPLAY"), "{refusal}");
    // The three ordinary causes, because the reader is somebody who expected
    // the game to start and got nothing.
    assert!(refusal.contains("SSH"), "{refusal}");
    assert!(refusal.contains("container"), "{refusal}");
}

#[test]
fn either_display_variable_is_enough() {
    assert_eq!(refuse_windowless("linux", &env(&[("DISPLAY", ":0")])), None);
    assert_eq!(
        refuse_windowless("linux", &env(&[("WAYLAND_DISPLAY", "wayland-0")])),
        None
    );
    assert_eq!(
        refuse_windowless(
            "linux",
            &env(&[("DISPLAY", ":0"), ("WAYLAND_DISPLAY", "wayland-1")])
        ),
        None
    );
}

#[test]
fn an_empty_display_variable_counts_as_unset() {
    // `DISPLAY=` in an environment is how a launcher spells "I cleared this",
    // and treating it as a display leaves the backtrace exactly where it was.
    assert!(refuse_windowless("linux", &env(&[("DISPLAY", "")])).is_some());
}

#[test]
fn the_other_two_desktops_are_never_refused_this_way() {
    // A platform fact rather than an omission: macOS and Windows have no
    // equivalent of an absent display server, so a check here could only ever
    // produce a false refusal.
    for os in ["macos", "windows"] {
        assert_eq!(refuse_windowless(os, &env(&[])), None, "{os}");
    }
}

#[test]
fn a_panic_is_reported_as_a_line_with_its_cause_and_its_place() {
    let report = panic_report("index out of bounds", Some("src/window.rs:42".to_string()));
    assert!(report.contains("index out of bounds"), "{report}");
    assert!(report.contains("src/window.rs:42"), "{report}");
}

#[test]
fn a_panic_with_no_location_still_carries_its_cause() {
    // The location is optional in the standard hook's own payload, and a report
    // that lost the message because there was no line number would be the one
    // useless outcome.
    let report = panic_report("the event loop could not start", None);
    assert!(
        report.contains("the event loop could not start"),
        "{report}"
    );
    assert!(!report.contains(" at "), "{report}");
}
