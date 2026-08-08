// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! THE OS FIREWALL — the one layer of the three that cannot be opened
//! silently. The peer of `electron/src/net-firewall.ts`, with every command and
//! every reading of its output here and only the running of them in
//! `src-tauri/src/firewall.rs`.
//!
//! The router is a packet on the LAN and needs nobody's permission
//! (`server/net/upnp.ts`). The socket binds or it does not. This one asks the
//! player, once, on a press — and the whole area exists to make that ask
//! honest.
//!
//! **THERE IS NO INSTALLER TO HANG A RULE ON.** The Steam depot target is a
//! directory and Steam's own client does the installing, so there is no
//! elevated moment to inherit and nothing to do at first run. That is why this
//! is a button on the HOST screen rather than a step in a setup wizard.
//!
//! THREE RULES GOVERN THE WHOLE AREA, and each one is a mistake somebody else
//! has already shipped:
//!
//!  1. **NEVER ELEVATE AT LAUNCH, AND NEVER WITHOUT BEING ASKED.** A game that
//!     pops UAC when it starts is a game people uninstall. The prompt happens on
//!     a press, labelled with what it will do, and only when the check says a
//!     rule is actually missing.
//!  2. **VERIFY, NEVER ASSUME.** After a rule is added the check runs again and
//!     the result is what is shown. A green "opened" that is not open is worse
//!     than a red one, because it sends the player looking in the wrong place.
//!  3. **ALWAYS LEAVE A MANUAL PATH.** The exact command, copyable, beside the
//!     button. Some machines are locked down by an administrator who is not the
//!     player, and that must read as "here is what to ask for" rather than as a
//!     dead end.
//!
//! **AND THE HONEST LIMIT, which the HOST screen has to say out loud:
//! reachability from the outside cannot be self-tested without an outside.**
//! Everything here reports on a rule being PRESENT. The only proof that the
//! internet can reach this machine is the first joiner who does.
//!
//! Splitting it this way buys something the TypeScript peer cannot have: the
//! READING of `netsh`'s output, of `socketfilterfw`'s and of `ufw`'s is where
//! the bugs are, and every one of those readings is a pure function here with a
//! test holding a real sample of that tool's output.

use serde_json::{json, Value};

/// How long any one firewall command may take. These are local queries; past
/// this the tool is waiting on something and the HOST screen must not.
pub const COMMAND_TIMEOUT_MS: u64 = 5_000;

/// The rule's name on Windows and in every message about it.
///
/// Stable, because the check looks it up by name — renaming it would leave
/// every existing player with an invisible orphan rule. The same string the
/// Electron shell uses, so a player who has both installed has one rule rather
/// than two.
pub const RULE_NAME: &str = "Ada's Trail (multiplayer)";

/// Which host firewall this machine has, which is the same question as which
/// platform except on Linux, where it is a question about what is installed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Firewall {
    /// Windows Defender Firewall — on by default, and the one platform where
    /// this matters to nearly everybody.
    Windows,
    /// The macOS application firewall, which filters by APPLICATION rather than
    /// by port and is off by default on most Macs.
    MacOs,
    /// `ufw`.
    Ufw,
    /// `firewalld`.
    Firewalld,
    /// Neither is installed, which is the honest answer on most gaming
    /// distributions and on the Steam Deck.
    None,
}

/// One command to run: the program and its arguments.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Command {
    /// The program.
    pub program: String,
    /// Its arguments.
    pub args: Vec<String>,
}

impl Command {
    fn new(program: &str, args: &[&str]) -> Self {
        Self {
            program: program.to_string(),
            args: args.iter().map(|arg| (*arg).to_string()).collect(),
        }
    }
}

/// The macOS firewall tool, which takes no port: it filters by application.
pub const SOCKETFILTERFW: &str = "/usr/libexec/ApplicationFirewall/socketfilterfw";

/// What the FIREWALL row shows.
///
/// `Unknown` is its own state rather than folded into `Blocked`, because
/// telling a player to fix something that may not be broken is how a status row
/// loses their trust.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FirewallState {
    /// Nothing to do: no host firewall, or one that is off.
    NotNeeded {
        /// Which of the two, in the row's own words.
        detail: String,
    },
    /// A rule for this port exists.
    Allowed,
    /// No rule, and we know how to add one.
    Blocked {
        /// The exact command, copyable.
        manual: String,
    },
    /// We could not tell — an unknown firewall, a command that failed.
    Unknown {
        /// What went wrong, in the row's own words.
        detail: String,
        /// The command anyway, when there is one worth offering.
        manual: Option<String>,
    },
}

impl FirewallState {
    /// The state as the page's `FirewallStatus` — the same JSON both shells
    /// send, because the row that draws it is the same row.
    pub fn to_json(&self) -> Value {
        match self {
            FirewallState::NotNeeded { detail } => {
                json!({ "status": "not-needed", "detail": detail })
            }
            FirewallState::Allowed => json!({ "status": "allowed" }),
            FirewallState::Blocked { manual } => json!({ "status": "blocked", "manual": manual }),
            FirewallState::Unknown { detail, manual } => match manual {
                Some(manual) => {
                    json!({ "status": "unknown", "detail": detail, "manual": manual })
                }
                None => json!({ "status": "unknown", "detail": detail }),
            },
        }
    }
}

/// The firewall this build's platform has, before anything is probed.
///
/// Linux answers `None` here and is resolved by [`linux_firewall`] instead,
/// because on Linux the question is what is INSTALLED rather than what the
/// platform is.
pub fn platform_firewall() -> Firewall {
    if cfg!(windows) {
        Firewall::Windows
    } else if cfg!(target_os = "macos") {
        Firewall::MacOs
    } else {
        Firewall::None
    }
}

/// Which Linux firewall is here, from whether each tool ran at all.
///
/// A tool that RAN and exited non-zero still told us it exists — `ufw status`
/// without root is a refusal, not an absence — so only a spawn failure counts
/// as "not installed", which is what a `None` here means.
pub fn linux_firewall(ufw: Option<&str>, firewalld: Option<&str>) -> Firewall {
    if ufw.is_some() {
        return Firewall::Ufw;
    }
    if firewalld.is_some() {
        return Firewall::Firewalld;
    }
    Firewall::None
}

// ---------------------------------------------------------------------------
// The commands
// ---------------------------------------------------------------------------

/// Ask Windows whether our rule is there.
pub fn windows_check(port: u16) -> Command {
    let _ = port;
    Command::new(
        "netsh",
        &[
            "advfirewall",
            "firewall",
            "show",
            "rule",
            &format!("name={RULE_NAME}"),
        ],
    )
}

/// The copyable Windows command.
pub fn windows_manual(port: u16) -> String {
    format!(
        "netsh advfirewall firewall add rule name=\"{RULE_NAME}\" \
         dir=in action=allow protocol=UDP localport={port}"
    )
}

/// ONE UAC prompt, on the press.
///
/// `Start-Process -Verb RunAs` is what raises it; `-Wait` is what makes the
/// verification afterwards mean anything, because without it the check races
/// the rule being written.
pub fn windows_elevate(port: u16) -> Command {
    let args = [
        "advfirewall".to_string(),
        "firewall".to_string(),
        "add".to_string(),
        "rule".to_string(),
        format!("name={RULE_NAME}"),
        "dir=in".to_string(),
        "action=allow".to_string(),
        "protocol=UDP".to_string(),
        format!("localport={port}"),
    ]
    .iter()
    .map(|arg| format!("'{}'", arg.replace('\'', "''")))
    .collect::<Vec<_>>()
    .join(",");
    Command::new(
        "powershell",
        &[
            "-NoProfile",
            "-Command",
            &format!("Start-Process netsh -Verb RunAs -Wait -ArgumentList {args}"),
        ],
    )
}

/// What `netsh` said, read.
///
/// It exits 1 with "No rules match" rather than printing an empty list, so the
/// absence is read off the text — and the LOCALIZED message differs per
/// install, which is why the PORT is what is looked for rather than any English
/// word. A command that would not run at all is `Blocked` rather than
/// `Unknown`: Windows Defender is on by default, so "I could not ask" and "the
/// rule is not there" have the same remedy.
pub fn read_windows(port: u16, output: Option<&str>) -> FirewallState {
    match output {
        Some(text) if text.contains(&port.to_string()) => FirewallState::Allowed,
        _ => FirewallState::Blocked {
            manual: windows_manual(port),
        },
    }
}

/// Is the macOS firewall even on?
pub fn mac_global_check() -> Command {
    Command::new(SOCKETFILTERFW, &["--getglobalstate"])
}

/// …and does it know our app?
pub fn mac_apps_check() -> Command {
    Command::new(SOCKETFILTERFW, &["--listapps"])
}

/// The copyable macOS command, for this executable.
pub fn mac_manual(executable: &str) -> String {
    format!("sudo {SOCKETFILTERFW} --add \"{executable}\" --unblockapp \"{executable}\"")
}

/// The one prompt, through the desktop's own elevation.
pub fn mac_elevate(executable: &str) -> Command {
    let script = format!(
        "do shell script \"{SOCKETFILTERFW} --add \\\"{executable}\\\" && \
         {SOCKETFILTERFW} --unblockapp \\\"{executable}\\\"\" with administrator privileges"
    );
    Command::new("osascript", &["-e", &script])
}

/// What the two macOS probes said, read.
///
/// The common answer is `NotNeeded` and the row should say so rather than
/// offering a remedy nobody requires.
pub fn read_mac(executable: &str, global: Option<&str>, apps: Option<&str>) -> FirewallState {
    let Some(global) = global else {
        return FirewallState::Unknown {
            detail: "COULD NOT READ THE MACOS FIREWALL".to_string(),
            manual: Some(mac_manual(executable)),
        };
    };
    if global.to_lowercase().contains("disabled") {
        return FirewallState::NotNeeded {
            detail: "THE MACOS FIREWALL IS OFF".to_string(),
        };
    }
    match apps {
        Some(apps) if apps.contains(executable) => FirewallState::Allowed,
        Some(_) => FirewallState::Blocked {
            manual: mac_manual(executable),
        },
        None => FirewallState::Unknown {
            detail: "COULD NOT READ THE MACOS FIREWALL".to_string(),
            manual: Some(mac_manual(executable)),
        },
    }
}

/// Is `ufw` here, and what does it say?
pub fn ufw_check() -> Command {
    Command::new("ufw", &["status"])
}

/// Is `firewalld` here, and is it running?
pub fn firewalld_check() -> Command {
    Command::new("firewall-cmd", &["--state"])
}

/// …and which ports has it got open?
pub fn firewalld_ports() -> Command {
    Command::new("firewall-cmd", &["--list-ports"])
}

/// The elevation, through `pkexec` — the desktop's own prompt, and the only one
/// that works without a terminal. `sudo` from a windowed app either fails or
/// silently waits for a password nobody can type.
pub fn linux_elevate(firewall: Firewall, port: u16) -> Vec<Command> {
    match firewall {
        Firewall::Ufw => vec![Command::new(
            "pkexec",
            &["ufw", "allow", &format!("{port}/udp")],
        )],
        Firewall::Firewalld => vec![
            Command::new(
                "pkexec",
                &[
                    "firewall-cmd",
                    &format!("--add-port={port}/udp"),
                    "--permanent",
                ],
            ),
            Command::new("pkexec", &["firewall-cmd", "--reload"]),
        ],
        _ => Vec::new(),
    }
}

/// What `ufw status` said, read.
pub fn read_ufw(port: u16, status: &str) -> FirewallState {
    if status.to_lowercase().contains("inactive") {
        return FirewallState::NotNeeded {
            detail: "UFW IS INACTIVE".to_string(),
        };
    }
    if status.contains(&format!("{port}/udp")) {
        return FirewallState::Allowed;
    }
    FirewallState::Blocked {
        manual: format!("sudo ufw allow {port}/udp"),
    }
}

/// What `firewall-cmd` said, read.
pub fn read_firewalld(port: u16, state: &str, ports: Option<&str>) -> FirewallState {
    // `firewall-cmd --state` prints exactly `running` or `not running`, and the
    // second CONTAINS the first — so a substring test alone reports a stopped
    // firewalld as running and then offers a remedy for a problem the machine
    // does not have. (The Electron peer had that bug; it is fixed there too.)
    let state = state.to_lowercase();
    if !state.contains("running") || state.contains("not running") {
        return FirewallState::NotNeeded {
            detail: "FIREWALLD IS NOT RUNNING".to_string(),
        };
    }
    if ports.is_some_and(|ports| ports.contains(&format!("{port}/udp"))) {
        return FirewallState::Allowed;
    }
    FirewallState::Blocked {
        manual: format!(
            "sudo firewall-cmd --add-port={port}/udp --permanent && sudo firewall-cmd --reload"
        ),
    }
}

/// Neither tool is installed.
pub fn no_linux_firewall() -> FirewallState {
    FirewallState::NotNeeded {
        detail: "NO HOST FIREWALL FOUND".to_string(),
    }
}
