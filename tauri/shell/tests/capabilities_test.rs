// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! What a build may do, and what a command line may add to it — the peer of
//! `electron/tests/capabilities_test.ts`.
//!
//! The rule under every case here is the same one: a build carries only what
//! something DELIBERATELY gave it. The narrow answer is what happens by
//! default, and the wide one has to be asked for — so that a tree somebody
//! cloned behaves like the thing they would have downloaded.

use adastrail_shell::capabilities::{
    capability_list, is_stamped, read_build_capabilities, resolve_capabilities, BuildCapabilities,
    BuildStamp, ALL_CAPABILITIES, NO_CAPABILITIES,
};

fn argv(args: &[&str]) -> Vec<String> {
    args.iter().map(|arg| (*arg).to_string()).collect()
}

const DEPOT: BuildStamp<'static> = BuildStamp {
    stamped: Some("1"),
    multiplayer: Some("1"),
    mods: Some("1"),
    port_map: Some("1"),
    voice: Some("1"),
    licensed: Some("1"),
};

#[test]
fn an_unstamped_build_carries_nothing() {
    let stamp = BuildStamp::default();
    assert_eq!(read_build_capabilities(&stamp), NO_CAPABILITIES);
    assert!(!is_stamped(&stamp), "a checkout is a developer build");
}

#[test]
fn a_stamp_that_says_nothing_still_carries_nothing() {
    // The stamp is present (this was packaged) but every switch was off — a
    // plain download.
    let stamp = BuildStamp {
        stamped: Some("1"),
        ..BuildStamp::default()
    };
    assert!(is_stamped(&stamp), "packaged, just not with anything on");
    assert_eq!(read_build_capabilities(&stamp), NO_CAPABILITIES);
}

#[test]
fn the_depot_stamp_carries_everything() {
    assert_eq!(read_build_capabilities(&DEPOT), ALL_CAPABILITIES);
    assert!(is_stamped(&DEPOT));
}

#[test]
fn a_switch_set_on_an_unstamped_build_is_still_nothing() {
    // Somebody's shell has GIS_ENABLE_MULTIPLAYER lying around from a packaging
    // run; a `cargo build` after that must not quietly produce a wide binary.
    let stamp = BuildStamp {
        multiplayer: Some("1"),
        ..BuildStamp::default()
    };
    assert_eq!(read_build_capabilities(&stamp), NO_CAPABILITIES);
}

#[test]
fn only_an_explicit_yes_turns_a_switch_on() {
    let stamp = BuildStamp {
        stamped: Some("1"),
        multiplayer: Some("0"),
        mods: Some(""),
        voice: Some("yes"),
        ..BuildStamp::default()
    };
    assert_eq!(read_build_capabilities(&stamp), NO_CAPABILITIES);
}

#[test]
fn the_command_line_can_widen_a_download_and_says_so() {
    let (caps, refusals) = resolve_capabilities(NO_CAPABILITIES, &argv(&["--multiplayer"]));
    assert!(caps.multiplayer());
    assert!(caps.unlocked, "the launch has to announce this");
    assert!(refusals.is_empty());
}

#[test]
fn a_depot_build_is_not_unlocked_by_asking_for_what_it_has() {
    let (caps, refusals) = resolve_capabilities(ALL_CAPABILITIES, &argv(&["--multiplayer"]));
    assert!(caps.multiplayer());
    assert!(!caps.unlocked, "it already had it — nothing to announce");
    assert!(refusals.is_empty());
}

#[test]
fn voice_without_a_session_is_refused_by_name() {
    // Not ignored: "--voice does nothing" would leave somebody adding it a
    // second time and louder. And it must not grant the microphone.
    let (caps, refusals) = resolve_capabilities(NO_CAPABILITIES, &argv(&["--voice"]));
    assert!(!caps.voice());
    assert_eq!(refusals, vec!["--voice does nothing without --multiplayer"]);
}

#[test]
fn voice_with_a_session_is_granted() {
    let (caps, refusals) =
        resolve_capabilities(NO_CAPABILITIES, &argv(&["--multiplayer", "--voice"]));
    assert!(caps.voice());
    assert!(caps.unlocked);
    assert!(refusals.is_empty());
}

#[test]
fn the_router_permission_cannot_be_asked_for() {
    // A port mapping is a change this program makes to somebody's ROUTER, so it
    // belongs to the build and to nothing else.
    let (caps, _) = resolve_capabilities(
        NO_CAPABILITIES,
        &argv(&["--multiplayer", "--portmap", "--upnp"]),
    );
    assert!(!caps.port_map());

    let built = BuildCapabilities {
        port_map: true,
        ..NO_CAPABILITIES
    };
    let (caps, _) = resolve_capabilities(built, &argv(&[]));
    assert!(caps.port_map());
}

#[test]
fn a_port_pins_the_direct_door_both_ways_round() {
    for args in [
        argv(&["--multiplayer", "--port", "27849"]),
        argv(&["--multiplayer", "--port=27849"]),
    ] {
        let (caps, refusals) = resolve_capabilities(NO_CAPABILITIES, &args);
        assert!(caps.direct);
        assert_eq!(caps.port, Some(27849));
        assert!(refusals.is_empty());
    }
}

#[test]
fn a_port_without_a_session_is_refused() {
    let (caps, refusals) = resolve_capabilities(NO_CAPABILITIES, &argv(&["--port", "27849"]));
    assert!(!caps.direct);
    assert_eq!(caps.port, None);
    assert_eq!(refusals, vec!["--port does nothing without --multiplayer"]);
}

#[test]
fn a_port_that_is_not_a_port_is_refused_by_value() {
    for bad in ["0", "70000", "-1", "twenty", ""] {
        let (caps, refusals) = resolve_capabilities(ALL_CAPABILITIES, &argv(&["--port", bad]));
        assert!(!caps.direct, "{bad} must not open a door");
        assert_eq!(refusals.len(), 1, "{bad} must be refused by name");
        assert!(refusals[0].contains(bad) || bad.is_empty());
    }
}

#[test]
fn the_licence_is_a_declaration_rather_than_an_unlock() {
    // Nothing here can check it and nothing pretends to — but claiming it is
    // not "unlocking" anything either, so it does not trip the announcement.
    let (caps, _) = resolve_capabilities(NO_CAPABILITIES, &argv(&["--licensed"]));
    assert!(caps.licensed());
    assert!(!caps.unlocked);
}

#[test]
fn the_page_is_told_only_plain_names() {
    let (caps, _) = resolve_capabilities(ALL_CAPABILITIES, &argv(&[]));
    assert_eq!(capability_list(&caps), vec!["multiplayer", "mods", "voice"]);

    let (caps, _) = resolve_capabilities(NO_CAPABILITIES, &argv(&[]));
    assert!(
        capability_list(&caps).is_empty(),
        "a download offers the page nothing to draw a door for"
    );
}

// THE AUTO PILOT — the one capability no desktop build carries, depot build
// included. It is not in `ALL_CAPABILITIES` because there is nothing for a
// packager to stamp: `--autopilot` is the only way it is ever on, and it costs
// the launch its multiplayer to ask.

#[test]
fn no_build_stamp_can_hand_out_the_auto_pilot() {
    let (caps, _) = resolve_capabilities(ALL_CAPABILITIES, &argv(&[]));
    assert!(!caps.autopilot());
    assert!(!capability_list(&caps).contains(&"autopilot"));
}

#[test]
fn the_command_line_hands_the_page_the_auto_pilot() {
    let (caps, _) = resolve_capabilities(NO_CAPABILITIES, &argv(&["--autopilot"]));
    assert!(caps.autopilot());
    assert!(capability_list(&caps).contains(&"autopilot"));
}

#[test]
fn the_auto_pilot_costs_the_launch_its_multiplayer() {
    // The stamp is not a defence: a copy that plays itself has no business in
    // somebody else's session whatever built it.
    let (caps, refusals) = resolve_capabilities(ALL_CAPABILITIES, &argv(&["--autopilot"]));
    assert!(caps.autopilot());
    assert!(!caps.multiplayer());
    assert!(!caps.voice());
    assert!(!caps.licensed());
    assert_eq!(capability_list(&caps), vec!["mods", "autopilot"]);
    assert_eq!(
        refusals,
        vec!["--autopilot is a developer switch: multiplayer is off for this launch"]
    );
}

#[test]
fn the_auto_pilot_beats_the_command_line_too_in_either_order() {
    for args in [
        ["--multiplayer", "--voice", "--licensed", "--autopilot"],
        ["--autopilot", "--multiplayer", "--voice", "--licensed"],
    ] {
        let (caps, _) = resolve_capabilities(NO_CAPABILITIES, &argv(&args));
        assert!(caps.autopilot(), "{args:?}");
        assert!(!caps.multiplayer(), "{args:?}");
        assert!(!caps.voice(), "{args:?}");
        assert!(!caps.licensed(), "{args:?}");
    }
}

#[test]
fn the_consequence_is_stated_once_and_blames_no_flag_for_it() {
    // The pairing refusals would otherwise fire on every autopilot launch,
    // naming flags the developer did not type — which reads as a bug in the
    // parser rather than as the one deliberate trade.
    let (_, refusals) =
        resolve_capabilities(ALL_CAPABILITIES, &argv(&["--autopilot", "--port", "27849"]));
    assert_eq!(
        refusals,
        vec!["--autopilot is a developer switch: multiplayer is off for this launch"]
    );
}

#[test]
fn the_auto_pilot_is_not_a_licence_unlock_of_its_own() {
    // `unlocked` is the LICENCE acknowledgement — about running licensed
    // features outside the terms they came under. The ride has its own fact and
    // its own paragraph in the same notice.
    let (caps, _) = resolve_capabilities(NO_CAPABILITIES, &argv(&["--autopilot"]));
    assert!(!caps.unlocked);
}
