// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! LEADERBOARDS — the bridge that is wired up with nothing behind it, and the
//! finding that keeps it that way.
//!
//! The shipped answer is `available: false` on every question, and that is what
//! the first test pins. The rest exercise the bridge against a provider that
//! does not exist yet, because the whole point of wiring it up early is that
//! adding one should be a file rather than a protocol.

use adastrail_shell::leaderboards::{handle, map_entries, parse};
use adastrail_shell::leaderboards_provider::{
    leaderboards_provider, LeaderboardsProvider, ScoreEntry,
};
use serde_json::{json, Value};

#[derive(Default)]
struct Fake {
    unknown: &'static [&'static str],
}

impl LeaderboardsProvider for Fake {
    fn id(&self) -> &'static str {
        "steam"
    }
    fn is_available(&self) -> bool {
        true
    }
    fn submit(&self, _entries: &[ScoreEntry]) -> bool {
        true
    }
    fn show(&self, _key: Option<&str>) -> bool {
        true
    }
    fn platform_id(&self, key: &str) -> Option<String> {
        (!key.is_empty() && !self.unknown.contains(&key)).then(|| key.to_string())
    }
}

fn answer(message: Value, provider: Option<&dyn LeaderboardsProvider>) -> Option<Value> {
    handle(&parse(&message), provider)
}

#[test]
fn this_shell_ships_no_board_and_says_so_plainly() {
    // The seam's own finding: submitting is possible with the Rust binding, but
    // there is no board a player on this shell could ever look at — no game-side
    // screen, and no Steam overlay to open. A row that appears and opens nothing
    // is worse than a row that never appears.
    assert!(leaderboards_provider().is_none());
    let status = answer(json!({ "action": "status", "requestId": 1 }), None).expect("an event");
    assert_eq!(status["ok"], json!(true));
    assert_eq!(status["available"], json!(false));
    assert!(status.get("provider").is_none());
}

#[test]
fn every_action_is_answered_even_with_nothing_behind_it() {
    // A protocol that answers nothing is a page waiting out a timeout.
    for action in ["status", "submit", "show"] {
        let event = answer(json!({ "action": action, "requestId": 6 }), None)
            .unwrap_or_else(|| panic!("{action} must be answered"));
        assert_eq!(event["requestId"], json!(6));
    }
    assert_eq!(answer(json!({ "action": "init" }), None), None, "the hello");
}

#[test]
fn nothing_the_page_sent_reaches_a_board_unvalidated() {
    let fake = Fake {
        unknown: &["retired_board"],
    };
    let entries = vec![
        json!({ "key": 3, "value": 10 }),               // not a string
        json!({ "key": "retired_board", "value": 10 }), // the platform drops it
        json!({ "key": "deepest_run" }),                // nothing to submit
        json!({ "key": "kills", "value": "10" }),       // not a number
        json!({ "key": "kills", "value": 10.6 }),       // rounded, not truncated
    ];
    assert_eq!(
        map_entries(&entries, &fake),
        vec![ScoreEntry {
            key: "kills".to_string(),
            value: 11,
        }]
    );
}

#[test]
fn a_batch_this_platform_cannot_carry_is_delivered_rather_than_refused() {
    let fake = Fake {
        unknown: &["retired_board"],
    };
    let event = answer(
        json!({
            "action": "submit",
            "requestId": 2,
            "entries": [{ "key": "retired_board", "value": 1 }],
        }),
        Some(&fake),
    )
    .expect("an event");
    assert_eq!(event["ok"], json!(true), "a success, or it retries forever");
}

#[test]
fn a_board_the_portal_does_not_know_opens_the_whole_list_instead() {
    // An unknown key would present an empty board; the whole list is never
    // wrong.
    let fake = Fake {
        unknown: &["retired_board"],
    };
    let event = answer(
        json!({ "action": "show", "requestId": 2, "key": "retired_board" }),
        Some(&fake),
    )
    .expect("an event");
    assert_eq!(event["ok"], json!(true));
}
