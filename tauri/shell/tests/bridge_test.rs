// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! ROUTING — which protocol a page message belongs to, and what a shell that
//! does not answer one says about that.
//!
//! The second half is what makes this file worth having: the page and the shell
//! are versioned separately, so a build WILL meet a protocol it has no route
//! for, and the failure mode to avoid is the one where it drops the message
//! silently and the page waits out a timeout with nothing in the log to explain
//! it.
//!
//! The protocol table is walked in BOTH directions, which is what keeps the
//! router honest: every protocol the page can post either routes to a bridge of
//! its own or is named in the log, and nothing may sit between the two.

use adastrail_shell::bridge::{
    action, emit_script, explain, parse_message, request_id, route, Route, PROTOCOLS,
};
use adastrail_shell::channels::event_global;
use serde_json::json;

/// A launch that may honour everything, so a refusal in a test is never about a
/// capability.
fn anything(_capability: &str) -> bool {
    true
}

/// A plain download: no mods, no multiplayer.
fn nothing(_capability: &str) -> bool {
    false
}

#[test]
fn quit_needs_no_platform_behind_it() {
    // The one protocol with no platform behind it — and the only successful
    // outcome is the page ceasing to exist.
    assert_eq!(route(r#"{"__gisQuit":true}"#, &anything), Route::Quit);
    assert_eq!(explain(&Route::Quit), None, "nothing to explain");
}

#[test]
fn a_protocol_this_build_has_grown_routes_to_its_own_bridge() {
    // All six. A route that fell back to `Unanswered` here would be a shell
    // that apologises in its log for a protocol it in fact answers.
    for (flag, expected) in [
        ("__gisCloud", Route::Cloud),
        ("__gisAchievements", Route::Achievements),
        ("__gisScores", Route::Scores),
        ("__gisShots", Route::Shots),
        ("__gisMods", Route::Mods),
        ("__gisNet", Route::Net),
    ] {
        let raw = json!({ flag: true, "action": "status" }).to_string();
        assert_eq!(route(&raw, &anything), expected, "{flag}");
        assert_eq!(
            explain(&route(&raw, &anything)),
            None,
            "{flag} is answered, so there is nothing to apologise for"
        );
    }
}

#[test]
fn every_listed_protocol_routes_somewhere_nameable() {
    // The invariant, checked from both ends: nothing may sit between "this
    // build answers it" and "this build says in the log that it does not".
    for (flag, protocol, _) in PROTOCOLS {
        let raw = json!({ *flag: true, "id": 7 }).to_string();
        let routed = route(&raw, &anything);
        assert_ne!(routed, Route::Ignored, "{flag} was dropped silently");
        if let Route::Unanswered { protocol: named } = routed {
            assert_eq!(named, *protocol);
            let line = explain(&routed).expect("a line in the log");
            assert!(line.contains(protocol), "the log has to name the protocol");
            assert!(
                line.contains("tauri/README.md"),
                "and where the reader goes next"
            );
        }
    }
}

#[test]
fn the_unanswered_route_still_explains_itself() {
    // Nothing this shell ships takes this route today, which is exactly why it
    // is worth a test: the next protocol the web side grows will be the first
    // message to reach it, on a build nobody is watching.
    let routed = Route::Unanswered {
        protocol: "telemetry",
    };
    let line = explain(&routed).expect("a line in the log");
    assert!(line.contains("telemetry"), "{line}");
    assert!(line.contains("tauri/README.md"), "{line}");
}

#[test]
fn a_gated_protocol_is_refused_before_it_is_unanswered() {
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
    for (_, protocol, _) in PROTOCOLS {
        assert!(
            event_global(protocol).is_some(),
            "{protocol} has no return path"
        );
    }
    assert_eq!(event_global("quit"), None, "quit is one-way by design");
}

#[test]
fn the_two_fields_every_bridge_reads_are_read_the_same_way() {
    // Four bridges ask the same two questions of every message, so they ask
    // them through one pair of functions rather than four copies that drift.
    let message =
        parse_message(r#"{"__gisCloud":true,"action":"save","requestId":12}"#).expect("an object");
    assert_eq!(action(&message), "save");
    assert_eq!(request_id(&message), 12);

    // A message with neither is answered on request 0 with an action nothing
    // matches — the page's own timeout is what resolves it, and inventing an id
    // here would answer a DIFFERENT request.
    let bare = parse_message(r#"{"__gisShots":true}"#).expect("an object");
    assert_eq!(action(&bare), "");
    assert_eq!(request_id(&bare), 0);

    assert_eq!(parse_message("[]"), None, "a bridge message is an object");
    assert_eq!(parse_message("nonsense"), None);
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
