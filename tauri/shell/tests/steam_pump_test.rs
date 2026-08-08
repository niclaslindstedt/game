// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! THE CALLBACK PUMP's two gears, and the peer pump that has to keep up with
//! one of them.
//!
//! This is the phase-2 leftover phase 3 had to settle BEFORE the net bridge:
//! matchmaking arrives as call-results through `run_callbacks`, so a 200 ms
//! pump would cost every lobby round trip a fifth of a second and cap packet
//! delivery at 5 Hz — a broken network for a reason living in a constant nobody
//! was looking at.

use std::time::Duration;

use adastrail_shell::steam_p2p::{PeerTable, PUMP_MS, TIMED_OUT};
use adastrail_shell::steam_pump::{describe, interval, PumpState, FAST_INTERVAL_MS};

#[test]
fn a_session_pumps_at_the_snapshot_rate_and_a_title_screen_does_not() {
    assert_eq!(interval(PumpState::Live), Duration::from_millis(50));
    assert_eq!(interval(PumpState::Idle), Duration::from_millis(200));
    assert!(interval(PumpState::Live) < interval(PumpState::Idle));
}

#[test]
fn the_callback_pump_never_runs_slower_than_the_packet_pump() {
    // A callback queue drained less often than packets arrive is a queue that
    // grows for as long as the session lasts.
    const { assert!(FAST_INTERVAL_MS <= PUMP_MS) };
}

#[test]
fn the_gear_change_is_worth_a_line_in_the_log() {
    // A bug report about a laggy lobby is read with this log open, and "the
    // pump never went fast" is the first thing to rule out.
    assert!(describe(PumpState::Live).contains("50 ms"));
    assert!(describe(PumpState::Idle).contains("200 ms"));
}

#[test]
fn the_relay_is_opened_for_a_peer_exactly_once() {
    // `accept_p2p_session` is idempotent, so calling it on every packet would
    // be invisible and would cost a Steam API call per frame per peer.
    let mut peers = PeerTable::new();
    assert!(peers.heard("7656", 0), "first contact");
    assert!(!peers.heard("7656", 20));
    assert!(
        peers.heard("7657", 20),
        "a different peer is its own first contact"
    );
    assert_eq!(peers.len(), 2);
}

#[test]
fn a_peer_that_goes_quiet_is_reported_once_and_then_forgotten() {
    // Steam reports no disconnection on this API, so silence is the only signal
    // there is — and a spectator whose client quit must not hold a seat for
    // ever.
    let mut peers = PeerTable::new();
    peers.heard("7656", 1_000);
    peers.heard("7657", 1_000);
    assert!(peers.expired(15_000).is_empty(), "still inside the window");

    let mut gone = peers.expired(17_000);
    gone.sort();
    assert_eq!(gone, vec!["7656".to_string(), "7657".to_string()]);
    assert!(peers.is_empty());
    assert!(peers.expired(99_000).is_empty(), "and not reported twice");

    // …and a peer that comes back is first contact again, because the relay was
    // torn down with it.
    assert!(peers.heard("7656", 20_000));
}

#[test]
fn a_clock_that_went_backwards_does_not_evict_the_whole_lobby() {
    // A system clock change must not read as fifteen seconds of silence from
    // everybody at once.
    let mut peers = PeerTable::new();
    peers.heard("7656", 10_000);
    assert!(peers.expired(5_000).is_empty());
    assert_eq!(peers.len(), 1);
}

#[test]
fn a_lost_peer_carries_one_reason_rather_than_a_taxonomy() {
    // The relay only logs it, and a taxonomy nobody branches on is one that
    // drifts.
    assert_eq!(TIMED_OUT, "timed out");
}

#[test]
fn clearing_the_pump_forgets_everybody() {
    let mut peers = PeerTable::new();
    peers.heard("7656", 0);
    peers.clear();
    assert!(peers.is_empty());
}
