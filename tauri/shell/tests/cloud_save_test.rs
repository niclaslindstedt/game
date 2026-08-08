// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! CLOUD SAVE's PROTOCOL, against a cloud that can be made to fail on demand.
//!
//! The half worth having is the failure half. A real Steam client cannot be
//! asked to lose a read, refuse a write, or hold nothing at all — and those
//! three are exactly where cloud save either protects a roster or destroys one.

use std::sync::Mutex;

use adastrail_shell::cloud_provider::{CloudPlayer, CloudProvider, CloudRead, SAVE_KEY};
use adastrail_shell::cloud_save::{handle, parse};
use serde_json::{json, Value};

/// A cloud with whatever answers a test needs, and a record of what it was told.
struct Fake {
    available: bool,
    player: Option<CloudPlayer>,
    read: CloudRead,
    accepts: bool,
    max_bytes: usize,
    written: Mutex<Vec<(String, String)>>,
}

impl Default for Fake {
    fn default() -> Self {
        Self {
            available: true,
            player: Some(CloudPlayer {
                id: "76561198000000000".to_string(),
                name: "Ada".to_string(),
            }),
            read: CloudRead::Blob("{\"heroes\":[]}".to_string()),
            accepts: true,
            max_bytes: 4 * 1024 * 1024,
            written: Mutex::new(Vec::new()),
        }
    }
}

impl Fake {
    /// Everything this cloud was told to write, in order.
    fn written(&self) -> Vec<(String, String)> {
        self.written.lock().expect("a fake's own lock").clone()
    }
}

impl CloudProvider for Fake {
    fn id(&self) -> &'static str {
        "steam-cloud"
    }
    fn is_available(&self) -> bool {
        self.available
    }
    fn identify(&self) -> Option<CloudPlayer> {
        self.player.clone()
    }
    fn load(&self, _key: &str) -> CloudRead {
        self.read.clone()
    }
    fn save(&self, key: &str, data: &str) -> bool {
        self.written
            .lock()
            .expect("a fake's own lock")
            .push((key.to_string(), data.to_string()));
        self.accepts
    }
    fn max_bytes(&self) -> usize {
        self.max_bytes
    }
}

fn answer(message: Value, provider: Option<&dyn CloudProvider>) -> Option<Value> {
    handle(&parse(&message), provider)
}

#[test]
fn the_hello_is_answered_with_silence() {
    // There is nothing to arm on this shell — Steam Cloud has no change push —
    // but the page sends `init` on every platform and must not be replied to.
    assert_eq!(
        answer(json!({ "action": "init" }), Some(&Fake::default())),
        None
    );
}

#[test]
fn a_build_with_no_cloud_is_available_false_and_still_ok() {
    // The ordinary state of a developer build. `ok: false` here would present as
    // a broken cloud rather than an absent one.
    let status = answer(json!({ "action": "status", "requestId": 3 }), None).expect("an event");
    assert_eq!(status["ok"], json!(true));
    assert_eq!(status["available"], json!(false));
    assert_eq!(status["requestId"], json!(3));
    assert!(status.get("provider").is_none(), "nothing answered");
}

#[test]
fn status_names_the_provider_and_the_signed_in_player() {
    let status = answer(
        json!({ "action": "status", "requestId": 1 }),
        Some(&Fake::default()),
    )
    .expect("an event");
    assert_eq!(status["available"], json!(true));
    assert_eq!(status["provider"], json!("steam-cloud"));
    assert_eq!(status["player"]["name"], json!("Ada"));
}

#[test]
fn an_unavailable_cloud_is_not_asked_who_the_player_is() {
    let fake = Fake {
        available: false,
        ..Fake::default()
    };
    let status =
        answer(json!({ "action": "status", "requestId": 1 }), Some(&fake)).expect("an event");
    assert_eq!(status["available"], json!(false));
    assert!(
        status.get("player").is_none(),
        "identity is a nice-to-have and never blocks the sync"
    );
}

#[test]
fn an_empty_cloud_and_a_failed_read_are_different_answers() {
    // THE RULE THIS WHOLE SEAM EXISTS FOR. If a failed read presented as an
    // empty cloud, the game would treat an unreachable cloud as a fresh account
    // and push a near-empty save over a roster it never saw.
    let empty = Fake {
        read: CloudRead::Missing,
        ..Fake::default()
    };
    let event =
        answer(json!({ "action": "load", "requestId": 9 }), Some(&empty)).expect("an event");
    assert_eq!(event["ok"], json!(true), "a successful read of nothing");
    assert_eq!(event["data"], Value::Null);

    let broken = Fake {
        read: CloudRead::Failed,
        ..Fake::default()
    };
    let event =
        answer(json!({ "action": "load", "requestId": 9 }), Some(&broken)).expect("an event");
    assert_eq!(event["ok"], json!(false), "a read that FAILED");
    assert!(event.get("data").is_none());
}

#[test]
fn a_load_with_no_provider_fails_rather_than_reporting_an_empty_cloud() {
    let event = answer(json!({ "action": "load", "requestId": 2 }), None).expect("an event");
    assert_eq!(event["ok"], json!(false));
    assert!(event.get("data").is_none());
}

#[test]
fn a_save_goes_to_the_versioned_key_verbatim() {
    let fake = Fake::default();
    let event = answer(
        json!({ "action": "save", "requestId": 4, "data": "{\"heroes\":[1]}" }),
        Some(&fake),
    )
    .expect("an event");
    assert_eq!(event["ok"], json!(true));
    assert!(event.get("reason").is_none());
    assert_eq!(
        fake.written(),
        [(SAVE_KEY.to_string(), "{\"heroes\":[1]}".to_string())]
    );
}

#[test]
fn every_refusal_carries_the_reason_the_page_branches_on() {
    // The web side shows a different line for each, so a blank refusal is a
    // status the player cannot act on.
    let unavailable = answer(
        json!({ "action": "save", "requestId": 1, "data": "x" }),
        None,
    )
    .expect("an event");
    assert_eq!(unavailable["reason"], json!("unavailable"));

    let no_data = answer(
        json!({ "action": "save", "requestId": 1 }),
        Some(&Fake::default()),
    )
    .expect("event");
    assert_eq!(no_data["reason"], json!("error"));

    let refused = Fake {
        accepts: false,
        ..Fake::default()
    };
    let event = answer(
        json!({ "action": "save", "requestId": 1, "data": "x" }),
        Some(&refused),
    )
    .expect("an event");
    assert_eq!(event["reason"], json!("error"));
}

#[test]
fn the_ceiling_is_bytes_rather_than_characters() {
    // A hero named in kanji costs more than its length suggests, and the
    // provider's ceiling is in bytes. Ten characters, thirty bytes.
    let tight = Fake {
        max_bytes: 20,
        ..Fake::default()
    };
    let kanji = "あ".repeat(10);
    assert_eq!(kanji.chars().count(), 10);
    assert_eq!(kanji.len(), 30);
    let event = answer(
        json!({ "action": "save", "requestId": 1, "data": kanji }),
        Some(&tight),
    )
    .expect("an event");
    assert_eq!(event["reason"], json!("too-large"));
    assert!(tight.written().is_empty(), "and it never reached the cloud");
}

#[test]
fn a_request_with_no_id_is_answered_on_zero_rather_than_invented() {
    let event = answer(json!({ "action": "status" }), None).expect("an event");
    assert_eq!(event["requestId"], json!(0));
}

#[test]
fn an_action_this_shell_does_not_know_is_answered_with_nothing() {
    assert_eq!(answer(json!({ "action": "delete" }), None), None);
    assert_eq!(answer(json!({}), None), None);
}
