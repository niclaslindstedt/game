// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A game is started from an icon, so a Windows build must not also open a
// console window behind it. Debug builds keep one, because that is where the
// developer is reading the log.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! The Tauri desktop shell — the peer of `electron/src/main.ts`, and as thin as
//! that file is: a window showing the bundled game, plus the routing that
//! connects the page's bridge protocols to whatever is behind them.
//!
//! This is **phase 1** of `docs/tauri-migration.md`. What is behind the bridges
//! today is nothing except QUIT — the one protocol with no platform under it —
//! and every other protocol answers by saying which phase grows it
//! (`adastrail_shell::bridge`). That is deliberate: a mid-migration build that
//! went quiet about a protocol would present as a hang the page waits out.
//!
//! The ORDER of the startup work matters, and two things happen before the
//! event loop:
//!
//!  1. **The user-data directory is named and adopted**, before anything reads
//!     a path out of it.
//!  2. **The launch log is opened**, so the lines that matter most — the ones
//!     emitted immediately before the process dies — have somewhere to be.
//!
//! Everything security-shaped is deliberate and none of it is default: the
//! renderer is the whole game, so the page gets no Tauri API
//! (`withGlobalTauri` off), an almost-empty permission list
//! (`capabilities/default.json`), one command to reach the shell by, and a
//! window pinned to our own origin.

mod page;
mod protocol;
mod stamp;
mod window;

use std::path::PathBuf;

use adastrail_shell::bridge::{explain, route, Route};
use adastrail_shell::capabilities::Capabilities;
use adastrail_shell::config::{remote_game_url, APP_SCHEME, DEVELOPER_NOTICE, MIGRATION_NOTICE};
use adastrail_shell::output;
use adastrail_shell::user_data::{adopt_user_data, user_data_dir};
use adastrail_shell::webroot::webroot_exists;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

/// Everything the shell resolved before the window existed, held for the life
/// of the process.
pub struct Shell {
    /// What this launch may do.
    pub capabilities: Capabilities,
    /// Where this app keeps its own things (NOT the player's roster — that
    /// belongs to the webview; see `adastrail_shell::user_data`).
    pub user_data: PathBuf,
    /// Whether nothing packaged this binary.
    pub developer_build: bool,
    /// Where the bundled site is.
    pub webroot: PathBuf,
    /// What the command line asked for and did not get, said out loud at
    /// startup rather than silently dropped.
    pub refusals: Vec<String>,
}

/// THE ONE COMMAND the page may reach — every bridge protocol travels down it
/// as a JSON string, exactly as it travels down `postMessage` on the phone and
/// `ipcRenderer.send` under Electron.
#[tauri::command]
fn shell_post(app: AppHandle, shell: State<'_, Shell>, message: String) {
    let allows = |capability: &str| match capability {
        "mods" => shell.capabilities.mods(),
        "multiplayer" => shell.capabilities.multiplayer(),
        "voice" => shell.capabilities.voice(),
        _ => false,
    };
    let routed = route(&message, &allows);
    if let Some(line) = explain(&routed) {
        output::info(&line);
    }
    if routed == Route::Quit {
        // The main menu's QUIT row. `app.exit` rather than closing the window,
        // so macOS — where closing the last window leaves the process running
        // by convention — also exits, which is what a player pressing QUIT in a
        // game asked for. It also means no window is ever ASKED to close, so
        // the geometry is written down here rather than by the close handler.
        if let Some(main) = app.get_webview_window("main") {
            window::remember_now(&main, &shell.user_data);
        }
        app.exit(0);
    }
}

/// F11 / Alt+Enter, forwarded from the page's own key handler — see
/// [`page::FULLSCREEN_COMMAND`] for why a webview cannot do this natively.
#[tauri::command]
fn shell_toggle_fullscreen(app: AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let full = window.is_fullscreen().unwrap_or(false);
    let _ = window.set_fullscreen(!full);
}

/// FAIL LOUDLY.
///
/// The failure mode this exists to end: the shell hits something it cannot
/// continue past, writes a line to a console the player does not have, and
/// exits — so the game "just doesn't launch". A dialog is the only surface a
/// player double-clicking an icon will ever see, so anything fatal gets one,
/// carrying the path of the log file that has the rest of the story in it.
fn fatal(app: &AppHandle, summary: &str) {
    output::error(summary);
    let log = output::log_path()
        .map(|path| format!("\n\nDetails were written to:\n{}", path.display()))
        .unwrap_or_default();
    app.dialog()
        .message(format!("{summary}{log}"))
        .kind(MessageDialogKind::Error)
        .title("The game could not start")
        .blocking_show();
    app.exit(1);
}

/// Say what a developer build is, and what a phase-1 build is, once per launch.
///
/// Both are LOG LINES rather than dialogs, and that is the difference from the
/// Electron shell: it raises a box for a build somebody PACKAGED, because such
/// a file can be copied to another machine and opened there. This shell does not
/// package anything yet (phase 2), so every build of it is a checkout being run
/// by the person who checked it out — and making them click a box on every
/// `npm run tauri` is how you train somebody to dismiss the box that will
/// matter. The dialog arrives with the packaging.
fn announce(shell: &Shell) {
    if shell.developer_build {
        output::warn(&DEVELOPER_NOTICE.replace('\n', " "));
    }
    output::warn(&MIGRATION_NOTICE.replace('\n', " "));
    for refusal in &shell.refusals {
        output::warn(refusal);
    }
}

impl Shell {
    /// Everything the shell can decide before a window exists.
    fn resolve(app_data_root: PathBuf, argv: Vec<String>, webroot: PathBuf) -> Self {
        adopt_user_data(&app_data_root, &mut |line| output::info(line));
        let user_data = user_data_dir(&app_data_root);
        // Before anything else can fail: give the launch somewhere to be
        // written down.
        output::log_to_file(&user_data);

        let (capabilities, refusals) =
            adastrail_shell::capabilities::resolve_capabilities(stamp::build_capabilities(), &argv);
        Self {
            capabilities,
            user_data,
            developer_build: stamp::developer_build(),
            webroot,
            refusals,
        }
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            shell_post,
            shell_toggle_fullscreen
        ])
        .register_uri_scheme_protocol(APP_SCHEME, |ctx, request| {
            let app = ctx.app_handle();
            let root = app.state::<Shell>().webroot.clone();
            protocol::serve(app, &request, &root)
        })
        .setup(|app| {
            let handle = app.handle().clone();
            let app_data_root = handle
                .path()
                .data_dir()
                .unwrap_or_else(|_| std::env::temp_dir());
            let shell = Shell::resolve(
                app_data_root,
                std::env::args().skip(1).collect(),
                protocol::webroot_dir(&handle),
            );
            announce(&shell);

            if remote_game_url().is_none() && !webroot_exists(&shell.webroot) {
                // Fatal rather than logged: from an installed copy this is a
                // broken install, and from a checkout it is a build step that
                // was skipped — either way, silence here reads as "the game
                // doesn't launch".
                fatal(
                    &handle,
                    &format!(
                        "No bundled website was found inside the app, so there is nothing \
                         to show.\n\nFrom a checkout, run `npm run tauri` from the repo root \
                         (it builds the site into tauri/webroot/). From an installed copy, \
                         this build is incomplete — please reinstall it.\n\nLooked in:\n{}",
                        shell.webroot.display()
                    ),
                );
                return Ok(());
            }

            app.manage(shell);
            let shell = app.state::<Shell>();
            if let Err(err) = window::build(&handle, &shell) {
                fatal(
                    &handle,
                    &format!("The game's window could not be opened — {err}"),
                );
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("the game's event loop could not start");
}
