// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! HOW OFTEN STEAM'S CALLBACK QUEUE IS DRAINED — and why one number could not
//! serve both a title screen and a session.
//!
//! Steamworks delivers results by callback, and a process that never runs them
//! accumulates a queue. A game runs them once a frame; this shell has no frame
//! of its own, because the webview owns the drawing. So the queue is drained on
//! a thread of its own, and for a long time that was every 200 ms — which was
//! correct while nothing the shell called BLOCKED on a callback: the cloud reads
//! wait on their own API call and the achievements are in-memory writes flushed
//! by `store_stats`.
//!
//! **MULTIPLAYER INVALIDATES THAT ARGUMENT, AND INHERITING THE NUMBER WOULD
//! HAVE PRESENTED AS A BROKEN NETWORK.** Two things change the moment a session
//! exists:
//!
//!  * **Matchmaking is delivered THROUGH `run_callbacks`.** Creating a lobby,
//!    listing them and joining one are all call-results, so at 200 ms every
//!    lobby round trip costs a fifth of a second before anything else happens —
//!    and the server browser makes several.
//!  * **P2P is polled on the same clock's neighbour.** The relay drains at 20 Hz
//!    ([`crate::steam_p2p::PUMP_MS`]); a callback pump running slower than the
//!    packet pump is a queue that grows for as long as a session lasts.
//!
//! **SO THE PUMP IS TWO PUMPS — one number, chosen per state, rather than two
//! threads.** A shell sitting on the title screen has nothing asynchronous in
//! flight and should not wake 20 times a second to find an empty queue; a shell
//! in a session must. Which one is live is a question about whether the net
//! bridge has anything open, and the pump asks it on every tick rather than
//! being told — a pump that has to be RE-ARMED is a pump somebody forgets to
//! re-arm on the one path that mattered.

use std::time::Duration;

/// The idle interval — nothing asynchronous is in flight.
///
/// The original number, kept for exactly the case it was chosen for: the queue
/// still has to be drained (cloud writes and achievement flushes put results on
/// it), and a shell showing a title screen has no reason to wake more often.
pub const IDLE_INTERVAL_MS: u64 = 200;

/// The live interval — a session is up, or one is being negotiated.
///
/// The snapshot rate, and the same number the P2P pump runs at. A faster pump
/// would buy nothing: nothing in this shell is waiting on a callback more often
/// than a packet arrives.
pub const FAST_INTERVAL_MS: u64 = 50;

/// What the pump is doing right now.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PumpState {
    /// The title screen, a run with no session, a build with no multiplayer.
    Idle,
    /// A lobby call is in flight, a session is listening, or a peer is
    /// connected — anything that puts a call-result on the queue.
    Live,
}

/// How long to sleep before the next drain.
pub fn interval(state: PumpState) -> Duration {
    Duration::from_millis(match state {
        PumpState::Idle => IDLE_INTERVAL_MS,
        PumpState::Live => FAST_INTERVAL_MS,
    })
}

/// The line the shell logs when the pump changes gear.
///
/// Worth a line rather than silent: a bug report about a laggy lobby is read
/// with this log open, and "the pump never went fast" is the first thing to
/// rule out.
pub fn describe(state: PumpState) -> String {
    match state {
        PumpState::Idle => {
            format!("steam: callback pump idling at {IDLE_INTERVAL_MS} ms — nothing in flight")
        }
        PumpState::Live => format!(
            "steam: callback pump at {FAST_INTERVAL_MS} ms — matchmaking and P2P are call-results"
        ),
    }
}
