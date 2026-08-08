// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! THE INVITE THAT ARRIVES BEFORE THE GAME DOES — `+connect_lobby <id>` and
//! `--connect <address>`. The peer of `electron/src/net-invite.ts`, rule for
//! rule.
//!
//! Steam launches the binary with `+connect_lobby <id>` on the command line
//! when a friend accepts an invite while the game is closed, so a shell that
//! read no argv at all would open its title menu as if nothing had happened.
//! The same applies to a shareable direct link, which is the whole reason an
//! address is worth copying out of the HOST panel.
//!
//! **IT ARRIVES BEFORE THE WINDOW EXISTS, SO IT IS PARKED.** Both forms are
//! read at startup, when there is no page to hand them to; and — on the
//! Electron shell — on a `second-instance` event, when there IS a page but the
//! argument went to a process that is about to exit.
//!
//! **THE SECOND INSTANCE IS THE ONE THING THAT DIFFERS HERE, AND IT IS A
//! PLUGIN RATHER THAN A LIFECYCLE EVENT.** Electron has
//! `app.requestSingleInstanceLock()` built in; Tauri's peer is
//! `tauri-plugin-single-instance`, whose callback is handed the second
//! process's argv. Same fact, same parking, same delivery — see
//! `src-tauri/src/main.rs`.
//!
//! **AND IT IS CONSUMED, NOT REMEMBERED.** An invite is a one-shot instruction;
//! one left parked would re-join the same session every time the page reloaded,
//! which looks like the game ignoring the player's attempts to leave.

/// What a launch argument asks for. Exactly one of the two, mirroring the
/// bridge's `ConnectOptions`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Invite {
    /// Steam's own: a lobby to join, which is what hands back the host the P2P
    /// packets are addressed to.
    Lobby(String),
    /// Ours: an address a host copied off the session panel and shared.
    Address(String),
}

/// Read an invite out of a command line, or `None`.
///
/// Both forms travel as `flag value` rather than `flag=value`, because that is
/// how Steam passes `+connect_lobby` and there is no sense in the game's own
/// flag disagreeing with the one it has to accept anyway. A flag with nothing
/// after it is IGNORED rather than treated as an empty id — a truncated command
/// line must not produce a join attempt against "".
pub fn read_invite(argv: &[String]) -> Option<Invite> {
    for (at, flag) in argv.iter().enumerate() {
        let Some(value) = argv.get(at + 1) else {
            continue;
        };
        if value.is_empty() || value.starts_with('-') || value.starts_with('+') {
            continue;
        }
        if flag == "+connect_lobby" {
            return Some(Invite::Lobby(value.clone()));
        }
        if flag == "--connect" || flag == "+connect" {
            return Some(Invite::Address(value.clone()));
        }
    }
    None
}
