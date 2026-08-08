// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! `--dedicated`, as a process — the effects half of
//! [`adastrail_shell::dedicated`].
//!
//! It runs BEFORE Tauri's builder, which is the one piece of ordering this mode
//! insists on: a dedicated server must not register a scheme, open a window or
//! adopt a user-data directory, and the cheapest way to guarantee all three is
//! never to reach the code that does them.
//!
//! **THE SERVER IS SPAWNED RATHER THAN IMPORTED**, which is the one difference
//! from the Electron peer and is the closer match to what an operator expects:
//! Electron's main process IS Node, so it rewrites its own `process.argv` and
//! imports the entry into itself, leaving a game shell in the process table
//! pretending to be a server. Here the thing in the process table is the server.
//!
//! And it is spawned WITHOUT `--shell` — a dedicated server is driven by a
//! config file and a signal rather than by a control channel, which is exactly
//! the branch `server/main.ts` calls "nobody forked us".

use std::process::Command;

use adastrail_shell::capabilities::Capabilities;
use adastrail_shell::dedicated::{refuse_dedicated, server_args};
use adastrail_shell::output;
use adastrail_shell::runtime::Resources;

/// Run the session server in this terminal and answer its exit code.
pub fn run(after: &[String], capabilities: &Capabilities, resources: &Resources) -> i32 {
    if let Some(refusal) = refuse_dedicated(capabilities) {
        output::error(refusal);
        return 1;
    }
    if let Some(missing) = resources.missing_for_sessions() {
        output::error(&missing);
        return 1;
    }
    let entry = resources.server_entry();
    let args = server_args(after, capabilities);
    output::info(&format!(
        "dedicated server: {} {} {}",
        resources.node().display(),
        entry.display(),
        args.join(" ")
    ));
    // Inherited stdio, deliberately: the operator IS the console, and a server
    // whose log went into a pipe nobody reads would be a server nobody can
    // watch.
    match Command::new(resources.node())
        .arg(&entry)
        .args(&args)
        .status()
    {
        Ok(status) => status.code().unwrap_or(0),
        Err(err) => {
            output::error(&format!("dedicated server failed — {err}"));
            1
        }
    }
}
