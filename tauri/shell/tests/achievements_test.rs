// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! ACHIEVEMENTS' PROTOCOL, and the validation that stands between the page's
//! numbers and a platform API.
//!
//! The batch rules are the ones worth pinning: a refused batch is kept pending
//! and retried by the web side, so "there was nothing to send" and "the platform
//! said no" have to be different answers or a launch spends the rest of its life
//! re-reporting an empty list.

use std::sync::Mutex;

use adastrail_shell::achievements::{handle, map_entries, parse};
use adastrail_shell::achievements_provider::{
    AchievementEntry, AchievementsPlayer, AchievementsProvider,
};
use serde_json::{json, Value};

struct Fake {
    available: bool,
    accepts: bool,
    /// Ids this platform has never heard of, which `platform_id` drops.
    unknown: &'static [&'static str],
    reported: Mutex<Vec<AchievementEntry>>,
    shown: Mutex<u32>,
}

impl Default for Fake {
    fn default() -> Self {
        Self {
            available: true,
            accepts: true,
            unknown: &[],
            reported: Mutex::new(Vec::new()),
            shown: Mutex::new(0),
        }
    }
}

impl Fake {
    fn reported(&self) -> Vec<AchievementEntry> {
        self.reported.lock().expect("a fake's own lock").clone()
    }
}

impl AchievementsProvider for Fake {
    fn id(&self) -> &'static str {
        "steam"
    }
    fn is_available(&self) -> bool {
        self.available
    }
    fn identify(&self) -> Option<AchievementsPlayer> {
        Some(AchievementsPlayer {
            id: "76561198000000000".to_string(),
            name: "Ada".to_string(),
        })
    }
    fn report(&self, entries: &[AchievementEntry]) -> bool {
        self.reported
            .lock()
            .expect("a fake's own lock")
            .extend_from_slice(entries);
        self.accepts
    }
    fn show(&self) -> bool {
        *self.shown.lock().expect("a fake's own lock") += 1;
        true
    }
    fn platform_id(&self, badge_id: &str) -> Option<String> {
        if badge_id.is_empty() || self.unknown.contains(&badge_id) {
            return None;
        }
        Some(badge_id.to_string())
    }
}

fn answer(message: Value, provider: Option<&dyn AchievementsProvider>) -> Option<Value> {
    handle(&parse(&message), provider)
}

#[test]
fn the_hello_is_answered_with_silence() {
    assert_eq!(
        answer(json!({ "action": "init" }), Some(&Fake::default())),
        None
    );
}

#[test]
fn a_build_with_no_service_reports_local_only_rather_than_broken() {
    let status = answer(json!({ "action": "status", "requestId": 2 }), None).expect("an event");
    assert_eq!(status["ok"], json!(true));
    assert_eq!(status["available"], json!(false));
}

#[test]
fn status_names_the_service_and_the_player() {
    let status = answer(
        json!({ "action": "status", "requestId": 2 }),
        Some(&Fake::default()),
    )
    .expect("ev");
    assert_eq!(status["provider"], json!("steam"));
    assert_eq!(status["player"]["id"], json!("76561198000000000"));
}

#[test]
fn a_batch_this_platform_cannot_carry_is_delivered_rather_than_refused() {
    // The web side keeps a refused batch pending BY DESIGN, so answering false
    // for a batch with nothing sendable in it is how a launch ends up retrying
    // the same empty list forever.
    let fake = Fake {
        unknown: &["mystery_badge"],
        ..Fake::default()
    };
    let event = answer(
        json!({
            "action": "report",
            "requestId": 5,
            "entries": [{ "id": "mystery_badge", "percent": 100 }],
        }),
        Some(&fake),
    )
    .expect("an event");
    assert_eq!(event["ok"], json!(true));
    assert!(fake.reported().is_empty(), "and nothing reached Steam");
}

#[test]
fn a_platform_that_refuses_a_real_batch_is_reported_as_a_failure() {
    let fake = Fake {
        accepts: false,
        ..Fake::default()
    };
    let event = answer(
        json!({
            "action": "report",
            "requestId": 5,
            "entries": [{ "id": "first_blood", "percent": 100 }],
        }),
        Some(&fake),
    )
    .expect("an event");
    assert_eq!(event["ok"], json!(false), "so the web side retries it");
}

#[test]
fn nothing_the_page_sent_reaches_the_platform_unvalidated() {
    let fake = Fake {
        unknown: &["retired_badge"],
        ..Fake::default()
    };
    let entries = vec![
        json!({ "id": 17, "percent": 100 }),               // not a string
        json!({ "id": "", "percent": 100 }),               // no name Steam matches
        json!({ "id": "retired_badge", "percent": 100 }),  // the platform drops it
        json!({ "id": "no_percent" }),                     // nothing to report
        json!({ "id": "text_percent", "percent": "100" }), // not a number
        json!({ "id": "over", "percent": 250 }),           // clamped
        json!({ "id": "under", "percent": -5 }),           // clamped
    ];
    let mapped = map_entries(&entries, &fake);
    assert_eq!(
        mapped,
        vec![
            AchievementEntry {
                id: "over".to_string(),
                percent: 100.0,
            },
            AchievementEntry {
                id: "under".to_string(),
                percent: 0.0,
            },
        ]
    );
}

#[test]
fn show_needs_a_service_to_open() {
    assert_eq!(
        answer(json!({ "action": "show", "requestId": 1 }), None).expect("an event")["ok"],
        json!(false)
    );
    let fake = Fake::default();
    assert_eq!(
        answer(json!({ "action": "show", "requestId": 1 }), Some(&fake)).expect("an event")["ok"],
        json!(true)
    );
    assert_eq!(*fake.shown.lock().expect("a fake's own lock"), 1);
}

#[test]
fn a_report_with_no_entries_at_all_is_still_answered() {
    // A protocol that answers nothing here is one the page waits out.
    let event = answer(
        json!({ "action": "report", "requestId": 8 }),
        Some(&Fake::default()),
    )
    .expect("ev");
    assert_eq!(event["requestId"], json!(8));
    assert_eq!(event["ok"], json!(true));
}
