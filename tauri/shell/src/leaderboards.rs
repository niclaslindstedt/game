// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! LEADERBOARDS' SHELL half — the peer of `electron/src/leaderboards.ts`. It is
//! wired up even though [`crate::leaderboards_provider::leaderboards_provider`]
//! answers `None` on this shell today (see that seam for why), so a future
//! provider needs no bridge work at all.
//!
//! Deliberately dumb, exactly like its two siblings: it forwards a list of
//! `{board key, whole number}` and reports whether the platform took it. It does
//! not know what a score MEANS, which boards exist, or when one is worth
//! sending. The protocol is documented on the web side
//! (`pwa/src/app/scores-bridge.ts`); keep the two in step.

use serde_json::{json, Value};

use crate::leaderboards_provider::{LeaderboardsProvider, ScoreEntry};

/// One parsed message from the page (`__gisScores` already checked).
#[derive(Debug, Clone, PartialEq)]
pub struct ScoresRequest {
    /// `init` | `status` | `submit` | `show`.
    pub action: String,
    /// The page's own correlation id.
    pub request_id: u64,
    /// The batch, on `submit` — unvalidated, exactly as the page sent it.
    pub entries: Vec<Value>,
    /// `show`: which board to open; absent opens the whole list.
    pub key: Option<String>,
}

/// Read one scores message off the shell channel.
pub fn parse(message: &Value) -> ScoresRequest {
    ScoresRequest {
        action: crate::bridge::action(message),
        request_id: crate::bridge::request_id(message),
        entries: message
            .get("entries")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default(),
        key: message
            .get("key")
            .and_then(Value::as_str)
            .map(str::to_string),
    }
}

/// Answer one scores message, or `None` for the `init` hello and anything
/// unrecognised.
pub fn handle(
    request: &ScoresRequest,
    provider: Option<&dyn LeaderboardsProvider>,
) -> Option<Value> {
    let request_id = request.request_id;
    match request.action.as_str() {
        "init" => None,
        "status" => Some(match provider {
            None => json!({
                "event": "status", "requestId": request_id, "ok": true, "available": false
            }),
            Some(provider) => json!({
                "event": "status",
                "requestId": request_id,
                "ok": true,
                "available": provider.is_available(),
                "provider": provider.id(),
            }),
        }),
        "submit" => Some(submit(request_id, &request.entries, provider)),
        "show" => Some(show(request_id, request.key.as_deref(), provider)),
        _ => None,
    }
}

fn submit(
    request_id: u64,
    entries: &[Value],
    provider: Option<&dyn LeaderboardsProvider>,
) -> Value {
    let Some(provider) = provider else {
        return json!({ "event": "submit", "requestId": request_id, "ok": false });
    };
    let mapped = map_entries(entries, provider);
    if mapped.is_empty() {
        // Nothing this platform can carry — a success, not a failure: the
        // alternative is a batch the game retries forever.
        return json!({ "event": "submit", "requestId": request_id, "ok": true });
    }
    json!({ "event": "submit", "requestId": request_id, "ok": provider.submit(&mapped) })
}

fn show(request_id: u64, key: Option<&str>, provider: Option<&dyn LeaderboardsProvider>) -> Value {
    let Some(provider) = provider else {
        return json!({ "event": "show", "requestId": request_id, "ok": false });
    };
    // A key the portal doesn't know would present an empty board; falling back
    // to the whole list is never wrong.
    let target = key.and_then(|key| provider.platform_id(key));
    json!({ "event": "show", "requestId": request_id, "ok": provider.show(target.as_deref()) })
}

/// The page's raw batch, narrowed to what this platform can be told.
///
/// Public for the same reason the achievements one is: a platform score is a
/// whole number, so a fraction or a non-number would go straight into the
/// platform, and an unmapped key would be submitted to a board the portal has
/// never heard of.
pub fn map_entries(entries: &[Value], provider: &dyn LeaderboardsProvider) -> Vec<ScoreEntry> {
    entries
        .iter()
        .filter_map(|entry| {
            let key = entry.get("key").and_then(Value::as_str)?;
            let key = provider.platform_id(key)?;
            let value = entry.get("value").and_then(Value::as_f64)?;
            if !value.is_finite() {
                return None;
            }
            Some(ScoreEntry {
                key,
                value: value.round() as i64,
            })
        })
        .collect()
}
