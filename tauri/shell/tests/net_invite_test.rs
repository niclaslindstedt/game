// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! `+connect_lobby` AND `--connect` — the two ways a session reaches a game
//! that was not running.

use adastrail_shell::net_invite::{read_invite, Invite};

fn argv(args: &[&str]) -> Vec<String> {
    args.iter().map(|arg| (*arg).to_string()).collect()
}

#[test]
fn steams_own_invite_is_read_off_the_command_line() {
    // A friend accepted while the game was closed; Steam launches the binary
    // with this and nothing else says a join was asked for.
    assert_eq!(
        read_invite(&argv(&["+connect_lobby", "109775240983270000"])),
        Some(Invite::Lobby("109775240983270000".to_string()))
    );
}

#[test]
fn a_shared_address_is_read_in_either_spelling() {
    for flag in ["--connect", "+connect"] {
        assert_eq!(
            read_invite(&argv(&[flag, "10.0.0.4:27015"])),
            Some(Invite::Address("10.0.0.4:27015".to_string())),
            "{flag}"
        );
    }
}

#[test]
fn a_truncated_command_line_produces_no_join_at_all() {
    // A flag with nothing after it must not become a join attempt against "" —
    // which is a probe the player never asked for and a refusal they cannot
    // read.
    assert_eq!(read_invite(&argv(&["+connect_lobby"])), None);
    assert_eq!(read_invite(&argv(&["--connect", "--fullscreen"])), None);
    assert_eq!(
        read_invite(&argv(&["+connect_lobby", "+connect_lobby"])),
        None
    );
}

#[test]
fn an_ordinary_launch_asks_for_nothing() {
    assert_eq!(read_invite(&argv(&[])), None);
    assert_eq!(read_invite(&argv(&["--multiplayer", "--mods"])), None);
}

#[test]
fn the_invite_is_found_wherever_the_platform_put_it() {
    // Steam appends its own arguments after the game's, and a launcher may put
    // them anywhere; the flag is searched for rather than expected first.
    assert_eq!(
        read_invite(&argv(&[
            "--multiplayer",
            "+connect_lobby",
            "42",
            "--verbose"
        ])),
        Some(Invite::Lobby("42".to_string()))
    );
}
