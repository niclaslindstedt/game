// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! IS THERE ANYWHERE TO PUT A WINDOW — the one startup failure that happens
//! before there is anything to show a dialog on.
//!
//! Every other fatal path in this shell ends in a message box, because a player
//! who double-clicked an icon will never see a console. This one cannot: the
//! thing that failed IS the window system, so the dialog has nowhere to go
//! either. What is left is the process's own exit, and the only question is
//! whether it is a sentence or a stack trace.
//!
//! It is a stack trace by default, and not one this tree writes: on Linux the
//! window-system handle is opened deep inside the event-loop library, which
//! unwraps it. So the check happens HERE instead, before the builder exists —
//! a launch with no display is refused with a line naming the three ordinary
//! causes, which is what a developer on an SSH session, a container, or a
//! machine whose desktop is not running actually needs to read.
//!
//! **Only Linux can be asked**, and that is a platform fact rather than an
//! omission: macOS and Windows have no equivalent of an absent display server
//! — a session either has a window server or the process is not running at all.
//! The two answer `None` here and keep the panic hook as their whole net.

/// Why this machine cannot open a window, or `None` when it can.
///
/// `env` is handed in rather than reached for so the decision is testable, and
/// `os` likewise: the interesting case is the one the machine running the test
/// is not on.
///
/// The refusal is deliberately narrow. A session sets `DISPLAY` (X11) or
/// `WAYLAND_DISPLAY` (Wayland) or both, and NEITHER being set is the exact
/// shape of a headless box. Anything more clever — probing the socket, reading
/// `XDG_SESSION_TYPE` — would start refusing the unusual setups that do work
/// (a remote display, a nested compositor, `gamescope` on a handheld), and a
/// shell that refuses to start on a machine that could have run it is a worse
/// bug than the stack trace this replaces.
pub fn refuse_windowless(os: &str, env: &dyn Fn(&str) -> Option<String>) -> Option<String> {
    if os != "linux" {
        return None;
    }
    let set = |name: &str| env(name).is_some_and(|value| !value.is_empty());
    if set("DISPLAY") || set("WAYLAND_DISPLAY") {
        return None;
    }
    Some(
        "there is no display to open a window on — neither DISPLAY nor \
         WAYLAND_DISPLAY is set.\n\nThat is what a session over SSH, a \
         container, or a machine whose desktop is not running looks like. \
         Start the game from a desktop session, or forward a display to this \
         one."
            .to_string(),
    )
}

/// What a panic should say to somebody who has no console.
///
/// A packaged game on Windows is started from an icon and its stderr goes to a
/// stream nobody is holding, so the default panic message — the one carrying
/// the actual cause — reaches nobody at all. The hook that calls this puts the
/// same text through [`crate::output`], which means the LAUNCH LOG gets it, and
/// the launch log is the whole of a bug report.
pub fn panic_report(payload: &str, location: Option<String>) -> String {
    let where_it_was = location
        .map(|location| format!(" at {location}"))
        .unwrap_or_default();
    format!("the shell hit an unrecoverable error{where_it_was} — {payload}")
}
