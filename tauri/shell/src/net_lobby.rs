// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! THE LOBBY — Steam matchmaking, which IS the server browser. The peer of
//! `electron/src/net-lobby.ts`, with the metadata rules here and the client in
//! `src-tauri/src/lobby.rs`.
//!
//! `getLobbies()` is the game list, and the lobby's own metadata is what makes
//! that list useful WITHOUT connecting to anything: the session name, the
//! host's name, the difficulty, the level, how many are in it, the protocol and
//! build both ends must agree on, whether a password is set, the mod list, and
//! the direct address if the host is offering one. A browser row that had to
//! open a connection to fill itself in would be a browser that hammers every
//! host on it every time somebody scrolls.
//!
//! **THE METADATA IS A CLAIM, NOT A FACT, and the handshake is what settles
//! it.** A host writes its own row; nothing stops one advertising the wrong
//! build or a player count it does not have. That is fine and is why the row's
//! job is to let a player CHOOSE rather than to be trusted — every one of those
//! fields is checked again for real by `server/net/hub.ts` before a byte
//! reaches the session, and a mismatch is refused by name.
//!
//! **THE KEYS ARE SHORT, STABLE, AND SHARED WITH THE OTHER SHELL.** Steam caps
//! lobby metadata, and these key names are part of the wire in every sense that
//! matters: a build that renamed one would silently stop seeing the other
//! build's sessions, with no error anywhere — and the two builds here are the
//! Electron shell and this one, which must be able to see each other's games.
//! `LOBBY_KEYS` in `electron/src/net-lobby.ts` is the same table.

use std::collections::BTreeMap;

use serde_json::{json, Value};

/// The metadata keys. Short, and never changed once a build has shipped.
pub mod keys {
    /// The session's name, as the host typed it.
    pub const NAME: &str = "n";
    /// The host player's own name.
    pub const HOST: &str = "h";
    /// Which level the session is on.
    pub const LEVEL: &str = "l";
    /// Which difficulty.
    pub const DIFFICULTY: &str = "d";
    /// How many are in it.
    pub const PLAYERS: &str = "p";
    /// How many it will take.
    pub const MAX_PLAYERS: &str = "m";
    /// The wire protocol both ends must agree on.
    pub const PROTOCOL: &str = "v";
    /// The engine build both ends must agree on.
    pub const BUILD: &str = "b";
    /// Whether a password is set.
    pub const PASSWORD: &str = "w";
    /// The mods, comma-separated, in load order.
    pub const MODS: &str = "o";
    /// The host's direct address, when it is offering one — which is what lets
    /// a player who found a session over Steam join it over UDP instead.
    pub const ADDRESS: &str = "a";
}

/// Steam's own lobby types, spelled here so the provider does not have to
/// export the binding's enum through the decision layer.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LobbyVisibility {
    /// Appears in the browser.
    Public,
    /// Reachable only through an invite. The default, which is the setting a
    /// player who did not think about it should end up with.
    FriendsOnly,
}

/// What a host publishes about its session.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct LobbyAdvert {
    /// The session's name.
    pub name: String,
    /// The host player's name, filled in by the shell from Steam.
    pub host: String,
    /// Which level.
    pub level: String,
    /// Which difficulty.
    pub difficulty: String,
    /// How many are in it.
    pub players: u32,
    /// How many it will take.
    pub max_players: u32,
    /// The wire protocol, from the SESSION — see [`LobbyAdvert::protocol`].
    pub protocol: u32,
    /// The engine build, from the session for the same reason.
    pub build: String,
    /// Whether a password is set.
    pub needs_password: bool,
    /// The mods, in load order.
    pub mods: Vec<String>,
    /// The direct address, or `None` for "I am not offering one".
    pub address: Option<String>,
}

/// The metadata one advert writes, as key/value pairs.
///
/// A map rather than a series of calls so the whole shape is one testable
/// value — and sorted, so a test compares a table rather than an order.
///
/// **An absent address is written as an EMPTY STRING rather than skipped.** A
/// host that turns the direct door off must overwrite its previous address; a
/// row left advertising a dead one is the worst possible answer, because the
/// player who clicks it waits out a probe against a socket that is gone.
pub fn advert_data(advert: &LobbyAdvert) -> BTreeMap<&'static str, String> {
    let mut data = BTreeMap::new();
    data.insert(keys::NAME, advert.name.clone());
    data.insert(keys::HOST, advert.host.clone());
    data.insert(keys::LEVEL, advert.level.clone());
    data.insert(keys::DIFFICULTY, advert.difficulty.clone());
    data.insert(keys::PLAYERS, advert.players.to_string());
    data.insert(keys::MAX_PLAYERS, advert.max_players.to_string());
    data.insert(keys::PROTOCOL, advert.protocol.to_string());
    data.insert(keys::BUILD, advert.build.clone());
    data.insert(
        keys::PASSWORD,
        if advert.needs_password { "1" } else { "0" }.to_string(),
    );
    data.insert(keys::MODS, advert.mods.join(","));
    data.insert(keys::ADDRESS, advert.address.clone().unwrap_or_default());
    data
}

/// One row in the browser, as the page reads it.
///
/// Built as JSON rather than a struct because it goes straight into a `browse`
/// event and the page's `BrowserRow` is the shape that matters — a Rust type in
/// between would be a third place the field names are written down.
pub fn row(id: &str, data: &BTreeMap<String, String>) -> Value {
    let at = |key: &str| data.get(key).cloned().unwrap_or_default();
    let number = |key: &str| at(key).parse::<u64>().unwrap_or(0);
    let mods = at(keys::MODS);
    json!({
        "id": id,
        "name": at(keys::NAME),
        "host": at(keys::HOST),
        "level": at(keys::LEVEL),
        "difficulty": at(keys::DIFFICULTY),
        "players": number(keys::PLAYERS),
        "maxPlayers": number(keys::MAX_PLAYERS),
        "protocol": number(keys::PROTOCOL),
        "build": at(keys::BUILD),
        "needsPassword": at(keys::PASSWORD) == "1",
        "mods": if mods.is_empty() { Vec::new() } else {
            mods.split(',').map(str::to_string).collect::<Vec<_>>()
        },
        "address": if at(keys::ADDRESS).is_empty() { Value::Null } else { json!(at(keys::ADDRESS)) },
    })
}

/// Is this row worth showing?
///
/// A lobby that vanished between the list and the read comes back with no
/// metadata at all, which is an ordinary race rather than a session. Rows this
/// build cannot JOIN are a different question and are deliberately NOT filtered
/// — a player whose friend is on a newer build and whose list is simply empty
/// concludes the feature is broken; one who sees the session greyed with
/// "BUILD 1.4.2" goes and updates. That is the screen's decision, with the
/// reason in hand.
pub fn worth_showing(row: &Value) -> bool {
    row.get("name")
        .and_then(Value::as_str)
        .is_some_and(|name| !name.is_empty())
}

/// Somewhere a session can be advertised and found — the platform seam behind
/// the browser, so the bridge above it is testable without Steam.
///
/// Every method is synchronous, which is the same platform fact the cloud seam
/// records: Steam's calls return on the calling thread and the shell has no
/// async runtime to promise into.
pub trait LobbyProvider: Send + Sync {
    /// Publish a lobby and answer its id, or `None` when there is no Steam.
    fn host(&self, advert: &LobbyAdvert, visibility: LobbyVisibility) -> Option<String>;
    /// Rewrite the row — the player count changes as people come and go.
    fn update(&self, id: &str, data: &BTreeMap<&'static str, String>);
    /// Steam's own invite panel, which is the whole reason the Steam door is
    /// the default: a friend accepts and Valve handles the route, the NAT and
    /// the address a player would otherwise have to be told.
    fn invite(&self, id: &str) -> bool;
    /// Take the row down. Joinable must go false BEFORE leaving — a lobby left
    /// while still joinable stays in the browser until Steam reaps it, and
    /// every player who clicks it gets a session that is not there.
    fn close(&self, id: &str);
    /// Every lobby this account can see, as id and metadata.
    fn browse(&self) -> Vec<(String, BTreeMap<String, String>)>;
    /// Join one by id, and hand back the host's Steam id — which is the peer
    /// key the relayed transport addresses.
    fn join(&self, id: &str) -> Option<(String, BTreeMap<String, String>)>;
    /// The signed-in player's name, for the row's HOST column.
    fn player_name(&self) -> Option<String>;
}
