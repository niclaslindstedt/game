// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! THE VOICE GATE — the thing the macOS microphone entitlement is a promise of.
//!
//! A build that was not deliberately given voice cannot ask for the microphone
//! at all: not because the page politely declines to, but because the shell
//! refuses. That is the whole reason voice is a BUILD capability rather than a
//! setting.

use adastrail_shell::media::{decide, explain, lockout_script, MediaRequest};

#[test]
fn the_microphone_is_the_one_grant_and_only_with_voice() {
    assert!(decide(MediaRequest::Audio, true));
    assert!(!decide(MediaRequest::Audio, false));
}

#[test]
fn the_camera_is_refused_even_with_voice_on() {
    // This game has no camera feature, so a request naming video is a request
    // nothing here makes — refused by naming the kind rather than by trusting
    // the page to only ever ask for audio.
    assert!(!decide(MediaRequest::Video, true));
    assert!(!decide(MediaRequest::AudioAndVideo, true));
}

#[test]
fn everything_else_is_refused_on_every_build() {
    // Geolocation, notifications, MIDI, pointer lock, the clipboard, the
    // filesystem, screen capture. Nothing here needs any of them, and a handler
    // that says no removes them from what a compromised dependency could reach.
    assert!(!decide(MediaRequest::Other, true));
    assert!(!decide(MediaRequest::Other, false));
}

#[test]
fn a_refusal_names_the_capability_when_that_is_what_decided_it() {
    // "permission refused: media" on a build somebody deliberately packaged
    // without voice reads as a bug; naming the capability reads as the answer.
    let line = explain(MediaRequest::Audio, false);
    assert!(line.contains("voice capability"), "{line}");
    assert!(explain(MediaRequest::Video, true).contains("no camera feature"));
    assert!(explain(MediaRequest::Audio, true).contains("granted"));
}

#[test]
fn a_build_without_voice_has_the_microphone_api_taken_away_from_the_page() {
    // The cross-platform floor: two of the three webviews expose no permission
    // seam Tauri surfaces, so the page is left unable to ask at all.
    let script = lockout_script(false);
    assert!(script.contains("mediaDevices"));
    assert!(
        script.contains("configurable: false"),
        "and cannot be put back"
    );
    // A `delete` would let a library re-add it; defining it non-configurable is
    // what makes the absence permanent for the life of the document.
    assert!(!script.contains("delete "));
}

#[test]
fn a_build_with_voice_keeps_the_api_and_lets_the_platform_decide_each_request() {
    assert_eq!(lockout_script(true), "");
}
