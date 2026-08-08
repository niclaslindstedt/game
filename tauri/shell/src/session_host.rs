// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! THE SESSION SIDECAR'S PROTOCOL AND LIFECYCLE RULES — the peer of
//! `electron/src/session-host.ts`, minus the process itself.
//!
//! One process per SESSION, not per app, for the same three reasons that file
//! gives: a 60 Hz simulation must not compete with the shell, the engine holds
//! process-global mutable bindings that two runs would fight over, and it makes
//! the host's own renderer just another client.
//!
//! **WHERE THE TWO SHELLS DIVERGE IS THE PIPE, AND ONLY THE PIPE.** Electron
//! forks a `utilityProcess`, which is a real Node child with an IPC channel and
//! the ability to be handed a `MessagePort` that reaches the renderer. Tauri can
//! spawn a child and nothing more, so:
//!
//! | | Electron | Here |
//! | --- | --- | --- |
//! | the child | `utilityProcess.fork` | `std::process::Command` on a Node runtime |
//! | control | the Node IPC channel | the child's STDIO, newline-delimited JSON |
//! | snapshots | a transferred `MessagePort` | a loopback socket the PAGE opens |
//! | reaping | `before-quit` kills it | stdin's EOF, which the child watches |
//!
//! `server/shell-host.ts` is the far end of all four rows and carries the
//! argument for each. What is HERE is everything that can be decided without a
//! process: what a reply is, which replies nobody is waiting on, how long a
//! stop may take, and what the child's first line means.
//!
//! **A CRASHED SESSION MUST LOOK LIKE A CRASHED SESSION**, which is the one
//! rule that survived the move unchanged: the reason is recorded BEFORE the kill
//! and read back in the exit handler, because otherwise a server that died
//! mid-run and one the player asked to stop are indistinguishable and the HOST
//! screen says "stopped" over a crash.

use serde_json::Value;

/// How long a `stop` may take to be honoured before the process is killed.
///
/// Short, exactly as on the Electron side: the server's own stop is
/// synchronous, so anything past this is a process that is no longer answering,
/// and a host that will not quit is worse than one that is killed.
pub const SHUTDOWN_GRACE_MS: u64 = 2_000;

/// How long the child may take to report its snapshot endpoint before the
/// launch is called a failure.
///
/// It is a Node process starting and binding a loopback socket — milliseconds
/// on a warm disk, seconds on a cold one, and never the tens of seconds a
/// LEVEL takes to build. The HOST screen's own timeout is longer; this one
/// exists so a runtime that is missing entirely produces a refusal here rather
/// than a fifteen-second silence.
pub const READY_TIMEOUT_MS: u64 = 20_000;

/// Where the page must open the snapshot channel.
///
/// Minted by the CHILD rather than by the shell, and reported on its first
/// line: the port is ephemeral, so only the process that bound it knows it, and
/// a shell that picked one first would be racing whatever else on the machine
/// wanted it. The token comes the same way for the same reason — one mint, one
/// owner.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SnapshotEndpoint {
    /// The loopback port the child bound.
    pub port: u16,
    /// The secret the upgrade has to carry.
    pub token: String,
    /// The one path an upgrade may name.
    pub path: String,
}

impl SnapshotEndpoint {
    /// The URL the page connects to.
    ///
    /// `127.0.0.1` rather than `localhost`, deliberately: the name resolves to
    /// two addresses on a dual-stack machine and the child bound one of them,
    /// so a page that got the other would report a connection refused that
    /// nothing in either process is wrong about.
    pub fn url(&self) -> String {
        format!(
            "ws://127.0.0.1:{}{}?token={}",
            self.port, self.path, self.token
        )
    }
}

/// A reply from the session process, as much of it as the shell reads.
///
/// Mirrors `ControlReply` in `server/main.ts` — keep the two in step. Anything
/// this shell does not know is [`ServerReply::Unknown`] rather than a parse
/// failure, because a newer server talking to an older shell is a situation
/// that should degrade rather than crash.
#[derive(Debug, Clone, PartialEq)]
pub enum ServerReply {
    /// The process is up. Carries the snapshot endpoint in the sidecar entry.
    Ready {
        /// The wire protocol the session speaks.
        protocol: u32,
        /// Where the page opens its channel, absent only if the child was
        /// somehow started without the sidecar flag.
        snapshot: Option<SnapshotEndpoint>,
    },
    /// A session was built.
    Started {
        /// The level it built.
        level_id: String,
    },
    /// One poll of the HOST screen.
    Status(Value),
    /// The doors, as they actually opened.
    Listening {
        /// The whole reply, for the page — the shell reads three fields off it
        /// and forwards the rest untouched.
        detail: Value,
    },
    /// A join settled.
    Connected {
        /// Whether the door opened.
        ok: bool,
        /// The host's own refusal, when it did not.
        reason: Option<String>,
        /// More of it, when there is more.
        detail: Option<String>,
    },
    /// One packet for the shell to put on the Steam P2P queue.
    PeerSend {
        /// The peer's Steam id, as a decimal string.
        to: String,
        /// The bytes.
        data: Vec<u8>,
        /// Whether it must arrive.
        reliable: bool,
    },
    /// The session asked for the platform's invite panel.
    Invite,
    /// One line for the shell's own log.
    Log {
        /// What to write down.
        line: String,
    },
    /// The session ended.
    Stopped,
    /// Something went wrong inside the session.
    Error {
        /// What it said.
        detail: String,
    },
    /// A reply this shell has no case for.
    Unknown {
        /// Its `kind`, for the log.
        kind: String,
    },
}

impl ServerReply {
    /// The `kind` string this reply arrived as — what a waiter is matched on.
    pub fn kind(&self) -> &str {
        match self {
            ServerReply::Ready { .. } => "ready",
            ServerReply::Started { .. } => "started",
            ServerReply::Status(_) => "status",
            ServerReply::Listening { .. } => "listening",
            ServerReply::Connected { .. } => "connected",
            ServerReply::PeerSend { .. } => "peer-send",
            ServerReply::Invite => "invite",
            ServerReply::Log { .. } => "log",
            ServerReply::Stopped => "stopped",
            ServerReply::Error { .. } => "error",
            ServerReply::Unknown { kind } => kind,
        }
    }

    /// Is this one nothing is ever WAITING on?
    ///
    /// The bridge matches replies to requests by ORDER — the server answers in
    /// order, so a queue is enough and no correlation id has to cross, which
    /// keeps `server/main.ts` free of request bookkeeping the dedicated server
    /// would also have to carry. That only holds if unsolicited messages are
    /// excluded, and getting this list wrong is SILENT: a log line would settle
    /// whatever request happened to be in flight, and the HOST screen would
    /// report a refusal it was never sent.
    pub fn unsolicited(&self) -> bool {
        matches!(
            self,
            ServerReply::Ready { .. }
                | ServerReply::PeerSend { .. }
                | ServerReply::Invite
                | ServerReply::Log { .. }
        )
    }
}

/// Read one line of the child's stdout.
///
/// `None` for anything that is not a JSON object with a `kind` — which includes
/// a blank line, and includes whatever a dependency decided to print. The
/// child's stdout is a protocol channel and this shell treats stray output as
/// noise rather than as a reason to stop reading, because a session killed by
/// somebody else's `console.log` would be a spectacular way to lose a run.
pub fn parse_reply(line: &str) -> Option<ServerReply> {
    let value: Value = serde_json::from_str(line.trim()).ok()?;
    let kind = value.get("kind")?.as_str()?;
    let text = |field: &str| value.get(field).and_then(Value::as_str).map(str::to_string);
    Some(match kind {
        "ready" => ServerReply::Ready {
            protocol: value.get("protocol").and_then(Value::as_u64).unwrap_or(0) as u32,
            snapshot: parse_snapshot(value.get("snapshot")),
        },
        "started" => ServerReply::Started {
            level_id: text("levelId").unwrap_or_default(),
        },
        "status" => ServerReply::Status(value),
        "listening" => ServerReply::Listening { detail: value },
        "connected" => ServerReply::Connected {
            ok: value.get("ok").and_then(Value::as_bool).unwrap_or(false),
            reason: text("reason"),
            detail: text("detail"),
        },
        "peer-send" => ServerReply::PeerSend {
            to: text("to").unwrap_or_default(),
            data: value
                .get("data")
                .and_then(Value::as_array)
                .map(|bytes| {
                    bytes
                        .iter()
                        .filter_map(Value::as_u64)
                        .map(|byte| byte as u8)
                        .collect()
                })
                .unwrap_or_default(),
            // Anything that is not explicitly reliable is not: the relay's
            // unreliable path is the one that carries snapshots, and a
            // mis-defaulted mode would put every frame through Valve's
            // retransmit queue.
            reliable: text("mode").as_deref() == Some("reliable"),
        },
        "invite" => ServerReply::Invite,
        "log" => ServerReply::Log {
            line: text("line").unwrap_or_default(),
        },
        "stopped" => ServerReply::Stopped,
        "error" => ServerReply::Error {
            detail: text("detail").unwrap_or_default(),
        },
        other => ServerReply::Unknown {
            kind: other.to_string(),
        },
    })
}

fn parse_snapshot(value: Option<&Value>) -> Option<SnapshotEndpoint> {
    let value = value?;
    let port = value.get("port").and_then(Value::as_u64)?;
    // Port 0 is what an unbound listener reports, and a page told to connect to
    // it would get a connection refused with nothing to say about why.
    if port == 0 || port > u64::from(u16::MAX) {
        return None;
    }
    let token = value.get("token")?.as_str()?.to_string();
    if token.is_empty() {
        return None;
    }
    Some(SnapshotEndpoint {
        port: port as u16,
        token,
        path: value
            .get("path")
            .and_then(Value::as_str)
            .unwrap_or("/snapshot")
            .to_string(),
    })
}

/// The line the shell writes for a process that ended.
///
/// A sentence rather than a code: the reader is somebody holding a launch log
/// and wondering why the HOST screen went blank, and the difference between the
/// two cases is the whole answer.
pub fn describe_exit(code: Option<i32>, expected: bool) -> Option<String> {
    if expected {
        return None;
    }
    Some(match code {
        Some(code) => format!("session server exited unexpectedly (code {code})"),
        None => "session server was killed".to_string(),
    })
}
