// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A game is started from an icon, so a Windows build must not also open a
// console window behind it. Debug builds keep one, because that is where the
// developer is reading the log.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! The Tauri desktop shell — the peer of `electron/src/main.ts`, and as thin as
//! that file is: a window showing the bundled game, plus the routing that
//! connects the page's bridge protocols to whatever is behind them.
//!
//! All six of the page's protocols are answered here — cloud save,
//! achievements, leaderboards, screenshots, mods and multiplayer.
//! `adastrail_shell::bridge` keeps its `Unanswered` route anyway, because a
//! seventh will arrive on the web side before it arrives here, and a shell that
//! went quiet about one would present to a player as a hang.
//!
//! The ORDER of the startup work matters, and five things happen before the
//! window exists:
//!
//!  1. **`--dedicated`** — the windowless mode, decided FIRST and before Tauri's
//!     builder, so a session server never registers a scheme or adopts a
//!     user-data directory.
//!  2. **Was this process started BY Steam**, and what that means for VALVE'S
//!     OVERLAY — asked before the handshake below stamps two of the three
//!     variables that answer it into our own environment (`steam_launch`, and
//!     `adastrail_shell::steam`). The overlay's answer has to be this early
//!     because it decides a PLUGIN, and a plugin is registered before the
//!     builder is finished (`overlay`).
//!  3. **`restart_app_if_necessary`** — relaunch through the Steam client if the
//!     player started the binary directly. Before the event loop, because a
//!     process about to be replaced must not go on to build a window.
//!  4. **The user-data directory is named and adopted**, before anything reads
//!     a path out of it.
//!  5. **The launch log is opened**, so the lines that matter most — the ones
//!     emitted immediately before the process dies — have somewhere to be.
//!
//! Everything security-shaped is deliberate and none of it is default: the
//! renderer is the whole game, so the page gets no Tauri API
//! (`withGlobalTauri` off), an almost-empty permission list
//! (`capabilities/default.json`), one command to reach the shell by, and a
//! window pinned to our own origin.

mod achievements;
mod cloud;
mod dedicated;
mod firewall;
mod lobby;
mod media;
mod metrics;
mod mods;
mod net;
mod overlay;
mod p2p;
mod page;
mod protocol;
mod roster;
mod session;
mod shots;
mod stamp;
mod steam;
mod window;
mod workshop;

use std::path::PathBuf;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use adastrail_shell::achievements_provider::AchievementsProvider;
use adastrail_shell::bridge::{emit_script, explain, parse_message, route, Route};
use adastrail_shell::capabilities::Capabilities;
use adastrail_shell::channels::event_global;
use adastrail_shell::cloud_provider::CloudProvider;
use adastrail_shell::config::{remote_game_url, APP_SCHEME, DEVELOPER_NOTICE, SHELL_NOTICE};
use adastrail_shell::leaderboards_provider::{leaderboards_provider, LeaderboardsProvider};
use adastrail_shell::net_invite::read_invite;
use adastrail_shell::output;
use adastrail_shell::runtime::Resources;
use adastrail_shell::screenshots::ShotsOptions;
use adastrail_shell::screenshots_provider::ScreenshotLibrary;
use adastrail_shell::steam::{
    current_webview, overlay_explanation, overlay_plan, process_env, steam_enabled,
    steam_overlay_wanted, OverlayPlan,
};
use adastrail_shell::user_data::{adopt_user_data, user_data_dir, APP_DIR_NAME};
use adastrail_shell::webroot::webroot_exists;
use adastrail_shell::{achievements as achievements_bridge, cloud_save, leaderboards, screenshots};
use serde_json::Value;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

use crate::mods::ModsBridge;
use crate::net::NetBridge;

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
    /// What this launch does about Valve's overlay. Decided from the same
    /// pre-handshake read, and carried rather than re-asked: the plugin is
    /// registered from `main` and the callback is armed from `setup`, and the two
    /// answering differently would be a surface nobody ever shows.
    pub overlay: OverlayPlan,
    /// MULTIPLAYER, when this launch may host or join one. `None` is the
    /// ordinary state of a plain download.
    pub net: Option<Arc<NetBridge>>,
    /// MODS, when this launch may load them.
    pub mods: Option<Arc<ModsBridge>>,
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
        // These two bridges do REAL WORK rather than forwarding JSON, so
        // they are objects with a life of their own rather than pure functions
        // — and each is `None` on a build whose capability list left it out,
        // which the router has already refused above.
        Route::Mods => {
            if let Some(bridge) = shell.mods.as_ref() {
                bridge.handle(&message_object(&message));
            }
        }
        Route::Net => {
            if let Some(bridge) = shell.net.as_ref() {
                bridge.handle(&message_object(&message));
            }
        }
        Route::Unanswered { .. } | Route::Refused { .. } | Route::Ignored => {}
    }
}

/// One bridge message, parsed. An unparseable one cannot reach here — [`route`]
/// answered `Ignored` for it — so the fallback is an empty object rather than a
/// branch nobody can take.
fn message_object(raw: &str) -> Value {
    parse_message(raw).unwrap_or_else(|| Value::Object(Default::default()))
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
    emit_event(app, protocol, &event);
}

/// THE RETURN PATH — the shell calling the page's own `window.__gis*Event(...)`
/// from outside, exactly as Electron's `executeJavaScript` and the phone's
/// `injectJavaScript` do. It is why the web side needed no change to run here.
///
/// By PROTOCOL name rather than by global, so the two stateful bridges — which
/// live in modules of their own and answer on threads of their own — have no
/// business knowing what a callback is called.
pub fn emit_event(app: &AppHandle, protocol: &str, payload: &Value) {
    let (Some(global), Some(window)) = (event_global(protocol), app.get_webview_window("main"))
    else {
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

/// SHIFT+TAB, forwarded from the page's own key handler — see
/// [`page::OVERLAY_COMMAND`] for why the chord cannot reach this process on its
/// own, and [`overlay`] for what answers it.
#[tauri::command]
fn shell_activate_overlay() {
    overlay::activate();
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

/// Say what a developer build is and what the overlay is, once per launch.
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
    output::info(&SHELL_NOTICE.replace('\n', " "));
    // The overlay is a per-launch fact worth stating either way, because it is
    // what somebody comparing the two desktop builds will notice first — and
    // because two of the three answers are something the reader can change.
    output::info(&overlay_explanation(shell.overlay, current_webview()));
    for refusal in &shell.refusals {
        output::warn(refusal);
    }
}

impl Shell {
    /// Everything the shell can decide before a window exists.
    fn resolve(
        app: &AppHandle,
        app_data_root: PathBuf,
        argv: Vec<String>,
        webroot: PathBuf,
        pictures: PathBuf,
        launch: SteamLaunch,
    ) -> Self {
        // Both halves of `launch` were read in `main`, before the handshake
        // below writes two of the three variables they read — see the module
        // header, and `steam_launch`.
        let SteamLaunch {
            started_by_steam,
            overlay,
        } = launch;

        adopt_user_data(&app_data_root, &mut |line| output::info(line));
        let user_data = user_data_dir(&app_data_root);
        // Before anything else can fail: give the launch somewhere to be
        // written down.
        output::log_to_file(&user_data);

        let (capabilities, refusals) =
            adastrail_shell::capabilities::resolve_capabilities(stamp::build_capabilities(), &argv);
        let resources = resources(app);
        // BUILT ONLY WHERE THE LAUNCH MAY HONOUR THEM. The router refuses a
        // gated protocol before it reaches a bridge, so a `None` here is the
        // second half of the same fact — and it means a plain download starts no
        // Node runtime, opens no lobby and has nothing to reap.
        let net = capabilities.multiplayer().then(|| {
            NetBridge::new(
                app.clone(),
                capabilities,
                resources.clone(),
                lobby::lobby_provider(),
            )
        });
        let mods = capabilities.mods().then(|| {
            Arc::new(ModsBridge::new(
                app.clone(),
                resources.clone(),
                user_data.clone(),
                steam::steam_app_id(),
                workshop::workshop_provider(),
            ))
        });
        // `+connect_lobby <id>` (a friend accepted an invite while the game was
        // closed) or `--connect <address>` (a shareable link). It arrives before
        // the window exists, so it is parked and delivered on the page's load.
        if let (Some(net), Some(invite)) = (net.as_ref(), read_invite(&argv)) {
            net.park_invite(invite);
        }

        Self {
            capabilities,
            user_data,
            developer_build: stamp::developer_build(),
            webroot,
            refusals,
            // The handshake happens on the first of these and is shared by all
            // of them — `steam::steam_client` is the one owner.
            cloud: cloud::cloud_provider(),
            achievements: achievements::achievements_provider(),
            scores: leaderboards_provider(),
            shot_library: shots::screenshot_library(),
            shots_folder: pictures.join(APP_DIR_NAME),
            started_by_steam,
            overlay,
            net,
            mods,
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
            // ALWAYS false on this shell, and load-bearing — INCLUDING on a
            // launch that has the overlay. Steam's screenshot key photographs
            // the swap chain it hooked, and the one it hooked here is the decoy,
            // whose frames are empty by construction. So Steam is still not
            // filing a usable copy, the gallery must not tell the player it is,
            // and `shots::SteamLibrary` goes on filing ours.
            steam_overlay: false,
            stamp: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|since| since.as_secs())
                .unwrap_or_default(),
        }
    }
}

/// WHAT THE LAUNCH ENVIRONMENT SAYS ABOUT STEAM, read once and carried.
pub struct SteamLaunch {
    /// Whether Steam started this process.
    started_by_steam: bool,
    /// What that means for Valve's overlay.
    overlay: OverlayPlan,
}

/// Ask the environment before anything answers for it.
///
/// **The one piece of ordering this file will not survive getting wrong.**
/// `Client::init_app` STAMPS `SteamAppId` and `SteamGameId` into this process's
/// own environment before handshaking, and those are two of the three variables
/// [`steam_overlay_wanted`] reads — so asked after a handshake, every launch
/// looks like a Steam launch. Called from `main` before the builder exists,
/// which is the earliest moment there is, and the answer is carried from there
/// rather than re-derived.
fn steam_launch() -> SteamLaunch {
    let started_by_steam = steam_overlay_wanted(&process_env);
    SteamLaunch {
        started_by_steam,
        overlay: overlay_plan(
            current_webview(),
            steam_enabled(&process_env),
            started_by_steam,
        ),
    }
}

/// Where this shape of app keeps the things that are not Rust.
///
/// One question, asked once, and both answers are absolute — see
/// [`adastrail_shell::runtime`] for why a checkout and a packaged copy cannot be
/// told apart by looking for a file.
fn resources(app: &AppHandle) -> Resources {
    match protocol::packaged_resource_dir(app) {
        Some(root) => Resources::packaged(root),
        None => Resources::checkout(protocol::checkout_root()),
    }
}

/// THE WINDOWLESS MODE, decided before Tauri exists.
///
/// A dedicated server must not register a scheme, open a window or adopt a
/// user-data directory, and the cheapest way to guarantee all three is never to
/// reach the code that does them. It also means the capability stamp is read
/// twice on this path — once here and never again — which is the correct trade
/// for keeping the branch above every piece of GUI machinery.
fn dedicated_mode(argv: &[String]) -> Option<i32> {
    let after = adastrail_shell::dedicated::dedicated_args(argv)?;
    let (capabilities, refusals) =
        adastrail_shell::capabilities::resolve_capabilities(stamp::build_capabilities(), argv);
    if stamp::developer_build() {
        output::warn(&DEVELOPER_NOTICE.replace('\n', " "));
    }
    for refusal in &refusals {
        output::warn(refusal);
    }
    // The checkout root, because a dedicated server is either an operator's own
    // build or a packaged one launched from its own directory — and the
    // packaged answer needs an `AppHandle`, which is precisely the thing this
    // branch exists to avoid creating.
    let resources = match std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(std::path::Path::to_path_buf))
        .filter(|dir| dir.join("server").join("server").join("main.js").is_file())
    {
        Some(beside) => Resources::packaged(beside),
        None => Resources::checkout(protocol::checkout_root()),
    };
    Some(dedicated::run(&after, &capabilities, &resources))
}

/// PUT A PANIC IN THE LAUNCH LOG.
///
/// A packaged game on Windows has no console: the default hook writes the one
/// line carrying the actual cause to a stream nobody is holding, so a shell
/// that panicked is, from the player's side, a program that did nothing. The
/// hook routes the same text through [`output`], which appends it to the launch
/// log — and the launch log is the whole of a bug report.
///
/// It does NOT swallow the default: the backtrace still goes where it always
/// went, for whoever has a terminal open.
fn install_panic_hook() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let payload = info
            .payload()
            .downcast_ref::<&str>()
            .map(|message| (*message).to_string())
            .or_else(|| info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "no message".to_string());
        output::error(&adastrail_shell::display::panic_report(
            &payload,
            info.location().map(std::string::ToString::to_string),
        ));
        previous(info);
    }));
}

fn main() {
    // Before anything else at all, so the zero the cold-start marks are
    // measured from is the process's own beginning rather than the first moment
    // somebody remembered to ask.
    metrics::start();
    install_panic_hook();
    let argv: Vec<String> = std::env::args().skip(1).collect();

    // FIRST OF ALL: `--dedicated` never builds a window — see `dedicated_mode`.
    if let Some(code) = dedicated_mode(&argv) {
        std::process::exit(code);
    }

    // …and neither does the roster check, for the same reason: it reads the
    // platform cloud and prints, so it must not register a scheme or write a
    // window rect over the geometry the player's real launches remember. It IS
    // asked from a terminal by somebody who wants the answer, so the shell's
    // informational channel is turned on for it — a release build that
    // swallowed the Steam handshake's own lines would be a diagnostic command
    // that appears to do nothing.
    if let Some(mode) = adastrail_shell::roster::roster_mode(&argv) {
        std::env::set_var("GIS_VERBOSE", "1");
        std::process::exit(roster::run(&mode));
    }

    // A WINDOW SYSTEM THAT IS NOT THERE is the one fatal path with nowhere to
    // put a dialog — the thing that failed IS the window system. Asked before
    // Tauri's builder, because the handle is opened deep inside the event-loop
    // library, which unwraps it: without this, the answer to "why did the game
    // not start" is fourteen frames of somebody else's backtrace.
    //
    // AND AFTER THE TWO WINDOWLESS MODES ABOVE, which is the half that is easy
    // to get backwards: a dedicated server and a roster check are the launches
    // that legitimately have no display, and refusing them here would break
    // exactly the two things a headless box is for.
    if let Some(refusal) =
        adastrail_shell::display::refuse_windowless(std::env::consts::OS, &|name| {
            std::env::var(name).ok()
        })
    {
        output::error(&format!("The game could not start — {refusal}"));
        std::process::exit(1);
    }

    // BEFORE ANYTHING ELSE TOUCHES STEAM, in either direction: what this launch
    // is, and what it therefore does about the overlay. See `steam_launch` for
    // why the order rather than the answer is the fragile part.
    let launch = steam_launch();

    // BEFORE THE EVENT LOOP: if the player started this binary directly and it
    // should have gone through the client, hand over and go. A process about to
    // be replaced must not build a window, register a scheme, or write a launch
    // log.
    if steam::restart_if_necessary() {
        return;
    }

    let builder = tauri::Builder::default()
        // A SECOND COPY OF THE GAME would fight the first over the same save
        // files and the same Steam session, so the argument is handed to the
        // running instance instead — which is also the ONLY place a friend's
        // "accept" reaches a game that is already open, because Steam hands
        // `+connect_lobby` to a process that is about to exit.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            // `try_state`, because a second copy started during this one's own
            // setup would reach here before the shell is managed — and a panic
            // in a plugin callback takes the FIRST copy down, which is the one
            // the player is looking at.
            let Some(net) = app.try_state::<Shell>().and_then(|shell| shell.net.clone()) else {
                return;
            };
            // `argv[0]` is the second process's own path, exactly as it is for
            // this one.
            let Some(invite) = read_invite(&argv[1.min(argv.len())..]) else {
                return;
            };
            net.park_invite(invite);
            net.deliver_invite();
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init());

    // THE OVERLAY'S DECOY SURFACE, on a launch that has Valve's library in it to
    // hook one — and no plugin at all on a launch that does not. AFTER the
    // single-instance plugin, which has to stay first: it is what decides
    // whether this process lives at all, and a second copy must exit before any
    // other plugin's setup has run. See `overlay`.
    overlay::install(builder, launch.overlay)
        .invoke_handler(tauri::generate_handler![
            shell_post,
            shell_toggle_fullscreen,
            shell_activate_overlay
        ])
        .register_uri_scheme_protocol(APP_SCHEME, |ctx, request| {
            let app = ctx.app_handle();
            let root = app.state::<Shell>().webroot.clone();
            protocol::serve(app, &request, &root)
        })
        .setup(move |app| {
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
                &handle,
                app_data_root,
                std::env::args().skip(1).collect(),
                protocol::webroot_dir(&handle),
                pictures,
                launch,
            );
            // Everything the shell can decide is decided, the platform seams
            // have been asked for (which is where a Steam handshake is paid
            // for), and the launch log is open.
            metrics::mark("shell-resolved");
            if remote_game_url().is_some() {
                // A launch pointed at a remote slot is measuring somebody's
                // network, not this build's startup — said in the row rather
                // than left for a reader to infer from a number that looks
                // wrong.
                metrics::note("GIS_GAME_URL was set — this launch loaded a remote site");
            }
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
            // BEFORE THE WINDOW, and that is the whole of why it is here rather
            // than beside the plugin: the surface's GPU device is created when
            // the window appears, and Valve's library has to be initialized
            // before it — which asking for the client is what does. See
            // `overlay`.
            overlay::arm(&handle, shell.overlay);
            match window::build(&handle, &shell) {
                Ok(window) => {
                    // THE MICROPHONE GATE, on the window rather than on the app:
                    // it is the webview's own handler, and it has to be
                    // installed before the page can ask. See `media`.
                    media::install(&window, shell.capabilities.voice());
                    // An invite read off the command line, handed over now that
                    // there is a page to hand it to.
                    if let Some(net) = shell.net.as_ref() {
                        net.deliver_invite();
                    }
                }
                Err(err) => fatal(
                    &handle,
                    &format!("The game's window could not be opened — {err}"),
                ),
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("the game's event loop could not start")
        .run(|app, event| {
            // A SESSION SERVER OUTLIVING THE WINDOW IT WAS STARTED FOR is an
            // orphan holding a whole level in memory, and on a depot install
            // nothing else will ever reap it. `Exit` fires for the QUIT row, for
            // the last window closing and for a signal alike — the child also
            // watches its own stdin for the case where none of the three
            // happens, but this is the orderly path.
            if matches!(event, tauri::RunEvent::Exit) {
                if let Some(net) = app.try_state::<Shell>().and_then(|shell| shell.net.clone()) {
                    net.shutdown();
                }
            }
        });
}
