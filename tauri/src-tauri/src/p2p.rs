// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! THE STEAM P2P PUMP, as a thread — the effects half of
//! [`adastrail_shell::steam_p2p`], and the peer of
//! `electron/src/net-steam-p2p.ts`.
//!
//! It exists in the shell rather than beside the UDP transport because the
//! Steam handshake is a single global one this process owns and the session
//! runs in another; what it drains is forwarded down the control channel to
//! `server/net/relay.ts`, which presents it to the session as an ordinary
//! transport.
//!
//! **THIS IS THE ONLY GAME TRAFFIC THAT PASSES THROUGH THE SHELL, AND IT IS
//! FORCED.** The UDP door is bound inside the session process, so the path that
//! carries the bulk of any real session — and the whole of the dedicated
//! server's — never touches this thread. What comes through here is the Steam
//! relay, whose peers are friends rather than a public server's clients.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use adastrail_shell::net::{peer_control, peer_lost_control};
use adastrail_shell::output;
use adastrail_shell::steam_p2p::{PeerTable, MAX_PER_PUMP, PUMP_MS, TIMED_OUT};
use steamworks::{SendType, SteamId};

use crate::session::Sidecar;
use crate::steam::steam_client;

/// A running pump. Dropping it stops the thread.
pub struct P2pPump {
    running: Arc<AtomicBool>,
}

impl P2pPump {
    /// Start draining the queue for one session, or `None` when there is no
    /// Steam here.
    ///
    /// `None` rather than a no-op, because the caller has to decide differently:
    /// a host with no Steam has no lobby to advertise and must offer an address
    /// instead of an invite.
    pub fn start(sidecar: Arc<Sidecar>) -> Option<Self> {
        steam_client()?;
        let running = Arc::new(AtomicBool::new(true));
        let flag = Arc::clone(&running);
        std::thread::Builder::new()
            .name("steam-p2p".to_string())
            .spawn(move || pump(&flag, &sidecar))
            .ok()?;
        Some(Self { running })
    }

    /// Send bytes to one peer, keyed by its Steam id as a decimal string.
    ///
    /// A send to a peer that has quit fails here, and a panic on the session's
    /// own forwarding path would let any client take the host down by closing
    /// their game at the wrong moment.
    pub fn send(to: &str, data: &[u8], reliable: bool) {
        let (Some(client), Ok(id)) = (steam_client(), to.parse::<u64>()) else {
            return;
        };
        let sent = client.networking().send_p2p_packet(
            SteamId::from_raw(id),
            if reliable {
                SendType::Reliable
            } else {
                SendType::Unreliable
            },
            data,
        );
        if !sent {
            output::warn(&format!("steam p2p: could not send to {to}"));
        }
    }
}

impl Drop for P2pPump {
    fn drop(&mut self) {
        self.running.store(false, Ordering::SeqCst);
    }
}

fn pump(running: &AtomicBool, sidecar: &Sidecar) {
    let mut peers = PeerTable::new();
    let mut buffer = vec![0u8; 8 * 1024];
    while running.load(Ordering::SeqCst) {
        let Some(client) = steam_client() else {
            return;
        };
        for _ in 0..MAX_PER_PUMP {
            let Some(size) = client.networking().is_p2p_packet_available() else {
                break;
            };
            if size > buffer.len() {
                buffer.resize(size, 0);
            }
            let Some((from, read)) = client.networking().read_p2p_packet(&mut buffer[..size])
            else {
                // A racing read on a polled queue is an ordinary event and must
                // not stop the pump — the next packet may be fine.
                break;
            };
            let key = from.raw().to_string();
            if peers.heard(&key, now_ms()) {
                // FIRST CONTACT. Accepting is what opens Valve's relay for this
                // pair; whether the person may reach the SIMULATION is decided
                // once, by `server/net/hub.ts`, behind the challenge and the
                // password.
                client.networking().accept_p2p_session(from);
            }
            sidecar.send(&peer_control(&key, &buffer[..read]));
        }
        for lost in peers.expired(now_ms()) {
            sidecar.send(&peer_lost_control(&lost, TIMED_OUT));
        }
        std::thread::sleep(Duration::from_millis(PUMP_MS));
    }
}

/// Milliseconds since the epoch — the clock [`PeerTable`] measures silence
/// against. A wall clock rather than a monotonic one because the table already
/// tolerates a clock that went backwards, and `Instant` cannot be handed to a
/// decision layer that has no `std::time` in its vocabulary.
fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|since| since.as_millis() as u64)
        .unwrap_or_default()
}
