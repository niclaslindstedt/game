// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! THE ONE BINARY'S SECOND MODE — what a windowless server is handed, and what
//! it is refused.

use adastrail_shell::capabilities::{BuildCapabilities, Capabilities, ALL_CAPABILITIES};
use adastrail_shell::dedicated::{dedicated_args, refuse_dedicated, server_args};

fn argv(args: &[&str]) -> Vec<String> {
    args.iter().map(|arg| (*arg).to_string()).collect()
}

fn store(port: Option<u16>) -> Capabilities {
    Capabilities {
        built: ALL_CAPABILITIES,
        autopilot: false,
        unlocked: false,
        direct: port.is_some(),
        port,
    }
}

#[test]
fn an_ordinary_launch_is_not_a_server() {
    assert_eq!(dedicated_args(&argv(&["--multiplayer"])), None);
    assert_eq!(
        dedicated_args(&argv(&["--dedicated"])),
        Some(Vec::new()),
        "…and a bare --dedicated is a server with no arguments, not an absent one"
    );
}

#[test]
fn the_shells_own_options_never_reach_the_servers_parser() {
    // A bug before it is a rule: the server reads an unknown `--flag` as one
    // that takes a VALUE, so leaving one in would swallow the token after it
    // and turn `--port 27849` into a config-file path.
    let after = argv(&[
        "--multiplayer",
        "--mods",
        "--voice",
        "--config",
        "server.json",
    ]);
    let args = server_args(&after, &store(Some(27_849)));
    assert!(!args.contains(&"--multiplayer".to_string()));
    assert!(!args.contains(&"--mods".to_string()));
    assert!(!args.contains(&"--voice".to_string()));
    assert_eq!(args[0], "--config");
    assert_eq!(args[1], "server.json");
}

#[test]
fn the_port_is_appended_because_it_may_have_been_given_before_the_mode_switch() {
    // The server can only see what it is handed, and last-one-wins is what the
    // append relies on.
    let args = server_args(&argv(&[]), &store(Some(27_849)));
    let at = args.iter().position(|arg| arg == "--port").expect("a port");
    assert_eq!(args[at + 1], "27849");
}

#[test]
fn the_licence_and_the_router_permission_are_the_shells_answers() {
    // Added in a way the operator cannot take back out or slip past — they are
    // resolved from the package stamp and the launch, not from the command line.
    let licensed = server_args(&argv(&["--licensed"]), &store(Some(1)));
    assert_eq!(
        licensed.iter().filter(|arg| *arg == "--licensed").count(),
        1,
        "stripped, then re-added once by the shell"
    );
    assert!(!licensed.contains(&"--no-portmap".to_string()));

    let download = Capabilities {
        built: BuildCapabilities {
            multiplayer: true,
            ..BuildCapabilities::default()
        },
        autopilot: false,
        unlocked: true,
        direct: true,
        port: Some(1),
    };
    let plain = server_args(&argv(&["--licensed", "--no-portmap=0"]), &download);
    assert!(
        !plain.contains(&"--licensed".to_string()),
        "saying so does not make it so"
    );
    assert!(plain.contains(&"--no-portmap".to_string()));
}

#[test]
fn a_server_is_the_multiplayer_feature_and_answers_to_the_same_permission() {
    // This mode is not a way around a build that was not packaged with it.
    let no_sessions = Capabilities::default();
    assert!(refuse_dedicated(&no_sessions).is_some());

    // And unlike the HOST screen it has nowhere to read a port from, so here
    // the port is required rather than a refinement: a server on whichever port
    // happened to be free is a server nobody can be told to connect to.
    assert!(refuse_dedicated(&store(None)).is_some());
    assert!(refuse_dedicated(&store(Some(27_849))).is_none());
}

#[test]
fn the_auto_pilot_switch_is_taken_out_so_it_cannot_eat_the_token_after_it() {
    // It can never reach a running server — asking for the ride is what turns
    // multiplayer off, and a launch with no multiplayer is refused above — but
    // the server's parser would still read it as a flag that takes a value.
    let args = server_args(&argv(&["--autopilot", "server.json"]), &store(Some(27849)));
    assert!(!args.contains(&"--autopilot".to_string()));
    assert_eq!(args.first().map(String::as_str), Some("server.json"));
}
