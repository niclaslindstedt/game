// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! WHAT THE PAGE JUST ASKED FOR — the peer of `routeMessage` in
//! `electron/src/main.ts`, with the routing decision separated from the acting
//! on it so the decision can be tested.
//!
//! Every message the page posts is a JSON object carrying ONE `__gis*` flag
//! that says which protocol it belongs to; that protocol's own bridge validates
//! the rest of the fields, so nothing here looks past the flag. The set is the
//! same one the phone shell answers (minus haptics, which a desktop has no
//! motor for) plus the two only a desktop can honour.
//!
//! **Every protocol has been listed here since phase 1, including the ones this
//! build cannot answer**, and that is the point: an unimplemented protocol is
//! [`Route::Unimplemented`] carrying the phase that fills it in, so a
//! mid-migration build explains itself in its own log instead of going quiet.
//! The alternative — dropping unknown messages — is the failure mode where the
//! page waits out a timeout and the shell has nothing to say about it.
//!
//! Phase 2 moved four of them (cloud, achievements, scores, shots) off that
//! list and onto routes of their own; mods and net are what is left, and they
//! are phase 3.

use serde_json::Value;

/// Which protocol a message belongs to, and whether this build can answer it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Route {
    /// QUIT — the main menu's QUIT row (`pwa/src/app/quit-bridge.ts`). No reply
    /// and no bridge module: the only successful outcome is the page ceasing to
    /// exist. Answered from phase 1, because it needs no platform behind it.
    Quit,
    /// CLOUD SAVE — [`crate::cloud_save`]. Phase 2.
    Cloud,
    /// ACHIEVEMENTS — [`crate::achievements`]. Phase 2.
    Achievements,
    /// LEADERBOARDS — [`crate::leaderboards`], wired up with no provider behind
    /// it. Phase 2.
    Scores,
    /// SCREENSHOTS — [`crate::screenshots`]. Phase 2.
    Shots,
    /// A protocol this shell knows but has not grown yet, and the migration
    /// phase that grows it.
    Unimplemented {
        /// The protocol's own name, as [`crate::channels::event_global`] spells it.
        protocol: &'static str,
        /// Which phase of `docs/tauri-migration.md` fills this in.
        phase: u8,
    },
    /// A protocol this build carries but this LAUNCH may not honour — the page
    /// already hides the front door (the capability list reaches it in the
    /// initialization script), so this is the second half of the same fact
    /// rather than a message anybody expects to send.
    Refused {
        /// The protocol's own name.
        protocol: &'static str,
        /// The capability that would have to be on.
        capability: &'static str,
    },
    /// Not our message — anything that is not the bridge is ignored, because
    /// the page's own libraries post their own things.
    Ignored,
}

/// The protocols, their flags, and the phase each one arrives in.
///
/// Ordered as `main.ts` routes them, which is also the order they were built.
const PROTOCOLS: &[(&str, &str, u8, Option<&str>)] = &[
    // flag,                 protocol,        phase, capability it needs
    ("__gisCloud", "cloud", 2, None),
    ("__gisAchievements", "achievements", 2, None),
    ("__gisScores", "scores", 2, None),
    ("__gisShots", "shots", 2, None),
    ("__gisMods", "mods", 3, Some("mods")),
    ("__gisNet", "net", 3, Some("multiplayer")),
];

/// What this build can answer today.
///
/// The constant is what the routing test asserts against, in BOTH directions: a
/// protocol whose phase has landed must have a route of its own, and one whose
/// phase has not must still name that phase. So a phase that lands without
/// updating the router — or a router updated without the phase — is a failing
/// test rather than a quiet drop.
pub const IMPLEMENTED_THROUGH_PHASE: u8 = 2;

/// The route a protocol this build ANSWERS gets, by the protocol's own name.
///
/// Separate from the table above so the table stays one line per protocol, and
/// so that a protocol whose phase has arrived but which nobody wired up is a
/// `None` the test can catch rather than a silent `Unimplemented`.
fn answered(protocol: &str) -> Option<Route> {
    match protocol {
        "cloud" => Some(Route::Cloud),
        "achievements" => Some(Route::Achievements),
        "scores" => Some(Route::Scores),
        "shots" => Some(Route::Shots),
        _ => None,
    }
}

/// Read one message off the shell channel and say what it is.
///
/// `allows` answers whether this launch may honour a named capability — handed
/// in rather than reached for, so the routing table is testable without
/// resolving a command line.
pub fn route(raw: &str, allows: &dyn Fn(&str) -> bool) -> Route {
    let Ok(Value::Object(message)) = serde_json::from_str::<Value>(raw) else {
        return Route::Ignored;
    };
    let flagged = |flag: &str| message.get(flag).and_then(Value::as_bool) == Some(true);

    if flagged("__gisQuit") {
        return Route::Quit;
    }
    for (flag, protocol, phase, capability) in PROTOCOLS {
        if !flagged(flag) {
            continue;
        }
        if let Some(capability) = capability {
            if !allows(capability) {
                return Route::Refused {
                    protocol,
                    capability,
                };
            }
        }
        if *phase <= IMPLEMENTED_THROUGH_PHASE {
            if let Some(route) = answered(protocol) {
                return route;
            }
        }
        return Route::Unimplemented {
            protocol,
            phase: *phase,
        };
    }
    Route::Ignored
}

/// The whole message, parsed, for the bridge the [`Route`] named.
///
/// Every bridge module below validates its own fields, so this only has to get
/// as far as "an object" — and answers `None` for anything else, which cannot
/// happen after a successful [`route`] but keeps the two halves independently
/// honest.
pub fn parse_message(raw: &str) -> Option<Value> {
    match serde_json::from_str::<Value>(raw) {
        Ok(value) if value.is_object() => Some(value),
        _ => None,
    }
}

/// WHICH ACTION the page asked for, as the protocol spells it.
///
/// Shared by all four bridges rather than repeated in each: every one of them is
/// an `action` string and a `requestId`, on every shell, and a fifth protocol
/// arriving in phase 3 will want the same two.
pub fn action(message: &Value) -> String {
    message
        .get("action")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

/// The page's own correlation id for one request.
///
/// Zero where the page sent none, which is what the TypeScript peers'
/// `requestId ?? 0` does — the page's own timeout is what resolves a request
/// that was never answerable, and inventing an id here would answer a different
/// one.
pub fn request_id(message: &Value) -> u64 {
    message
        .get("requestId")
        .and_then(Value::as_u64)
        .unwrap_or(0)
}

/// The line the shell logs for a message it cannot yet answer.
///
/// A sentence rather than a code, because the reader is somebody comparing two
/// shells with a log file open — and because a build that goes quiet about a
/// protocol is the thing this whole module exists to prevent.
pub fn explain(route: &Route) -> Option<String> {
    match route {
        Route::Unimplemented { protocol, phase } => Some(format!(
            "bridge: {protocol} is not answered by the Tauri shell yet \
             (phase {phase} — see docs/tauri-migration.md)"
        )),
        Route::Refused {
            protocol,
            capability,
        } => Some(format!(
            "bridge: {protocol} refused — this build carries no {capability} capability"
        )),
        Route::Quit
        | Route::Cloud
        | Route::Achievements
        | Route::Scores
        | Route::Shots
        | Route::Ignored => None,
    }
}

/// The JavaScript that hands one event to the page, ready to be evaluated in
/// the webview.
///
/// The peer of Electron's `executeJavaScript` emit and of the WebView's
/// `injectJavaScript`: with the page and the shell in separate worlds, the
/// RETURN path is the shell calling the page's own `window.__gis*Event(...)`
/// from outside. That is why the web side needed no change to run on this
/// shell at all.
///
/// U+2028/2029 are the two JSON-legal characters that terminate a line inside a
/// JavaScript literal, so they are escaped — a hero's name reaches this string.
pub fn emit_script(global: &str, payload: &Value) -> String {
    let json = payload
        .to_string()
        .replace('\u{2028}', "\\u2028")
        .replace('\u{2029}', "\\u2029");
    format!("try{{window.{global}&&window.{global}({json})}}catch(e){{}};")
}
