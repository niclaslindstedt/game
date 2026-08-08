// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! NET's SHELL half — the peer of `electron/src/net.ts`, and the fifth arm of
//! the shape cloud save, achievements, leaderboards and screenshots already
//! use. The protocol is documented on the web side (`pwa/src/app/net-bridge.ts`)
//! and is IDENTICAL on both desktop shells; keep the three in step.
//!
//! It is the bridge whose traffic mostly does not go through it, and the split
//! is the same one Electron makes:
//!
//!   CONTROL   host / listen / stop / status / browse / join / connect /
//!             firewall. JSON, a handful of round trips per session, down the
//!             one shell channel like everything else. That is what this module
//!             shapes.
//!   GAME      a snapshot twenty times a second, on a channel the PAGE opens
//!             straight to the session process. Nothing here ever sees a game
//!             byte. See [`crate::snapshot`] and `server/shell-host.ts`.
//!
//! **ONE EXCEPTION, AND IT IS FORCED, exactly as on Electron.** Packets from
//! STEAM peers do pass through the shell, because the Steam handshake is a
//! single global one this process owns and the session runs in another. They
//! are relayed as small control messages to `server/net/relay.ts`, which
//! presents them to the session as an ordinary transport. UDP peers do not:
//! that socket is bound inside the session process itself.
//!
//! Everything in this module is PURE — a request in, a message or an event out
//! — so the whole protocol is testable without a session, a socket or a Steam
//! client. The orchestration that calls it is `src-tauri/src/net.rs`.

use serde_json::{json, Value};

use crate::capabilities::Capabilities;

/// How long the server may take to answer a control message.
///
/// The page has its own, longer timeout; this one exists so a wedged server
/// produces a refusal here rather than a silence the page can only guess at.
pub const REPLY_TIMEOUT_MS: u64 = 15_000;

/// Binding a socket, opening a lobby and asking a router can all be slow, and
/// the router half is deliberately not waited on inside the server — but a
/// `listen` still has more to do than a `status`.
pub const LISTEN_TIMEOUT_MS: u64 = 20_000;

/// …and a JOIN has more to do than either: probe an address that may not
/// answer, then wait out a level being built on somebody else's machine. The
/// connector's own deadlines usually settle it; this only has to outlast their
/// sum, so that a refusal the player can read beats a timeout they cannot.
pub const CONNECT_TIMEOUT_MS: u64 = 25_000;

/// What the page called this session when it did not say.
pub const DEFAULT_SESSION_NAME: &str = "ADA'S TRAIL";

/// What a joiner is called when the page did not say.
pub const DEFAULT_PLAYER_NAME: &str = "PLAYER";

/// Seats a lobby advertises when the page did not say.
pub const DEFAULT_MAX_PLAYERS: u32 = 8;

/// One parsed message from the page (`__gisNet` already checked).
///
/// Every opaque field stays a [`Value`]: the session owns what a run, a loadout
/// and a catalog override mean, and a shell that parsed one would be a second
/// place for the two to disagree.
#[derive(Debug, Clone, PartialEq)]
pub struct NetRequest {
    /// Which of the nine the page asked for, verbatim.
    pub action: String,
    /// The page's own correlation id.
    pub request_id: u64,
    /// The whole message, for the fields each action forwards untouched.
    pub message: Value,
}

/// Read one net message off the shell channel.
pub fn parse(message: &Value) -> NetRequest {
    NetRequest {
        action: crate::bridge::action(message),
        request_id: crate::bridge::request_id(message),
        message: message.clone(),
    }
}

impl NetRequest {
    /// One string field, or `None` where the page sent none.
    pub fn text(&self, field: &str) -> Option<String> {
        self.message
            .get(field)
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
    }

    /// One number field, clamped to what a port can be.
    pub fn port(&self) -> Option<u16> {
        let port = self.message.get("port").and_then(Value::as_u64)?;
        (port > 0 && port <= u64::from(u16::MAX)).then_some(port as u16)
    }

    /// One boolean field where ABSENT MEANS YES — which is how `udp` and
    /// `steam` are spelled on the wire, because a host listens on both doors
    /// unless it says otherwise.
    pub fn on_by_default(&self, field: &str) -> bool {
        self.message.get(field).and_then(Value::as_bool) != Some(false)
    }

    /// …and one where absent means no.
    pub fn off_by_default(&self, field: &str) -> bool {
        self.message.get(field).and_then(Value::as_bool) == Some(true)
    }

    /// One field forwarded to the session untouched.
    pub fn passthrough(&self, field: &str) -> Option<Value> {
        self.message
            .get(field)
            .filter(|value| !value.is_null())
            .cloned()
    }
}

// ---------------------------------------------------------------------------
// Control messages — what goes DOWN to the session process
// ---------------------------------------------------------------------------

/// `start`: build a session from the page's parameters.
///
/// `allowDirect` is the LICENCE and not the feature: a build can have hosting
/// turned on and still hold no licence, and it then runs a session nobody may
/// join. Decided by the build and the launch, never by anything the page can
/// say — see `server/net/hub.ts`.
pub fn start_control(request: &NetRequest, capabilities: &Capabilities) -> Option<Value> {
    let params = request.passthrough("params").filter(Value::is_object)?;
    let mut control = json!({
        "kind": "start",
        "allowDirect": capabilities.licensed(),
        "params": params,
    });
    let object = control.as_object_mut()?;
    for field in ["adopt", "mods", "modDefs", "password", "maxClients", "bots"] {
        if let Some(value) = request.passthrough(field) {
            object.insert(field.to_string(), value);
        }
    }
    Some(control)
}

/// `listen`: open the doors.
///
/// Two of the three fields are the SHELL's answer rather than the page's, and
/// both are load-bearing. A launch that opened the direct door itself takes
/// that door and only that one — the port it was given is the one it was given.
/// And asking a router to forward a port is a change this program makes to
/// somebody else's hardware, so it is the BUILD's to permit, never a request.
pub fn listen_control(
    request: &NetRequest,
    capabilities: &Capabilities,
    steam_open: bool,
) -> Value {
    json!({
        "kind": "listen",
        "port": if capabilities.direct { capabilities.port } else { request.port() },
        "udp": capabilities.direct || request.on_by_default("udp"),
        // The relay is only worth opening when something is pumping it.
        "steam": steam_open,
        "map": capabilities.port_map(),
    })
}

/// Whether this `listen` should open the Steam door at all.
///
/// A host listens on BOTH by default, and should: Steam friends get the
/// frictionless path (nothing inbound is ever bound, so no port, no router
/// mapping and no firewall rule are involved) and everyone else gets an
/// address. A launch that was handed a direct port has no Steam client behind
/// it to pump a relay for.
pub fn wants_steam(request: &NetRequest, capabilities: &Capabilities) -> bool {
    request.on_by_default("steam") && !capabilities.direct
}

/// `connect`: join somebody else's session.
pub fn connect_control(request: &NetRequest) -> Value {
    let mut control = json!({
        "kind": "connect",
        "name": request.text("playerName").unwrap_or_else(|| DEFAULT_PLAYER_NAME.to_string()),
        "hardcore": request.off_by_default("hardcore"),
        "loadout": request.passthrough("loadout").unwrap_or(Value::Null),
    });
    if let Some(object) = control.as_object_mut() {
        for field in ["address", "peer", "password", "mods"] {
            if let Some(value) = request.passthrough(field) {
                object.insert(field.to_string(), value);
            }
        }
    }
    control
}

/// `status`, `stop`: the two that carry nothing.
pub fn plain_control(kind: &str) -> Value {
    json!({ "kind": kind })
}

/// One packet off the Steam P2P queue, on its way to `server/net/relay.ts`.
///
/// The bytes travel as a JSON array rather than base64 because that is exactly
/// what the Electron peer sends and the server's `toBytes` already accepts —
/// a second encoding on a control-plane channel would be a second thing to keep
/// in step for no measurable gain.
pub fn peer_control(from: &str, data: &[u8]) -> Value {
    json!({ "kind": "peer", "from": from, "data": data })
}

/// …and the shell saying one has gone quiet.
pub fn peer_lost_control(from: &str, reason: &str) -> Value {
    json!({ "kind": "peer-lost", "from": from, "reason": reason })
}

// ---------------------------------------------------------------------------
// Events — what goes BACK to the page
// ---------------------------------------------------------------------------

/// `hosted`: a session was built, or was not.
pub fn hosted_event(request_id: u64, level_id: Option<&str>, reason: Option<&str>) -> Value {
    match level_id {
        Some(level_id) => {
            json!({ "event": "hosted", "requestId": request_id, "ok": true, "levelId": level_id })
        }
        None => json!({
            "event": "hosted",
            "requestId": request_id,
            "ok": false,
            "reason": reason.unwrap_or("no-reply"),
        }),
    }
}

/// `listening`: which doors actually opened.
///
/// The `bound` address is THE PORT THE SOCKET ACTUALLY GOT, forwarded from the
/// session untouched — a HOST screen printing the requested port is the exact
/// bug that makes "direct connect doesn't work" unanswerable.
pub fn listening_event(
    request_id: u64,
    reply: Option<&Value>,
    steam: bool,
    lobby_id: Option<&str>,
) -> Value {
    let bound = reply
        .and_then(|reply| reply.get("bound"))
        .cloned()
        .unwrap_or(Value::Null);
    let detail = reply
        .and_then(|reply| reply.get("detail"))
        .and_then(Value::as_str);
    json!({
        "event": "listening",
        "requestId": request_id,
        "ok": reply.is_some() && (!bound.is_null() || steam),
        "bound": bound,
        "steam": steam,
        "lobbyId": lobby_id,
        "reason": if reply.is_some() { detail.map(Value::from).unwrap_or(Value::Null) }
                  else { Value::from("no-reply") },
    })
}

/// `stopped`: it is over. Always `ok` — asking a session that is not running to
/// stop is a request that has already been granted.
pub fn stopped_event(request_id: u64) -> Value {
    json!({ "event": "stopped", "requestId": request_id, "ok": true })
}

/// `status`: one poll of the HOST screen.
///
/// Every field is the session's own, forwarded rather than restated — the shell
/// holds neither the tick nor the roster and inventing either would be a second
/// copy of a number the screen is watching.
pub fn status_event(request_id: u64, reply: Option<&Value>) -> Value {
    let Some(reply) = reply else {
        return json!({
            "event": "status",
            "requestId": request_id,
            "ok": false,
            "running": true,
            "tick": 0,
            "phase": "unknown",
            "enemies": 0,
            "clients": 0,
            "bound": Value::Null,
            "mapping": { "status": "idle" },
            "roster": [],
        });
    };
    let at = |field: &str, fallback: Value| reply.get(field).cloned().unwrap_or(fallback);
    json!({
        "event": "status",
        "requestId": request_id,
        "ok": true,
        "running": true,
        "tick": at("tick", json!(0)),
        "phase": at("phase", json!("unknown")),
        "enemies": at("enemies", json!(0)),
        "clients": at("clients", json!(0)),
        "bound": at("bound", Value::Null),
        "mapping": at("mapping", json!({ "status": "idle" })),
        "roster": at("roster", json!([])),
    })
}

/// `status` for a shell with no session at all — the idle HOST screen.
pub fn idle_status_event(request_id: u64) -> Value {
    json!({
        "event": "status",
        "requestId": request_id,
        "ok": true,
        "running": false,
        "tick": 0,
        "phase": "idle",
        "enemies": 0,
        "clients": 0,
        "bound": Value::Null,
        "mapping": { "status": "idle" },
        "roster": [],
    })
}

/// `browse`: the server browser's rows.
pub fn browse_event(request_id: u64, rows: Vec<Value>) -> Value {
    json!({ "event": "browse", "requestId": request_id, "ok": true, "rows": rows })
}

/// `joined`: a lobby was joined, and here is the host's peer key.
pub fn joined_event(request_id: u64, found: Option<(&str, &Value)>, reason: &str) -> Value {
    match found {
        Some((host_id, row)) => json!({
            "event": "joined",
            "requestId": request_id,
            "ok": true,
            "hostId": host_id,
            "row": row,
        }),
        None => {
            json!({ "event": "joined", "requestId": request_id, "ok": false, "reason": reason })
        }
    }
}

/// `connected`: the join settled.
pub fn connected_event(
    request_id: u64,
    ok: bool,
    reason: Option<&str>,
    detail: Option<&str>,
) -> Value {
    let mut event = json!({ "event": "connected", "requestId": request_id, "ok": ok });
    if !ok {
        if let Some(object) = event.as_object_mut() {
            object.insert("reason".to_string(), json!(reason.unwrap_or("no-session")));
            if let Some(detail) = detail {
                object.insert("detail".to_string(), json!(detail));
            }
        }
    }
    event
}

/// `firewall`: the row's state, whichever of the two questions was asked.
pub fn firewall_event(request_id: u64, state: Value) -> Value {
    json!({ "event": "firewall", "requestId": request_id, "ok": true, "state": state })
}

/// `invite`: THE ONE UNSOLICITED EVENT on this bridge.
///
/// Everything else here is a reply to a request the page made and is matched by
/// id; an invite was made on a command line before the page existed, so it has
/// no id to match and the page dispatches it by name.
pub fn invite_event(lobby_id: Option<&str>, address: Option<&str>) -> Value {
    json!({ "event": "invite", "lobbyId": lobby_id, "address": address })
}

// ---------------------------------------------------------------------------

/// The canonical text for an address — the same shape `JOIN BY ADDRESS` parses,
/// because the lobby row's address is pasted straight into that field.
///
/// Spelled here rather than imported from the engine's `wire/address.ts` for
/// the reason this whole tree stands apart: the shell has its own dependency
/// graph and does not reach into the engine's.
pub fn format_address(host: &str, port: u16) -> String {
    if host.contains(':') {
        format!("[{host}]:{port}")
    } else {
        format!("{host}:{port}")
    }
}

/// One string field off the opaque session params, for a lobby row.
///
/// The params are the wire's shape and this shell deliberately does not import
/// it — the server owns what they mean.
pub fn read_string(params: Option<&Value>, field: &str) -> String {
    params
        .and_then(|params| params.get(field))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}
