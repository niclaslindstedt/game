// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! THE ONE BINARY'S SECOND MODE — the peer of `electron/src/dedicated-mode.ts`.
//!
//! `--dedicated` turns this executable into the session server with no window
//! at all. It is the same server the game forks, run from a terminal by a
//! person, and the argument for it is `server/dedicated.ts`'s: there is no
//! second binary to forget to update.
//!
//! **THE ONE DIFFERENCE FROM ELECTRON IS WHICH PROCESS RUNS IT.** Electron's
//! main process IS Node, so it rewrites its own `process.argv` and `import()`s
//! the server entry into itself. This shell is Rust: it spawns the same entry
//! on the bundled runtime and waits, forwarding the exit code — which is
//! actually the closer match to what an operator expects, since the thing in
//! their process table is then the server rather than a game shell pretending.
//!
//! **AND IT DOES NOT GET THE SIDECAR'S PIPES.** A dedicated server is driven by
//! a config file and a signal, not by a control channel, so it is spawned
//! WITHOUT `--shell` — which is exactly the branch `server/main.ts` calls
//! "nobody forked us".

use crate::capabilities::Capabilities;

/// Arguments following `--dedicated`, with that mode switch removed, or `None`
/// when this is an ordinary launch.
pub fn dedicated_args(argv: &[String]) -> Option<Vec<String>> {
    let at = argv.iter().position(|arg| arg == "--dedicated")?;
    Some(argv[at + 1..].to_vec())
}

/// The shell's own options, which mean nothing to the server.
///
/// Stripped rather than passed on, and the reason is a bug before it is a rule:
/// the server's parser reads an unknown `--flag` as one that takes a VALUE, so
/// leaving one in would swallow the token after it and turn `--port 27849` into
/// a config-file path.
///
/// `--autopilot` is in the list for the parser's sake rather than the server's:
/// it can never reach a running server (it is what turns multiplayer off, so the
/// dedicated launch is refused before this is called), but an unknown flag left
/// in would still swallow the token after it.
const SHELL_OWN: &[&str] = &[
    "--multiplayer",
    "--mods",
    "--voice",
    "--licensed",
    "--no-portmap",
    "--autopilot",
];

/// What the session server is actually handed.
///
/// Three things happen on the way, and each of them is a bug before it is a
/// rule:
///
///  1. **The shell's own options are stripped** — see [`SHELL_OWN`].
///  2. **The port is passed on explicitly.** It may have been given BEFORE
///     `--dedicated` rather than after, and the server can only see what it is
///     handed. Appended last, where the parser's last-one-wins puts it.
///  3. **The licence and the router permission are the SHELL's answers**, added
///     here in a way the operator cannot take back out or slip past — they are
///     resolved from the package stamp and the launch, above.
pub fn server_args(after: &[String], capabilities: &Capabilities) -> Vec<String> {
    let mut args: Vec<String> = after
        .iter()
        .filter(|arg| {
            !SHELL_OWN
                .iter()
                .any(|own| *arg == own || arg.starts_with(&format!("{own}=")))
        })
        .cloned()
        .collect();
    if let Some(port) = capabilities.port {
        args.push("--port".to_string());
        args.push(port.to_string());
    }
    // The LICENCE travels as the shell resolved it, so a store build's server
    // is licensed without the operator typing anything and a download's is not
    // unless they said so. Stripped above and re-added here for the same reason
    // the router flag is: what reaches the server is the shell's answer, not
    // the command line's.
    if capabilities.licensed() {
        args.push("--licensed".to_string());
    }
    if !capabilities.port_map() {
        args.push("--no-portmap".to_string());
    }
    args
}

/// Whether this launch may actually run a dedicated server, and why not.
///
/// **A SERVER IS THE MULTIPLAYER FEATURE**, so it answers to the same
/// permission the HOST screen does — this mode is not a way around a build that
/// was not packaged with it. And unlike the HOST screen it has nowhere to read
/// a port from, so here the port is REQUIRED rather than a refinement: a server
/// on whichever port happened to be free is a server nobody can be told to
/// connect to.
pub fn refuse_dedicated(capabilities: &Capabilities) -> Option<&'static str> {
    if !capabilities.multiplayer() || capabilities.port.is_none() {
        return Some("--dedicated needs --multiplayer and --port <n> on this build.");
    }
    None
}
