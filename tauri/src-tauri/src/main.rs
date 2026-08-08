// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A game is started from an icon, so a Windows build must not also open a
// console window behind it. Debug builds keep one, because that is where the
// developer is reading the log.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! The Tauri desktop shell — the peer of `electron/src/main.ts`, and as thin as
//! that file is: a window showing the bundled game, plus the routing that
//! connects the page's bridge protocols to whatever is behind them.
//!
//! This is **phase 2** of `docs/tauri-migration.md`. Four of the six protocols
//! are answered for real now — cloud save, achievements, leaderboards and
//! screenshots — and the two that are not (mods, net) still answer by saying
//! which phase grows them (`adastrail_shell::bridge`). That is deliberate: a
//! mid-migration build that went quiet about a protocol would present as a hang
//! the page waits out.
//!
//! The ORDER of the startup work matters, and four things happen before the
//! window exists:
//!
//!  1. **Was this process started BY Steam** — asked FIRST, because the
//!     handshake below stamps two of the three variables that answer it into
//!     our own environment (`adastrail_shell::steam`).
//!  2. **`restart_app_if_necessary`** — relaunch through the Steam client if the
//!     player started the binary directly. Before the event loop, because a
//!     process about to be replaced must not go on to build a window.
//!  3. **The user-data directory is named and adopted**, before anything reads
//!     a path out of it.
//!  4. **The launch log is opened**, so the lines that matter most — the ones
//!     emitted immediately before the process dies — have somewhere to be.
//!
//! Everything security-shaped is deliberate and none of it is default: the
//! renderer is the whole game, so the page gets no Tauri API
//! (`withGlobalTauri` off), an almost-empty permission list
//! (`capabilities/default.json`), one command to reach the shell by, and a
//! window pinned to our own origin.

mod achievements;
mod cloud;
mod page;
mod protocol;
mod shots;
mod stamp;
mod steam;
mod window;

use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use adastrail_shell::achievements_provider::AchievementsProvider;
use adastrail_shell::bridge::{emit_script, explain, parse_message, route, Route};
use adastrail_shell::capabilities::Capabilities;
use adastrail_shell::channels::event_global;
use adastrail_shell::cloud_provider::CloudProvider;
use adastrail_shell::config::{remote_game_url, APP_SCHEME, DEVELOPER_NOTICE, MIGRATION_NOTICE};
use adastrail_shell::leaderboards_provider::{leaderboards_provider, LeaderboardsProvider};
use adastrail_shell::output;
use adastrail_shell::screenshots::ShotsOptions;
use adastrail_shell::screenshots_provider::ScreenshotLibrary;
use adastrail_shell::steam::{
    current_webview, overlay_explanation, process_env, steam_overlay_wanted,
};
use adastrail_shell::user_data::{adopt_user_data, user_data_dir, APP_DIR_NAME};
use adastrail_shell::webroot::webroot_exists;
use adastrail_shell::{achievements as achievements_bridge, cloud_save, leaderboards, screenshots};
use serde_json::Value;
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
    /// THE FOUR PLATFORM SEAMS, resolved once, every one of them possibly
    /// absent. `None` is an ORDINARY state on all four — a developer build, a
    /// machine with Steam closed, `GIS_STEAM=off` — and each bridge answers it
    /// as "unavailable" rather than as an error.
    pub cloud: Option<Box<dyn CloudProvider>>,
    /// The badge shelf's mirror.
    pub achievements: Option<Box<dyn AchievementsProvider>>,
    /// The score boards. Always `None` — see the seam for the argument.
    pub scores: Option<Box<dyn LeaderboardsProvider>>,
    /// Steam's own screenshot library.
    pub shot_library: Option<Box<dyn ScreenshotLibrary>>,
    /// Where the game's own pictures are filed.
    pub shots_folder: PathBuf,
    /// Whether Steam started this process. Read BEFORE the handshake — see the
    /// module header.
    pub started_by_steam: bool,
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
    match routed {
        Route::Quit => {
            // The main menu's QUIT row. `app.exit` rather than closing the
            // window, so macOS — where closing the last window leaves the
            // process running by convention — also exits, which is what a player
            // pressing QUIT in a game asked for. It also means no window is ever
            // ASKED to close, so the geometry is written down here rather than by
            // the close handler.
            if let Some(main) = app.get_webview_window("main") {
                window::remember_now(&main, &shell.user_data);
            }
            app.exit(0);
        }
        Route::Cloud => answer(&app, "cloud", &message, |request| {
            cloud_save::handle(&cloud_save::parse(request), shell.cloud.as_deref())
        }),
        Route::Achievements => answer(&app, "achievements", &message, |request| {
            achievements_bridge::handle(
                &achievements_bridge::parse(request),
                shell.achievements.as_deref(),
            )
        }),
        Route::Scores => answer(&app, "scores", &message, |request| {
            leaderboards::handle(&leaderboards::parse(request), shell.scores.as_deref())
        }),
        Route::Shots => answer(&app, "shots", &message, |request| {
            screenshots::handle(
                &screenshots::parse(request),
                &shell.shots_options(),
                &shots::DesktopShots::new(app.clone()),
                shell.shot_library.as_deref(),
            )
        }),
        Route::Unimplemented { .. } | Route::Refused { .. } | Route::Ignored => {}
    }
}

/// Parse, answer, and hand the answer back to the page.
///
/// The one funnel every protocol goes through, so that "a request that produces
/// no event" is stated once (the `init` hello, and an action this shell does not
/// know) rather than four times.
fn answer(app: &AppHandle, protocol: &str, raw: &str, reply: impl FnOnce(&Value) -> Option<Value>) {
    let Some(request) = parse_message(raw) else {
        return;
    };
    let Some(event) = reply(&request) else {
        return;
    };
    let Some(global) = event_global(protocol) else {
        return;
    };
    emit(app, global, &event);
}

/// THE RETURN PATH — the shell calling the page's own `window.__gis*Event(...)`
/// from outside, exactly as Electron's `executeJavaScript` and the phone's
/// `injectJavaScript` do. It is why the web side needed no change to run here.
fn emit(app: &AppHandle, global: &str, payload: &Value) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    // A page mid-navigation or tearing down has no callback yet; the web side
    // resolves every outstanding request through its own timeout, so a failure
    // here is not worth a line in the log on every frame of a reload.
    let _ = window.eval(emit_script(global, payload));
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

/// Say what a developer build is, what a phase-2 build is, and what the overlay
/// is not, once per launch.
///
/// All of them are LOG LINES rather than dialogs, and that is still the
/// difference from the Electron shell even now that this tree packages itself:
/// the Electron box exists for a build somebody packaged WITHOUT stamping it,
/// and this tree's packaging always stamps (`scripts/package.mjs` refuses
/// otherwise). So an unstamped Tauri binary is by construction a checkout being
/// run by the person who checked it out — and making them click a box on every
/// `npm run tauri` is how you train somebody to dismiss the box that will
/// matter.
fn announce(shell: &Shell) {
    if shell.developer_build {
        output::warn(&DEVELOPER_NOTICE.replace('\n', " "));
    }
    output::warn(&MIGRATION_NOTICE.replace('\n', " "));
    // The overlay's absence is a per-launch fact worth stating, because it is
    // what somebody comparing the two desktop builds will notice first.
    output::info(&overlay_explanation(
        current_webview(),
        shell.started_by_steam,
    ));
    for refusal in &shell.refusals {
        output::warn(refusal);
    }
}

impl Shell {
    /// Everything the shell can decide before a window exists.
    fn resolve(
        app_data_root: PathBuf,
        argv: Vec<String>,
        webroot: PathBuf,
        pictures: PathBuf,
    ) -> Self {
        // FIRST, before the handshake below writes two of the three variables it
        // reads — see the module header.
        let started_by_steam = steam_overlay_wanted(&process_env);

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
            // The handshake happens on the first of these and is shared by all
            // four — `steam::steam_client` is the one owner.
            cloud: cloud::cloud_provider(),
            achievements: achievements::achievements_provider(),
            scores: leaderboards_provider(),
            shot_library: shots::screenshot_library(),
            shots_folder: pictures.join(APP_DIR_NAME),
            started_by_steam,
        }
    }

    /// What the screenshots bridge needs to know about this launch.
    ///
    /// Built per request rather than stored, for the stamp: it is the fallback
    /// file name's only source of uniqueness, and one resolved at startup would
    /// give every unnamed picture in a session the same name.
    fn shots_options(&self) -> ShotsOptions {
        ShotsOptions {
            folder: self.shots_folder.clone(),
            // ALWAYS false on this shell, and load-bearing: there is no overlay,
            // so Steam is not filing its own copy and the gallery must not tell
            // the player it is. `shots::SteamLibrary` is what files the Steam
            // copy here instead.
            steam_overlay: false,
            stamp: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|since| since.as_secs())
                .unwrap_or_default(),
        }
    }
}

fn main() {
    // BEFORE THE EVENT LOOP, and before anything else touches Steam: if the
    // player started this binary directly and it should have gone through the
    // client, hand over and go. A process about to be replaced must not build a
    // window, register a scheme, or write a launch log.
    if steam::restart_if_necessary() {
        return;
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
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
            let pictures = handle
                .path()
                .picture_dir()
                .unwrap_or_else(|_| app_data_root.clone());
            let shell = Shell::resolve(
                app_data_root,
                std::env::args().skip(1).collect(),
                protocol::webroot_dir(&handle),
                pictures,
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
