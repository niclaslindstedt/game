// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! ACHIEVEMENTS' SHELL half — the peer of `electron/src/achievements.ts`, and
//! deliberately identical in shape to it. The protocol is documented on the web
//! side (`pwa/src/app/achievements-bridge.ts`); keep the two in step.
//!
//! Deliberately dumb, exactly like the cloud-save bridge: it forwards a list of
//! `{badge id, percent}` and reports whether the platform took it. It does not
//! know what a badge MEANS, which badges exist, or when one is earned — the game
//! owns all of that, so the same bridge serves any provider and the catalog can
//! grow without a shell change.
//!
//! The one thing it owns is the VALIDATION, because the page's numbers reach a
//! platform from here: a non-finite percent would be sent straight into Steam,
//! and an id the provider cannot name would be reported as a badge the portal
//! has never heard of. Both are dropped here rather than guessed at.

use serde_json::{json, Value};

use crate::achievements_provider::{AchievementEntry, AchievementsProvider};

/// One parsed message from the page (`__gisAchievements` already checked).
#[derive(Debug, Clone, PartialEq)]
pub struct AchievementsRequest {
    /// `init` | `status` | `report` | `show`.
    pub action: String,
    /// The page's own correlation id.
    pub request_id: u64,
    /// The batch, on `report` — unvalidated, exactly as the page sent it.
    pub entries: Vec<Value>,
}

/// Read one achievements message off the shell channel.
pub fn parse(message: &Value) -> AchievementsRequest {
    AchievementsRequest {
        action: crate::bridge::action(message),
        request_id: crate::bridge::request_id(message),
        entries: message
            .get("entries")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default(),
    }
}

/// Answer one achievements message, or `None` for the `init` hello (there is
/// nothing to arm — no platform pushes a badge back at us) and for anything
/// unrecognised.
pub fn handle(
    request: &AchievementsRequest,
    provider: Option<&dyn AchievementsProvider>,
) -> Option<Value> {
    let request_id = request.request_id;
    match request.action.as_str() {
        "init" => None,
        "status" => Some(status(request_id, provider)),
        "report" => Some(report(request_id, &request.entries, provider)),
        "show" => Some(json!({
            "event": "show",
            "requestId": request_id,
            "ok": provider.is_some_and(AchievementsProvider::show),
        })),
        _ => None,
    }
}

fn status(request_id: u64, provider: Option<&dyn AchievementsProvider>) -> Value {
    let Some(provider) = provider else {
        return json!({ "event": "status", "requestId": request_id, "ok": true, "available": false });
    };
    let available = provider.is_available();
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

fn report(
    request_id: u64,
    entries: &[Value],
    provider: Option<&dyn AchievementsProvider>,
) -> Value {
    let Some(provider) = provider else {
        return json!({ "event": "report", "requestId": request_id, "ok": false });
    };
    let mapped = map_entries(entries, provider);
    if mapped.is_empty() {
        // Nothing this platform can carry — a SUCCESS, not a failure. The web
        // side keeps a refused batch pending by design, so answering false here
        // would leave it retrying this batch forever.
        return json!({ "event": "report", "requestId": request_id, "ok": true });
    }
    json!({ "event": "report", "requestId": request_id, "ok": provider.report(&mapped) })
}

/// The page's raw batch, narrowed to what this platform can actually be told.
///
/// Public because it is the half worth testing on its own: every one of its
/// three drops (an id that is not a string, an id the platform cannot name, a
/// percent that is not a number) is a value that would otherwise reach a
/// platform API as a guess.
pub fn map_entries(
    entries: &[Value],
    provider: &dyn AchievementsProvider,
) -> Vec<AchievementEntry> {
    entries
        .iter()
        .filter_map(|entry| {
            let id = entry.get("id").and_then(Value::as_str)?;
            let id = provider.platform_id(id)?;
            let percent = entry.get("percent").and_then(Value::as_f64)?;
            if !percent.is_finite() {
                return None;
            }
            Some(AchievementEntry {
                id,
                percent: percent.clamp(0.0, 100.0),
            })
        })
        .collect()
}
