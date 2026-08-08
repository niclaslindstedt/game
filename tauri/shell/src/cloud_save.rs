// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! CLOUD SAVE's SHELL half — the peer of `electron/src/cloud-save.ts`, and
//! identical in shape to it because the bridge is the part of the seam with no
//! platform in it at all. The protocol is documented on the web side
//! (`pwa/src/app/cloud-bridge.ts`); keep the two in step.
//!
//! This module is deliberately dumb: it moves ONE opaque string in and out of
//! the cloud and reports whether that worked. It does not parse the save, does
//! not merge, and does not know what a character or a coin is — the game owns
//! all of that, so the same bridge serves any provider and the merge rules can
//! change without touching shell code.
//!
//! It is also entirely PURE: [`handle`] takes a request and a provider and
//! returns the event to send back. Nothing here reaches for a window, a client
//! or a clock, which is what lets the whole protocol — including the two
//! failure paths that matter most — be tested against a fake provider.

use serde_json::{json, Value};

use crate::cloud_provider::{CloudProvider, CloudRead, SAVE_KEY};

/// One parsed message from the page (`__gisCloud` already checked).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CloudRequest {
    /// Which of the four the page asked for, verbatim — an unknown one is
    /// answered with nothing at all, exactly as the TypeScript peer's `switch`
    /// falls through.
    pub action: String,
    /// The page's own correlation id.
    pub request_id: u64,
    /// The blob, on `save`.
    pub data: Option<String>,
}

/// Read one cloud message off the shell channel.
pub fn parse(message: &Value) -> CloudRequest {
    CloudRequest {
        action: crate::bridge::action(message),
        request_id: crate::bridge::request_id(message),
        data: message
            .get("data")
            .and_then(Value::as_str)
            .map(str::to_string),
    }
}

/// Answer one cloud message, or `None` where the protocol says nothing goes
/// back (the `init` hello, and anything unrecognised).
///
/// `provider` is `None` on a build with no platform cloud behind it — a
/// developer build, a machine with Steam closed, `GIS_STEAM=off`. That is an
/// ORDINARY state rather than an error, and it is reported as
/// `available: false` with `ok: true`: the game then plays device-locally and
/// says so, which is exactly what it does in a browser.
pub fn handle(request: &CloudRequest, provider: Option<&dyn CloudProvider>) -> Option<Value> {
    let request_id = request.request_id;
    match request.action.as_str() {
        // The hello. There is nothing to arm on this shell — Steam Cloud has no
        // change push to subscribe to (see the provider seam) — but the page
        // sends it on every platform, so it is answered with silence rather than
        // treated as unknown.
        "init" => None,
        "status" => Some(status(request_id, provider)),
        "load" => Some(load(request_id, provider)),
        "save" => Some(save(request_id, request.data.as_deref(), provider)),
        _ => None,
    }
}

fn status(request_id: u64, provider: Option<&dyn CloudProvider>) -> Value {
    let Some(provider) = provider else {
        return json!({ "event": "status", "requestId": request_id, "ok": true, "available": false });
    };
    let available = provider.is_available();
    // Identity is a nice-to-have: a player Steam cannot name still saves to the
    // cloud, so a `None` here never blocks the sync.
    let player = if available { provider.identify() } else { None };
    let mut event = json!({
        "event": "status",
        "requestId": request_id,
        "ok": true,
        "available": available,
        "provider": provider.id(),
    });
    if let (Some(player), Some(object)) = (player, event.as_object_mut()) {
        object.insert(
            "player".to_string(),
            json!({ "id": player.id, "name": player.name }),
        );
    }
    event
}

fn load(request_id: u64, provider: Option<&dyn CloudProvider>) -> Value {
    let Some(provider) = provider else {
        return json!({ "event": "load", "requestId": request_id, "ok": false });
    };
    match provider.load(SAVE_KEY) {
        // A FAILED read. The game must not treat an unreachable cloud as an
        // empty one and push over a save it never saw.
        CloudRead::Failed => json!({ "event": "load", "requestId": request_id, "ok": false }),
        // A cloud that holds nothing yet — a successful read of nothing, which
        // is what a fresh account looks like.
        CloudRead::Missing => {
            json!({ "event": "load", "requestId": request_id, "ok": true, "data": Value::Null })
        }
        CloudRead::Blob(data) => {
            json!({ "event": "load", "requestId": request_id, "ok": true, "data": data })
        }
    }
}

fn save(request_id: u64, data: Option<&str>, provider: Option<&dyn CloudProvider>) -> Value {
    let Some(provider) = provider else {
        return json!({
            "event": "save", "requestId": request_id, "ok": false, "reason": "unavailable"
        });
    };
    let Some(data) = data else {
        return json!({ "event": "save", "requestId": request_id, "ok": false, "reason": "error" });
    };
    // BYTE length, not character count — a hero named in kanji costs more than
    // its length suggests, and the provider's ceiling is in bytes. A Rust `str`
    // is already UTF-8, so this is the same number the TypeScript peer counts by
    // hand.
    if data.len() > provider.max_bytes() {
        return json!({
            "event": "save", "requestId": request_id, "ok": false, "reason": "too-large"
        });
    }
    let ok = provider.save(SAVE_KEY, data);
    let mut event = json!({ "event": "save", "requestId": request_id, "ok": ok });
    if !ok {
        if let Some(object) = event.as_object_mut() {
            object.insert("reason".to_string(), json!("error"));
        }
    }
    event
}
