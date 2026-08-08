// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! ROUTING — which protocol a page message belongs to, and what a shell that
//! cannot yet answer it says about that.
//!
//! The second half is what makes this file worth having during the migration: a
//! phase-1 build meets six protocols it has no platform behind, and the failure
//! mode to avoid is the one where it drops them silently and the page waits out
//! a timeout with nothing in the log to explain it.

use adastrail_shell::bridge::{emit_script, explain, route, Route, IMPLEMENTED_THROUGH_PHASE};
use adastrail_shell::channels::event_global;
use serde_json::json;

/// A launch that may honour everything, so a refusal in a test is about the
/// PHASE rather than about a capability.
fn anything(_capability: &str) -> bool {
    true
}

/// A plain download: no mods, no multiplayer.
fn nothing(_capability: &str) -> bool {
    false
}

#[test]
fn quit_is_answered_from_phase_one() {
    // The one protocol with no platform behind it — and the only successful
    // outcome is the page ceasing to exist.
    assert_eq!(route(r#"{"__gisQuit":true}"#, &anything), Route::Quit);
    assert_eq!(explain(&Route::Quit), None, "nothing to explain");
}

#[test]
fn every_other_protocol_names_the_phase_that_grows_it() {
    for (flag, protocol, phase) in [
        ("__gisCloud", "cloud", 2),
        ("__gisAchievements", "achievements", 2),
        ("__gisScores", "scores", 2),
        ("__gisShots", "shots", 2),
        ("__gisMods", "mods", 3),
        ("__gisNet", "net", 3),
    ] {
        let raw = json!({ flag: true, "id": 7 }).to_string();
        assert_eq!(
            route(&raw, &anything),
            Route::Unimplemented { protocol, phase },
            "{flag} must route somewhere nameable"
        );
        assert!(
            phase > IMPLEMENTED_THROUGH_PHASE,
            "{protocol} claims a phase this build already shipped — route it \
             for real, or move it off Unimplemented"
        );
        let line = explain(&route(&raw, &anything)).expect("a line in the log");
        assert!(line.contains(protocol), "the log has to name the protocol");
        assert!(
            line.contains("docs/tauri-migration.md"),
            "and where the reader goes next"
        );
    }
}

#[test]
fn a_gated_protocol_is_refused_before_it_is_unimplemented() {
    // The page already hides both front doors, so this is the second half of
    // the same fact rather than a message anybody expects to send — but a
    // build that CAN'T is a different answer from one that WON'T, and the log
    // has to be able to tell them apart.
    let mods = route(r#"{"__gisMods":true}"#, &nothing);
    assert_eq!(
        mods,
        Route::Refused {
            protocol: "mods",
            capability: "mods"
        }
    );
    let line = explain(&mods).expect("a line");
    assert!(line.contains("no mods capability"));

    assert_eq!(
        route(r#"{"__gisNet":true}"#, &nothing),
        Route::Refused {
            protocol: "net",
            capability: "multiplayer"
        }
    );
}

#[test]
fn anything_that_is_not_the_bridge_is_ignored() {
    // The page has its own libraries posting their own things; a shell that
    // complained about each would drown its own log.
    for raw in [
        "not json at all",
        "[]",
        "null",
        r#""a string""#,
        r#"{"type":"webpackHotUpdate"}"#,
        r#"{"__gisCloud":false}"#,
        r#"{"__gisCloud":"yes"}"#,
    ] {
        assert_eq!(route(raw, &anything), Route::Ignored, "{raw}");
    }
}

#[test]
fn every_protocol_has_a_way_back_to_the_page() {
    // A route with no event global is a request that can be received and never
    // answered — the shape of a bug that presents as a hang.
    for protocol in ["cloud", "achievements", "scores", "mods", "net", "shots"] {
        assert!(
            event_global(protocol).is_some(),
            "{protocol} has no return path"
        );
    }
    assert_eq!(event_global("quit"), None, "quit is one-way by design");
}

#[test]
fn a_heros_name_cannot_break_out_of_the_return_path() {
    // U+2028/2029 are JSON-legal and terminate a line inside a JavaScript
    // literal, and a hero's name reaches this string.
    let script = emit_script("__gisCloudEvent", &json!({ "name": "Ada\u{2028}x" }));
    assert!(!script.contains('\u{2028}'), "must not survive raw");
    assert!(script.contains("\\u2028"));
    assert!(script.starts_with("try{window.__gisCloudEvent&&"));
}

#[test]
fn the_return_path_never_throws_into_the_page() {
    // A page mid-navigation has no callback yet; the shell must not turn that
    // into an uncaught error in the game's own console.
    let script = emit_script("__gisNetEvent", &json!({ "event": "invite" }));
    assert!(script.contains("catch(e){}"));
}
