// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! THE MULTIPLAYER PROTOCOL, both directions.
//!
//! Every assertion here is about a message the OTHER shell also sends or the
//! page also reads, so the file is really a check that three
//! implementations of one protocol still agree: `electron/src/net.ts`,
//! `pwa/src/app/net-bridge.ts` and this shell.
//!
//! The three that matter most are the ones a real session gets wrong
//! invisibly: the licence travelling from the BUILD rather than from the page,
//! the direct door overriding what the page asked for, and `listening`
//! reporting the port the socket actually got.

use adastrail_shell::capabilities::{BuildCapabilities, Capabilities, ALL_CAPABILITIES};
use adastrail_shell::net;
use serde_json::{json, Value};

fn request(message: Value) -> net::NetRequest {
    net::parse(&message)
}

fn licensed() -> Capabilities {
    Capabilities {
        built: ALL_CAPABILITIES,
        autopilot: false,
        unlocked: false,
        direct: false,
        port: None,
    }
}

fn download() -> Capabilities {
    Capabilities {
        built: BuildCapabilities {
            multiplayer: true,
            ..BuildCapabilities::default()
        },
        autopilot: false,
        unlocked: true,
        direct: false,
        port: None,
    }
}

#[test]
fn a_host_may_only_admit_anybody_when_the_build_says_so() {
    // THE LICENCE, NOT THE FEATURE. A build can have hosting turned on and hold
    // no licence, and it then runs a session nobody may join. Decided by the
    // build and the launch, never by anything the page can say — a page that
    // could set this would be a page that unlocks the product.
    let asked = request(json!({ "action": "host", "params": { "levelId": "moon" } }));

    let store = net::start_control(&asked, &licensed()).expect("a start");
    assert_eq!(store["allowDirect"], json!(true));

    let plain = net::start_control(&asked, &download()).expect("a start");
    assert_eq!(plain["allowDirect"], json!(false));
}

#[test]
fn a_start_forwards_what_only_the_session_understands_and_invents_nothing() {
    // `adopt`, `modDefs` and `loadout` are opaque on this hop: the session owns
    // what a run is, and a shell that parsed one would be a second place for
    // the two to disagree.
    let asked = request(json!({
        "action": "host",
        "params": { "levelId": "moon", "difficulty": "hard" },
        "adopt": { "tick": 4200 },
        "modDefs": { "enemies": [] },
        "password": "hunter2",
        "maxClients": 4,
        "bots": 2,
    }));
    let control = net::start_control(&asked, &licensed()).expect("a start");

    assert_eq!(control["kind"], json!("start"));
    assert_eq!(control["params"]["difficulty"], json!("hard"));
    assert_eq!(control["adopt"]["tick"], json!(4200));
    assert_eq!(control["modDefs"], json!({ "enemies": [] }));
    assert_eq!(control["maxClients"], json!(4));
    assert_eq!(control["bots"], json!(2));
    // Nothing was invented for a field the page did not send.
    assert!(control.get("mods").is_none());
}

#[test]
fn a_host_with_no_params_is_refused_rather_than_started_empty() {
    let asked = request(json!({ "action": "host" }));
    assert!(net::start_control(&asked, &licensed()).is_none());

    let event = net::hosted_event(3, None, Some("bad-params"));
    assert_eq!(event["ok"], json!(false));
    assert_eq!(event["reason"], json!("bad-params"));
}

#[test]
fn both_doors_open_by_default_and_a_direct_launch_takes_only_its_own() {
    // A host listens on BOTH by default: Steam friends get the frictionless
    // path, everyone else gets an address.
    let asked = request(json!({ "action": "listen" }));
    assert!(net::wants_steam(&asked, &licensed()));
    let control = net::listen_control(&asked, &licensed(), true);
    assert_eq!(control["udp"], json!(true));
    assert_eq!(control["steam"], json!(true));

    // …but a launch handed a direct port has no Steam client behind it to pump
    // a relay for, and the port it was given is the one it was given — even
    // when the page asked for another.
    let direct = Capabilities {
        built: ALL_CAPABILITIES,
        autopilot: false,
        unlocked: false,
        direct: true,
        port: Some(27_849),
    };
    let elsewhere = request(json!({ "action": "listen", "port": 27_015, "udp": false }));
    assert!(!net::wants_steam(&elsewhere, &direct));
    let control = net::listen_control(&elsewhere, &direct, false);
    assert_eq!(control["port"], json!(27_849));
    assert_eq!(control["udp"], json!(true), "the direct door is the door");
    assert_eq!(control["steam"], json!(false));
}

#[test]
fn asking_the_router_is_the_builds_call_and_never_the_pages() {
    // A port mapping is a change this program makes to somebody's ROUTER, so it
    // is a property of the build. A page that could ask for one would be a page
    // that reconfigures the player's hardware.
    let asked = request(json!({ "action": "listen", "map": true }));
    let no_upnp = Capabilities {
        built: BuildCapabilities {
            multiplayer: true,
            port_map: false,
            ..BuildCapabilities::default()
        },
        ..Capabilities::default()
    };
    assert_eq!(
        net::listen_control(&asked, &no_upnp, false)["map"],
        json!(false)
    );
    assert_eq!(
        net::listen_control(&asked, &licensed(), false)["map"],
        json!(true)
    );
}

#[test]
fn listening_reports_the_port_the_socket_actually_got() {
    // A HOST screen printing the REQUESTED port is the exact bug that makes
    // "direct connect doesn't work" unanswerable.
    let reply = json!({
        "kind": "listening",
        "bound": { "address": "192.168.1.20", "port": 27_016 },
        "steam": true,
    });
    let event = net::listening_event(9, Some(&reply), true, Some("109775240"));
    assert_eq!(event["ok"], json!(true));
    assert_eq!(event["bound"]["port"], json!(27_016));
    assert_eq!(event["lobbyId"], json!("109775240"));

    // Nothing bound and no Steam door is a failure even though the session
    // answered — a session nobody can reach is not listening.
    let nowhere = json!({ "kind": "listening", "bound": Value::Null });
    assert_eq!(
        net::listening_event(9, Some(&nowhere), false, None)["ok"],
        json!(false)
    );
    // …but a Steam-only host is fine, and is the common case for a friend game.
    assert_eq!(
        net::listening_event(9, Some(&nowhere), true, Some("1"))["ok"],
        json!(true)
    );
    // And a session that never answered says so rather than reporting nothing.
    assert_eq!(
        net::listening_event(9, None, false, None)["reason"],
        json!("no-reply")
    );
}

#[test]
fn an_address_is_written_the_way_join_by_address_reads_it() {
    assert_eq!(net::format_address("10.0.0.4", 27_015), "10.0.0.4:27015");
    // IPv6 needs the brackets, or the colons in the address run into the port's.
    assert_eq!(net::format_address("fe80::1", 27_015), "[fe80::1]:27015");
}

#[test]
fn a_status_poll_forwards_the_sessions_own_numbers() {
    // The shell holds neither the tick nor the roster; inventing either would
    // be a second copy of a number the screen is watching.
    let reply = json!({
        "kind": "status",
        "tick": 1234,
        "phase": "playing",
        "enemies": 41,
        "clients": 3,
        "bound": { "address": "0.0.0.0", "port": 27_015 },
        "mapping": { "status": "mapped", "method": "upnp", "externalPort": 27_015 },
        "roster": [{ "slot": 0, "name": "ADA", "playing": true, "ping": -1, "rate": 900 }],
    });
    let event = net::status_event(2, Some(&reply));
    assert_eq!(event["ok"], json!(true));
    assert_eq!(event["running"], json!(true));
    assert_eq!(event["tick"], json!(1234));
    assert_eq!(event["roster"][0]["name"], json!("ADA"));
    assert_eq!(event["mapping"]["method"], json!("upnp"));

    // A shell with no session at all answers OK and idle — the HOST screen is
    // drawn from this before anything has been started.
    let idle = net::idle_status_event(2);
    assert_eq!(idle["ok"], json!(true));
    assert_eq!(idle["running"], json!(false));
    assert_eq!(idle["phase"], json!("idle"));

    // A session that did not answer is NOT idle; it is a session that is not
    // answering, and the screen must be able to tell those apart.
    let wedged = net::status_event(2, None);
    assert_eq!(wedged["ok"], json!(false));
    assert_eq!(wedged["running"], json!(true));
}

#[test]
fn a_join_carries_the_players_own_facts_and_defaults_the_rest() {
    let asked = request(json!({
        "action": "connect",
        "address": "10.0.0.4:27015",
        "hardcore": true,
        "loadout": { "level": 12 },
        "mods": ["greenhouse"],
    }));
    let control = net::connect_control(&asked);
    assert_eq!(control["kind"], json!("connect"));
    assert_eq!(control["name"], json!("PLAYER"), "a name nobody sent");
    assert_eq!(control["hardcore"], json!(true));
    assert_eq!(control["loadout"]["level"], json!(12));
    assert_eq!(control["mods"], json!(["greenhouse"]));
    assert!(control.get("peer").is_none());

    // A fresh-start joiner sends an explicit null loadout rather than nothing,
    // because the session distinguishes "brought nothing" from "said nothing".
    let fresh = net::connect_control(&request(json!({ "action": "connect", "peer": "76561" })));
    assert_eq!(fresh["loadout"], Value::Null);
    assert_eq!(fresh["peer"], json!("76561"));
    assert_eq!(fresh["hardcore"], json!(false));
}

#[test]
fn a_refused_join_reaches_the_player_as_the_hosts_own_reason() {
    let refused = net::connected_event(4, false, Some("mods"), Some("MISSING GREENHOUSE"));
    assert_eq!(refused["reason"], json!("mods"));
    assert_eq!(refused["detail"], json!("MISSING GREENHOUSE"));

    // A join nothing answered is `no-session` rather than a blank — a JOIN
    // screen with an empty reason is one the player cannot act on.
    assert_eq!(
        net::connected_event(4, false, None, None)["reason"],
        json!("no-session")
    );

    // A successful one carries no reason at all.
    let ok = net::connected_event(4, true, None, None);
    assert_eq!(ok["ok"], json!(true));
    assert!(ok.get("reason").is_none());
}

#[test]
fn a_relayed_packet_travels_as_the_bytes_the_relay_expects() {
    let control = net::peer_control("76561198000000000", &[1, 2, 255]);
    assert_eq!(control["kind"], json!("peer"));
    assert_eq!(control["from"], json!("76561198000000000"));
    assert_eq!(control["data"], json!([1, 2, 255]));

    let lost = net::peer_lost_control("76561198000000000", "timed out");
    assert_eq!(lost["kind"], json!("peer-lost"));
    assert_eq!(lost["reason"], json!("timed out"));
}

#[test]
fn the_invite_is_the_one_event_with_no_request_behind_it() {
    // It was made on a command line before the page existed, so it has no id to
    // match and the page dispatches it by name.
    let invite = net::invite_event(Some("109775240"), None);
    assert_eq!(invite["event"], json!("invite"));
    assert_eq!(invite["lobbyId"], json!("109775240"));
    assert!(invite.get("requestId").is_none());
}

#[test]
fn a_lobby_row_reads_its_level_off_the_params_the_page_sent() {
    let params = json!({ "levelId": "moon-basin", "difficulty": "hard" });
    assert_eq!(net::read_string(Some(&params), "levelId"), "moon-basin");
    // A field the params do not carry is empty rather than a panic: the shell
    // does not import the wire's shape and must not assume its fields.
    assert_eq!(net::read_string(Some(&params), "nothing"), "");
    assert_eq!(net::read_string(None, "levelId"), "");
}

#[test]
fn a_port_the_page_sent_is_a_port_or_it_is_nothing() {
    assert_eq!(request(json!({ "port": 27_015 })).port(), Some(27_015));
    // Zero means "any free port", which is a server nobody can be told to
    // connect to; past 65535 is not a port at all.
    assert_eq!(request(json!({ "port": 0 })).port(), None);
    assert_eq!(request(json!({ "port": 99_999 })).port(), None);
    assert_eq!(request(json!({})).port(), None);
}
