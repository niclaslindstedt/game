// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! STEAM MATCHMAKING — the effects half of [`adastrail_shell::net_lobby`], and
//! the peer of the Steam half of `electron/src/net-lobby.ts`.
//!
//! **EVERY CALL HERE IS A CALL-RESULT, WHICH IS WHY THE CALLBACK PUMP HAD TO BE
//! RE-DECIDED FIRST.** `create_lobby`, `request_lobby_list` and `join_lobby`
//! answer through `run_callbacks`, so their latency is the pump's interval and
//! nothing else. [`adastrail_shell::steam_pump`] carries that argument; what is
//! here simply blocks the calling worker thread on the answer.
//!
//! Blocking is correct rather than lazy: the net bridge already runs each
//! request on a thread of its own so the page's IPC is never held, and the
//! alternative — threading a callback back through the bridge — would put an
//! asynchronous seam inside a decision layer that is deliberately synchronous
//! (`cloud_provider.rs` makes the same trade for the same reason).

use std::collections::BTreeMap;
use std::sync::mpsc;
use std::time::Duration;

use adastrail_shell::net_lobby::{LobbyAdvert, LobbyProvider, LobbyVisibility};
use adastrail_shell::output;
use steamworks::{LobbyId, LobbyType};

use crate::steam::{steam_client, steam_player_name};

/// How long one matchmaking call may take before the shell gives up on it.
///
/// Generous, because it is a round trip to Valve's servers rather than a local
/// call — and finite, because a HOST screen that spins for ever is worse than
/// one that says the lobby could not be opened.
const CALL_TIMEOUT: Duration = Duration::from_secs(10);

/// The lobby provider, or `None` when there is no Steam here.
///
/// `None` rather than a no-op object, because the caller has to make a
/// different decision either way: a host with no Steam has no lobby to
/// advertise and its HOST screen must offer the address instead of an invite
/// button.
pub fn lobby_provider() -> Option<Box<dyn LobbyProvider>> {
    steam_client().map(|_| Box::new(SteamLobbies) as Box<dyn LobbyProvider>)
}

struct SteamLobbies;

/// One lobby id, as Steam wants it.
///
/// A lobby id is a uint64 that travels as text everywhere else in this
/// codebase, so a malformed one is a page (or a browser row) that is out of
/// date rather than an error worth raising.
fn lobby_id(id: &str) -> Option<LobbyId> {
    id.parse::<u64>().ok().map(LobbyId::from_raw)
}

impl LobbyProvider for SteamLobbies {
    fn host(&self, advert: &LobbyAdvert, visibility: LobbyVisibility) -> Option<String> {
        let client = steam_client()?;
        let (sender, replies) = mpsc::channel();
        client.matchmaking().create_lobby(
            match visibility {
                LobbyVisibility::Public => LobbyType::Public,
                LobbyVisibility::FriendsOnly => LobbyType::FriendsOnly,
            },
            advert.max_players.clamp(1, 250),
            move |result| {
                let _ = sender.send(result);
            },
        );
        let created = match replies.recv_timeout(CALL_TIMEOUT) {
            Ok(Ok(lobby)) => lobby,
            Ok(Err(err)) => {
                output::warn(&format!("lobby: could not create — {err}"));
                return None;
            }
            Err(_) => {
                output::warn("lobby: Steam did not answer the create in time");
                return None;
            }
        };

        // The host's own name is the shell's to fill in: the session process has
        // never met the Steam client, and a row whose HOST column said "HOST"
        // would be a browser nobody can pick a friend out of.
        let mut named = advert.clone();
        if named.host.is_empty() {
            named.host = steam_player_name().unwrap_or_else(|| "HOST".to_string());
        }
        write(
            client,
            created,
            &adastrail_shell::net_lobby::advert_data(&named),
        );
        client.matchmaking().set_lobby_joinable(created, true);
        Some(created.raw().to_string())
    }

    fn update(&self, id: &str, data: &BTreeMap<&'static str, String>) {
        let (Some(client), Some(lobby)) = (steam_client(), lobby_id(id)) else {
            return;
        };
        write(client, lobby, data);
    }

    fn invite(&self, id: &str) -> bool {
        let (Some(client), Some(lobby)) = (steam_client(), lobby_id(id)) else {
            return false;
        };
        // Steam's own invite panel, which is the whole reason the Steam door is
        // the default: a friend accepts and Valve handles the route, the NAT and
        // the address a player would otherwise have to be told.
        //
        // **AND IT IS THE ONE PIECE OF THE OVERLAY THIS SHELL STILL GETS.** The
        // panel is drawn by the Steam CLIENT rather than by the injected
        // overlay, so it opens over the game the same way it opens over the
        // library — see `adastrail_shell::steam::overlay_support` for what is
        // genuinely gone.
        client.friends().activate_invite_dialog(lobby);
        true
    }

    fn close(&self, id: &str) {
        let (Some(client), Some(lobby)) = (steam_client(), lobby_id(id)) else {
            return;
        };
        // Joinable false BEFORE leaving: a lobby that is left while still
        // joinable stays in the browser until Steam reaps it, and every player
        // who clicks it gets a session that is not there.
        client.matchmaking().set_lobby_joinable(lobby, false);
        client.matchmaking().leave_lobby(lobby);
    }

    fn browse(&self) -> Vec<(String, BTreeMap<String, String>)> {
        let Some(client) = steam_client() else {
            return Vec::new();
        };
        let (sender, replies) = mpsc::channel();
        client.matchmaking().request_lobby_list(move |result| {
            let _ = sender.send(result);
        });
        let lobbies = match replies.recv_timeout(CALL_TIMEOUT) {
            Ok(Ok(lobbies)) => lobbies,
            Ok(Err(err)) => {
                output::warn(&format!("lobby: could not browse — {err}"));
                return Vec::new();
            }
            Err(_) => {
                output::warn("lobby: Steam did not answer the browse in time");
                return Vec::new();
            }
        };
        lobbies
            .into_iter()
            .map(|lobby| (lobby.raw().to_string(), read(client, lobby)))
            .collect()
    }

    fn join(&self, id: &str) -> Option<(String, BTreeMap<String, String>)> {
        let client = steam_client()?;
        let lobby = lobby_id(id)?;
        let (sender, replies) = mpsc::channel();
        client.matchmaking().join_lobby(lobby, move |result| {
            let _ = sender.send(result);
        });
        match replies.recv_timeout(CALL_TIMEOUT) {
            Ok(Ok(joined)) => {
                // The OWNER's Steam id is the peer key the relayed transport
                // addresses — joining the lobby is how a joiner learns it.
                let owner = client.matchmaking().lobby_owner(joined);
                Some((owner.raw().to_string(), read(client, joined)))
            }
            Ok(Err(())) => {
                output::warn(&format!("lobby: could not join {id}"));
                None
            }
            Err(_) => {
                output::warn(&format!("lobby: Steam did not answer the join of {id}"));
                None
            }
        }
    }

    fn player_name(&self) -> Option<String> {
        steam_player_name()
    }
}

/// Write one advert's metadata.
///
/// A write that fails leaves the previous value, which is a stale row rather
/// than a broken one — and never worth a throw on the path that is publishing a
/// game.
fn write(client: &steamworks::Client, lobby: LobbyId, data: &BTreeMap<&'static str, String>) {
    for (key, value) in data {
        client.matchmaking().set_lobby_data(lobby, key, value);
    }
}

/// …and read it all back.
///
/// A lobby that vanished between the list and the read comes back empty, which
/// `net_lobby::worth_showing` drops — an ordinary race rather than a session.
fn read(client: &steamworks::Client, lobby: LobbyId) -> BTreeMap<String, String> {
    let mut data = BTreeMap::new();
    let count = client.matchmaking().lobby_data_count(lobby);
    for index in 0..count {
        if let Some((key, value)) = client.matchmaking().lobby_data_by_index(lobby, index) {
            data.insert(key, value);
        }
    }
    data
}
