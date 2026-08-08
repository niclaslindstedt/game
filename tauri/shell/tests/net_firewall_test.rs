// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! READING WHAT A FIREWALL TOOL SAID — which is where the bugs in this feature
//! live, and the half the TypeScript peer cannot test at all because its
//! reading and its running are the same function.
//!
//! Every sample below is the shape the real tool prints. The rule the whole
//! file exists to protect is the middle one of the three in
//! `net_firewall.rs`: **verify, never assume.** A green "opened" that is not
//! open sends the player looking at their router for the rest of the evening.

use adastrail_shell::net_firewall::{
    firewalld_check, linux_elevate, linux_firewall, mac_manual, no_linux_firewall, read_firewalld,
    read_mac, read_ufw, read_windows, ufw_check, windows_check, windows_elevate, windows_manual,
    Firewall, FirewallState, RULE_NAME,
};
use serde_json::json;

const PORT: u16 = 27_015;

#[test]
fn windows_finds_the_rule_by_the_port_rather_than_by_an_english_word() {
    // `netsh` exits 1 with a LOCALIZED "no rules match" rather than printing an
    // empty list, so looking for any English word would report every non-English
    // install as blocked.
    let listed = "Rule Name:                            Ada's Trail (multiplayer)\n\
                  ----------------------------------------------------------------------\n\
                  Enabled:                              Yes\n\
                  Protocol:                             UDP\n\
                  LocalPort:                            27015\n";
    assert_eq!(read_windows(PORT, Some(listed)), FirewallState::Allowed);

    // A rule for a DIFFERENT port under the same name is not this port's rule.
    let elsewhere = listed.replace("27015", "27016");
    assert!(matches!(
        read_windows(PORT, Some(&elsewhere)),
        FirewallState::Blocked { .. }
    ));
}

#[test]
fn windows_treats_a_command_that_would_not_run_as_blocked() {
    // Defender is ON by default, so "I could not ask" and "the rule is not
    // there" have the same remedy — and offering the remedy is better than a
    // shrug the player cannot act on.
    let state = read_windows(PORT, None);
    let FirewallState::Blocked { manual } = state else {
        panic!("a machine we could not ask is a machine to offer the command to");
    };
    assert!(manual.contains("localport=27015"));
    assert!(manual.contains(RULE_NAME), "and names the rule it adds");
}

#[test]
fn the_windows_rule_name_never_changes() {
    // The check looks it up by name, so renaming it would leave every existing
    // player with an invisible orphan rule — and it is the SAME name the
    // Electron shell writes, so a player with both installed has one rule.
    assert_eq!(RULE_NAME, "Ada's Trail (multiplayer)");
    assert!(windows_check(PORT)
        .args
        .contains(&format!("name={RULE_NAME}")));
    assert!(windows_manual(PORT).contains(RULE_NAME));
}

#[test]
fn the_windows_elevation_waits_for_the_rule_it_asked_for() {
    // Without `-Wait` the verification races the rule being written, and the
    // player is told "blocked" one second after the rule appeared.
    let command = windows_elevate(PORT);
    let script = command.args.join(" ");
    assert!(
        script.contains("-Verb RunAs"),
        "one UAC prompt, on the press"
    );
    assert!(script.contains("-Wait"));
    // A rule name with an apostrophe in it inside a PowerShell single-quoted
    // string has to be doubled, or the argument list ends early.
    assert!(script.contains("''s Trail"));
}

#[test]
fn a_mac_with_its_firewall_off_is_told_there_is_nothing_to_do() {
    // Which is most Macs. Offering a remedy nobody requires is how a status row
    // teaches a player to ignore it.
    let state = read_mac(
        "/Applications/Adas Trail.app",
        Some("Firewall is disabled. (State = 0)"),
        None,
    );
    assert_eq!(
        state,
        FirewallState::NotNeeded {
            detail: "THE MACOS FIREWALL IS OFF".to_string()
        }
    );
    assert_eq!(state.to_json()["status"], json!("not-needed"));
}

#[test]
fn a_mac_firewall_filters_by_application_rather_than_by_port() {
    let app = "/Applications/Adas Trail.app/Contents/MacOS/adastrail";
    let on = "Firewall is enabled. (State = 1)";
    let listed =
        format!("ALF: total number of apps = 2\n1 : {app} ( Allow incoming connections )\n");
    assert_eq!(
        read_mac(app, Some(on), Some(&listed)),
        FirewallState::Allowed
    );

    let unknown = read_mac(app, Some(on), Some("ALF: total number of apps = 0\n"));
    let FirewallState::Blocked { manual } = unknown else {
        panic!("an app the firewall does not know is blocked");
    };
    assert_eq!(manual, mac_manual(app));
    assert!(
        manual.contains("--unblockapp"),
        "the remedy unblocks the APP"
    );
}

#[test]
fn a_mac_we_could_not_read_says_so_rather_than_guessing() {
    // Its own state, because telling a player to fix something that may not be
    // broken is how a status row loses their trust.
    let state = read_mac("/x", None, None);
    let FirewallState::Unknown { detail, manual } = state else {
        panic!("an unreadable firewall is unknown, not blocked");
    };
    assert!(detail.contains("COULD NOT READ"));
    assert!(manual.is_some(), "…and still leaves a manual path");
}

#[test]
fn linux_answers_from_what_is_actually_installed() {
    // Most gaming distributions and the Steam Deck ship with no host firewall,
    // so the honest answer is usually that there is nothing to do — reached by
    // looking rather than by inventing a problem.
    assert_eq!(linux_firewall(None, None), Firewall::None);
    assert_eq!(no_linux_firewall().to_json()["status"], json!("not-needed"));

    // A tool that RAN and exited non-zero still told us it exists — `ufw
    // status` without root is a refusal, not an absence.
    assert_eq!(linux_firewall(Some(""), None), Firewall::Ufw);
    assert_eq!(
        linux_firewall(None, Some("not running")),
        Firewall::Firewalld
    );
    assert_eq!(ufw_check().program, "ufw");
    assert_eq!(firewalld_check().program, "firewall-cmd");
}

#[test]
fn ufw_is_read_off_its_own_table() {
    assert_eq!(
        read_ufw(PORT, "Status: inactive"),
        FirewallState::NotNeeded {
            detail: "UFW IS INACTIVE".to_string()
        }
    );
    let allowed = "Status: active\n\nTo                         Action      From\n\
                   --                         ------      ----\n\
                   27015/udp                  ALLOW       Anywhere\n";
    assert_eq!(read_ufw(PORT, allowed), FirewallState::Allowed);

    // The TCP rule for the same number is not the UDP rule this game needs.
    let tcp_only = allowed.replace("27015/udp", "27015/tcp");
    assert!(matches!(
        read_ufw(PORT, &tcp_only),
        FirewallState::Blocked { .. }
    ));
}

#[test]
fn firewalld_is_read_off_its_own_two_questions() {
    assert_eq!(
        read_firewalld(PORT, "not running", None),
        FirewallState::NotNeeded {
            detail: "FIREWALLD IS NOT RUNNING".to_string()
        }
    );
    assert_eq!(
        read_firewalld(PORT, "running", Some("27015/udp 1900/udp")),
        FirewallState::Allowed
    );
    let FirewallState::Blocked { manual } = read_firewalld(PORT, "running", Some("")) else {
        panic!("a running firewalld with no rule is blocked");
    };
    assert!(
        manual.contains("--permanent"),
        "a rule that survives a reboot"
    );
    assert!(manual.contains("--reload"), "…and that is live now");
}

#[test]
fn linux_elevates_through_the_desktops_own_prompt() {
    // `sudo` from a windowed app either fails or silently waits for a password
    // nobody can type; `pkexec` is the only one that raises a dialog.
    for command in linux_elevate(Firewall::Ufw, PORT) {
        assert_eq!(command.program, "pkexec");
    }
    let firewalld = linux_elevate(Firewall::Firewalld, PORT);
    assert_eq!(firewalld.len(), 2, "add the rule, then make it live");
    assert!(firewalld.iter().all(|command| command.program == "pkexec"));
    assert!(linux_elevate(Firewall::None, PORT).is_empty());
}

#[test]
fn every_state_reaches_the_page_as_the_row_it_already_draws() {
    // The same JSON both desktop shells send, because the row that draws it is
    // the same row (`pwa/src/app/net-bridge.ts`'s `FirewallStatus`).
    assert_eq!(
        FirewallState::Allowed.to_json(),
        json!({ "status": "allowed" })
    );
    assert_eq!(
        FirewallState::Blocked {
            manual: "do the thing".to_string()
        }
        .to_json(),
        json!({ "status": "blocked", "manual": "do the thing" })
    );
    assert_eq!(
        FirewallState::Unknown {
            detail: "WHO KNOWS".to_string(),
            manual: None
        }
        .to_json(),
        json!({ "status": "unknown", "detail": "WHO KNOWS" })
    );
}
