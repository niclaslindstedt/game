// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! RUNNING THE FIREWALL COMMANDS — the effects half of
//! [`adastrail_shell::net_firewall`], which owns every command and every
//! reading of one.
//!
//! Nothing in this file decides anything. It spawns, it waits, and it hands the
//! text back — which is what lets the readings (the part where the bugs are) be
//! tested against real samples of each tool's output on a machine with none of
//! them installed.
//!
//! **NEVER ELEVATE WITHOUT BEING ASKED**, which is a property of the call sites
//! rather than of this file: [`allow`] is only ever reached from the page's
//! `allow-firewall` action, which is a press on a labelled button.

use std::process::{Command as OsCommand, Stdio};
use std::time::Duration;

use adastrail_shell::net_firewall::{
    firewalld_check, firewalld_ports, linux_elevate, linux_firewall, mac_apps_check, mac_elevate,
    mac_global_check, no_linux_firewall, read_firewalld, read_mac, read_ufw, read_windows,
    ufw_check, windows_check, windows_elevate, Command, Firewall, FirewallState,
    COMMAND_TIMEOUT_MS,
};
use adastrail_shell::output;

/// Is UDP `port` allowed in?
///
/// Never throws and never spawns anything elevated. A platform with nothing to
/// check answers `not-needed`, which is the correct answer for most Linux
/// gaming machines and the Steam Deck.
pub fn check(port: u16) -> FirewallState {
    match adastrail_shell::net_firewall::platform_firewall() {
        Firewall::Windows => read_windows(port, run(&windows_check(port)).as_deref()),
        Firewall::MacOs => read_mac(
            &executable(),
            run(&mac_global_check()).as_deref(),
            run(&mac_apps_check()).as_deref(),
        ),
        _ => check_linux(port),
    }
}

/// Add the rule, then CHECK IT AGAIN and report what the check said.
///
/// The return value is deliberately the verification's answer and not "did the
/// command exit zero": `netsh` reports success for a rule the group policy then
/// declines to honour, and a player told "opened" in that case has been sent to
/// debug their router for the rest of the evening.
pub fn allow(port: u16) -> FirewallState {
    match adastrail_shell::net_firewall::platform_firewall() {
        Firewall::Windows => {
            run(&windows_elevate(port));
        }
        Firewall::MacOs => {
            run(&mac_elevate(&executable()));
        }
        _ => {
            for command in linux_elevate(linux_tool(), port) {
                run(&command);
            }
        }
    }
    check(port)
}

fn check_linux(port: u16) -> FirewallState {
    match linux_tool() {
        Firewall::Ufw => read_ufw(port, &run(&ufw_check()).unwrap_or_default()),
        Firewall::Firewalld => read_firewalld(
            port,
            &run(&firewalld_check()).unwrap_or_default(),
            run(&firewalld_ports()).as_deref(),
        ),
        _ => no_linux_firewall(),
    }
}

/// Which Linux firewall is installed.
///
/// A tool that RAN and exited non-zero still told us it exists — `ufw status`
/// without root is a refusal, not an absence — which is exactly the distinction
/// [`run`] preserves by answering `Some("")` for a failed run and `None` only
/// for a spawn failure.
fn linux_tool() -> Firewall {
    linux_firewall(
        run(&ufw_check()).as_deref(),
        run(&firewalld_check()).as_deref(),
    )
}

/// This binary, which is what the macOS firewall filters by.
fn executable() -> String {
    std::env::current_exe()
        .map(|path| path.display().to_string())
        .unwrap_or_default()
}

/// Run one command and hand back everything it printed, or `None` when the
/// program is not on this machine at all.
///
/// The output of a FAILED run still counts: these tools report the answer on
/// stderr and exit non-zero routinely (`netsh` for "no rules match", `ufw` for
/// "you need root"), and treating a non-zero exit as an absence would report
/// every one of those as a missing tool.
fn run(command: &Command) -> Option<String> {
    let mut child = OsCommand::new(&command.program)
        .args(&command.args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .ok()?;

    // A crude deadline rather than a proper async wait: these are local queries
    // that answer in milliseconds, and the alternative — a runtime, or a second
    // thread per command — is a lot of machinery for a button nobody presses
    // twice. Past the deadline the tool is waiting on something and the HOST
    // screen must not.
    let deadline = std::time::Instant::now() + Duration::from_millis(COMMAND_TIMEOUT_MS);
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if std::time::Instant::now() >= deadline => {
                let _ = child.kill();
                output::warn(&format!("firewall: {} timed out", command.program));
                return Some(String::new());
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(20)),
            Err(_) => return Some(String::new()),
        }
    }
    let output = child.wait_with_output().ok()?;
    Some(format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    ))
}
