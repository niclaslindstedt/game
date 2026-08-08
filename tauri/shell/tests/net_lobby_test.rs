// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! THE LOBBY ROW — the browser's whole content, written by one shell and read
//! by the other.
//!
//! The keys are the point. They are short because Steam caps lobby metadata,
//! and they are FIXED because a build that renamed one would silently stop
//! seeing the other build's sessions with no error anywhere — and during this
//! migration the two builds are Electron and Tauri, which have to be able to
//! find each other's games.

use std::collections::BTreeMap;

use adastrail_shell::net_lobby::{advert_data, keys, row, worth_showing, LobbyAdvert};
use serde_json::json;

fn advert() -> LobbyAdvert {
    LobbyAdvert {
        name: "ADA'S TRAIL".to_string(),
        host: "NIC".to_string(),
        level: "moon-basin".to_string(),
        difficulty: "hard".to_string(),
        players: 2,
        max_players: 4,
        protocol: 17,
        build: "1.4.2".to_string(),
        needs_password: true,
        mods: vec!["greenhouse".to_string(), "longnight".to_string()],
        address: Some("10.0.0.4:27015".to_string()),
    }
}

/// A written advert, read straight back — the round trip a real browser makes
/// across two machines.
fn round_trip(advert: &LobbyAdvert) -> serde_json::Value {
    let written: BTreeMap<String, String> = advert_data(advert)
        .into_iter()
        .map(|(key, value)| (key.to_string(), value))
        .collect();
    row("109775240", &written)
}

#[test]
fn the_metadata_keys_are_the_ones_the_other_shell_writes() {
    // Spelled out rather than derived, because this is the wire: the day one of
    // these changes, the two desktop builds stop seeing each other and nothing
    // anywhere reports an error.
    assert_eq!(keys::NAME, "n");
    assert_eq!(keys::HOST, "h");
    assert_eq!(keys::LEVEL, "l");
    assert_eq!(keys::DIFFICULTY, "d");
    assert_eq!(keys::PLAYERS, "p");
    assert_eq!(keys::MAX_PLAYERS, "m");
    assert_eq!(keys::PROTOCOL, "v");
    assert_eq!(keys::BUILD, "b");
    assert_eq!(keys::PASSWORD, "w");
    assert_eq!(keys::MODS, "o");
    assert_eq!(keys::ADDRESS, "a");
}

#[test]
fn what_a_host_publishes_is_what_a_browser_reads() {
    let read = round_trip(&advert());
    assert_eq!(read["id"], json!("109775240"));
    assert_eq!(read["name"], json!("ADA'S TRAIL"));
    assert_eq!(read["host"], json!("NIC"));
    assert_eq!(read["level"], json!("moon-basin"));
    assert_eq!(read["difficulty"], json!("hard"));
    assert_eq!(read["players"], json!(2));
    assert_eq!(read["maxPlayers"], json!(4));
    assert_eq!(read["protocol"], json!(17));
    assert_eq!(read["build"], json!("1.4.2"));
    assert_eq!(read["needsPassword"], json!(true));
    assert_eq!(read["mods"], json!(["greenhouse", "longnight"]));
    assert_eq!(read["address"], json!("10.0.0.4:27015"));
}

#[test]
fn a_host_that_stops_offering_an_address_overwrites_the_old_one() {
    // An absent address is written as an EMPTY STRING rather than skipped: a
    // row left advertising a dead address is the worst possible answer, because
    // the player who clicks it waits out a probe against a socket that is gone.
    let mut steam_only = advert();
    steam_only.address = None;
    let written = advert_data(&steam_only);
    assert_eq!(written.get(keys::ADDRESS), Some(&String::new()));
    assert_eq!(round_trip(&steam_only)["address"], serde_json::Value::Null);
}

#[test]
fn a_row_with_no_mods_is_an_empty_list_rather_than_one_empty_name() {
    // `"".split(',')` yields one empty string, which would show as a session
    // requiring a mod called nothing.
    let mut vanilla = advert();
    vanilla.mods = Vec::new();
    assert_eq!(round_trip(&vanilla)["mods"], json!([]));
}

#[test]
fn a_lobby_that_vanished_mid_read_is_dropped_rather_than_shown_blank() {
    // An ordinary race between the list and the read; it comes back with no
    // metadata at all.
    let empty = row("1", &BTreeMap::new());
    assert!(!worth_showing(&empty));
    assert_eq!(
        empty["players"],
        json!(0),
        "and reads as zeroes, not a panic"
    );
    assert!(worth_showing(&round_trip(&advert())));
}

#[test]
fn a_row_this_build_cannot_join_is_still_a_row() {
    // NOT filtered: a player whose friend is on a newer build and whose list is
    // simply empty concludes the feature is broken; one who sees the session
    // greyed with its build number goes and updates. The screen decides, with
    // the reason in hand.
    let mut newer = advert();
    newer.protocol = 999;
    newer.build = "9.9.9".to_string();
    let read = round_trip(&newer);
    assert!(worth_showing(&read));
    assert_eq!(read["protocol"], json!(999));
}

#[test]
fn a_hand_mangled_number_reads_as_zero_rather_than_taking_the_browser_down() {
    // Every field is a CLAIM: nothing stops a host writing letters where a
    // count goes, and the browser is a list rather than an authority.
    let mut written = BTreeMap::new();
    written.insert(keys::NAME.to_string(), "ODD".to_string());
    written.insert(keys::PLAYERS.to_string(), "lots".to_string());
    let read = row("2", &written);
    assert_eq!(read["players"], json!(0));
    assert!(worth_showing(&read));
}
