// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! THE STEAM P2P PUMP's rules — the peer of `electron/src/net-steam-p2p.ts`,
//! with the queue itself in `src-tauri/src/p2p.rs`.
//!
//! It exists in the shell rather than beside the UDP transport for one forced
//! reason: the Steam handshake is a single global one, `src-tauri/src/steam.rs`
//! is its one owner, and the session runs in a different process. So the queue
//! is pumped here and what it finds is forwarded down the control channel to
//! `server/net/relay.ts`, which presents it to the session as an ordinary
//! transport. Neither half knows about the other's medium; that is what the
//! seam is for.
//!
//! **IT IS A POLL, NOT A SOCKET.** The legacy `ISteamNetworking` surface both
//! bindings expose is `is_p2p_packet_available()` / `read_p2p_packet()`, with
//! no callback to register — so something has to ask, on a clock.
//!
//! **AND THE CLOCK IS THE PHASE-2 LEFTOVER THIS MODULE CLOSES.** Phase 2's
//! callback pump ran at 200 ms and argued, correctly for phase 2, that nothing
//! it called blocked on a callback. Networking does: matchmaking arrives as
//! call-results delivered THROUGH `run_callbacks`, so inheriting that number
//! would cap packet delivery at 5 Hz and cost a lobby round trip a fifth of a
//! second. [`crate::steam_pump`] is where that is re-decided; what is here is
//! the pump this feature runs on top of it.
//!
//! **EVERY PEER IS ACCEPTED, AND THAT IS SAFE PRECISELY BECAUSE THE HUB
//! EXISTS.** `accept_p2p_session` is Steam's "will you talk to this person at
//! all", and refusing there would mean re-implementing admission in a second
//! place with a worse view of the session. What is accepted here is a ROUTE;
//! whether the person at the other end may reach the simulation is decided
//! once, by `server/net/hub.ts`, behind the challenge and the password.

use std::collections::HashMap;

/// How often the queue is drained, in milliseconds — the snapshot rate.
///
/// Twenty times a second is what the session publishes at, and a relayed peer's
/// packets arriving at half that would show up as a stutter nobody could point
/// at. It is deliberately the SAME number as the fast callback pump
/// ([`crate::steam_pump::FAST_INTERVAL_MS`]) rather than a coincidence: both
/// exist because a session is live, and both stop when it is not.
pub const PUMP_MS: u64 = 50;

/// The most packets one pump drains, so a burst cannot hold the pump thread.
///
/// Anything left is drained 50 ms later, which on a control-plane channel is
/// not a latency anybody can feel.
pub const MAX_PER_PUMP: usize = 64;

/// How long a peer may say nothing before the relay is told it is gone.
///
/// Steam reports no disconnection on this API, so silence is the only signal
/// there is — and a spectator whose Steam client quit must not hold a seat for
/// ever.
pub const PEER_TIMEOUT_MS: u64 = 15_000;

/// Who we have heard from, and when.
///
/// The whole of the pump's state, kept here so the two decisions that matter —
/// "is this first contact, and therefore an `accept_p2p_session`" and "who has
/// gone quiet" — are testable against a clock a test owns.
#[derive(Debug, Default)]
pub struct PeerTable {
    heard: HashMap<String, u64>,
}

impl PeerTable {
    /// An empty table.
    pub fn new() -> Self {
        Self::default()
    }

    /// Note a packet from `peer` at `now`, and answer whether this is FIRST
    /// CONTACT — which is the moment, and the only moment, Valve's relay has to
    /// be opened for the pair.
    ///
    /// Answering it here rather than at the call site is what stops
    /// `accept_p2p_session` being called on every packet: it is idempotent, so
    /// the bug would be invisible and would cost a Steam API call per frame per
    /// peer.
    pub fn heard(&mut self, peer: &str, now: u64) -> bool {
        let first = !self.heard.contains_key(peer);
        self.heard.insert(peer.to_string(), now);
        first
    }

    /// Everybody who has gone quiet for [`PEER_TIMEOUT_MS`], removed from the
    /// table on the way out so each is reported exactly once.
    pub fn expired(&mut self, now: u64) -> Vec<String> {
        let gone: Vec<String> = self
            .heard
            .iter()
            .filter(|(_, heard)| now.saturating_sub(**heard) > PEER_TIMEOUT_MS)
            .map(|(peer, _)| peer.clone())
            .collect();
        for peer in &gone {
            self.heard.remove(peer);
        }
        gone
    }

    /// How many peers are being tracked.
    pub fn len(&self) -> usize {
        self.heard.len()
    }

    /// Whether anybody is.
    pub fn is_empty(&self) -> bool {
        self.heard.is_empty()
    }

    /// Forget everybody — the pump was closed.
    pub fn clear(&mut self) {
        self.heard.clear();
    }
}

/// The reason a lost peer is reported with. One string, because the relay only
/// logs it and a taxonomy nobody branches on is a taxonomy that drifts.
pub const TIMED_OUT: &str = "timed out";
