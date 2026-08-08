// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! THE ONE OWNER OF THE STEAM CLIENT — the effects half of
//! [`adastrail_shell::steam`], and the peer of `electron/src/steam.ts`.
//!
//! It exists for the reason that file exists: `Client::init_app` is a single
//! global handshake with the running Steam client, and the three features built
//! on it (cloud save, achievements, and the screenshot library) must SHARE that
//! one handshake rather than each performing their own. So every provider asks
//! this module for the client and nobody else initializes one.
//!
//! **It never panics.** The handshake fails when Steam isn't running, when the
//! app id is unknown to it, or when the game was launched outside Steam — all of
//! which are ordinary situations for a developer build and none of which may
//! stop the game from starting. A failed handshake is memoized as "no client",
//! every provider reports itself unavailable, and the game plays device-locally,
//! exactly as it does in a browser.
//!
//! ## The callback pump
//!
//! Steamworks delivers results by callback, and a process that never runs them
//! accumulates a queue. A game runs them once a frame; this shell has no frame
//! of its own — the webview owns the drawing — so it runs them on a thread of
//! its own at a leisurely interval. Nothing this shell calls today BLOCKS on a
//! callback (the cloud reads wait on their own API call, and the achievements
//! are in-memory writes flushed by `store_stats`), so the pump is what keeps the
//! queue drained rather than something the features wait for.
//!
//! **PHASE 3 CHANGED THAT, AND THE PUMP IS NOW TWO GEARS.** Steam P2P is POLLED
//! and matchmaking is delivered as call-results THROUGH `run_callbacks`, so a
//! flat 200 ms would have made the interval the network's latency floor: a lobby
//! round trip costing a fifth of a second and packet delivery capped at 5 Hz — a
//! broken session for a reason living in a constant nobody was looking at. The
//! decision is [`adastrail_shell::steam_pump`]; [`set_pump`] is how the net
//! bridge changes gear, and the loop below ASKS on every tick rather than being
//! re-armed, because a pump somebody has to remember to speed up is one they
//! forget to on the path that mattered.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;

use adastrail_shell::output;
use adastrail_shell::steam::{
    describe_status, is_placeholder_app_id, process_env, restart_wanted, steam_enabled, SteamStatus,
};
use adastrail_shell::steam_pump::{describe, interval, PumpState};
use steamworks::{AppId, Client};

/// Whether anything asynchronous is in flight — see [`set_pump`].
static PUMP_LIVE: AtomicBool = AtomicBool::new(false);

/// `None` = there is no Steam here. Resolved exactly once.
static CLIENT: OnceLock<Option<Client>> = OnceLock::new();

/// Ask Steam to relaunch this process through the client, if it should be.
///
/// **Called before the event loop**, which is the one piece of ordering this
/// module insists on: a process that is about to be replaced must not go on to
/// build a window. `true` means the caller should exit immediately.
///
/// The decision is [`restart_wanted`]'s — only for a real app id, never for
/// Spacewar.
pub fn restart_if_necessary() -> bool {
    let app_id = steam_app_id();
    if !restart_wanted(steam_enabled(&process_env), app_id) {
        return false;
    }
    if steamworks::restart_app_if_necessary(AppId(app_id)) {
        output::info("steam: relaunching through the Steam client…");
        return true;
    }
    false
}

/// The Steam client, or `None` when there is none.
///
/// Memoized INCLUDING the failure: the handshake is a handshake, not a poll, and
/// retrying it per request would mean a failed launch re-throwing into every
/// cloud read for the rest of the session.
pub fn steam_client() -> Option<&'static Client> {
    CLIENT.get_or_init(connect).as_ref()
}

fn connect() -> Option<Client> {
    if !steam_enabled(&process_env) {
        output::info(&describe_status(&SteamStatus::Disabled));
        return None;
    }
    let app_id = steam_app_id();
    match Client::init_app(app_id) {
        Ok(client) => {
            output::info(&describe_status(&SteamStatus::Connected {
                player: safe_name(&client),
                app_id,
                placeholder: is_placeholder_app_id(app_id),
            }));
            start_pump(client.clone());
            Some(client)
        }
        Err(err) => {
            output::warn(&describe_status(&SteamStatus::Unavailable {
                reason: err.to_string(),
            }));
            None
        }
    }
}

/// WHICH STEAM APP this process is, resolved once from the launch environment
/// and the packager's stamp.
///
/// Public because the Workshop needs it for every UGC call and the mods bridge
/// needs it for the hub URL — and both must ask the same question the handshake
/// asked, or a publish lands on a different app than the game is running as.
pub fn steam_app_id() -> u32 {
    adastrail_shell::steam::steam_app_id(&process_env, crate::stamp::STEAM_APP_ID)
}

/// Change the pump's gear.
///
/// `Live` the moment anything asynchronous is in flight — a session process, a
/// lobby call, a relayed peer — and `Idle` when the shell is back to a title
/// screen. See [`adastrail_shell::steam_pump`] for why the two numbers differ
/// and what inheriting the slow one would have cost.
pub fn set_pump(state: PumpState) {
    let live = state == PumpState::Live;
    if PUMP_LIVE.swap(live, Ordering::SeqCst) != live {
        output::info(&describe(state));
    }
}

/// Drain the callback queue for the life of the process.
///
/// Detached on purpose: there is nothing to join it to. The thread holds a clone
/// of the client, which is an `Arc` inside, so the handle stays alive exactly as
/// long as the process does.
fn start_pump(client: Client) {
    let spawned = std::thread::Builder::new()
        .name("steam-callbacks".to_string())
        .spawn(move || loop {
            client.run_callbacks();
            // ASKED every tick rather than re-armed — see the module header.
            std::thread::sleep(interval(if PUMP_LIVE.load(Ordering::SeqCst) {
                PumpState::Live
            } else {
                PumpState::Idle
            }));
        });
    if let Err(err) = spawned {
        // Everything this shell asks Steam for is answered synchronously, so a
        // missing pump degrades rather than breaks — say so and carry on.
        output::warn(&format!(
            "steam: could not start the callback pump — {err}. \
             Cloud save and achievements still work; nothing asynchronous will."
        ));
    }
}

/// The signed-in player's name, or `None` when Steam can't say.
///
/// Used to label the game's own SIGNED IN AS line — never to key a save.
pub fn steam_player_name() -> Option<String> {
    let name = steam_client()?.friends().name();
    (!name.is_empty()).then_some(name)
}

/// The signed-in player's 64-bit Steam id as a string, or `None`.
pub fn steam_player_id() -> Option<String> {
    let id = steam_client()?.user().steam_id();
    (!id.is_invalid()).then(|| id.raw().to_string())
}

/// Whether Valve's overlay is actually loaded into this process.
///
/// A RUNTIME probe rather than the compile-time verdict in
/// [`adastrail_shell::steam::overlay_support`], and both are wanted: the verdict
/// is what the launch log explains, and this is what the two features that would
/// USE an overlay (the achievements board, the screenshot key) ask before
/// claiming to have opened anything. Today it answers false on every desktop —
/// but it answers it by asking, so the day the situation changes nothing here
/// has to be remembered.
pub fn overlay_loaded() -> bool {
    steam_client().is_some_and(|client| client.utils().is_overlay_enabled())
}

fn safe_name(client: &Client) -> String {
    let name = client.friends().name();
    if name.is_empty() {
        "unknown player".to_string()
    } else {
        name
    }
}
