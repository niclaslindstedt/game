// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! THE WINDOW — building it, keeping it pinned to our own origin, and
//! remembering where it was. The effects half of
//! `adastrail_shell::window_state` and of `adastrail_shell::config`.

use std::path::{Path, PathBuf};

use adastrail_shell::config::{
    is_internal_url, remote_game_url, start_url, BRAND_BG, DEVELOPER_TITLE_SUFFIX, WINDOW_TITLE,
};
use adastrail_shell::output;
use adastrail_shell::steam::OverlayPlan;
use adastrail_shell::window_state::{
    load_window_state, save_window_state, DisplayArea, WindowState, MIN_HEIGHT, MIN_WIDTH,
};
use tauri::webview::PageLoadEvent;
use tauri::{
    AppHandle, LogicalPosition, LogicalSize, Manager, Url, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent,
};

use crate::page::initialization_script;
use crate::Shell;

/// The origin the platform grants our registered scheme.
///
/// The two desktop webviews spell it differently and there is no arguing with
/// either: WebView2 maps a registered scheme onto `http://<scheme>.localhost`,
/// while WKWebView and WebKitGTK serve it as a real `<scheme>://` URL. Both are
/// ONE CONSTANT per platform, which is the property that actually matters — the
/// player's roster is keyed to it.
pub fn app_origin() -> String {
    let scheme = adastrail_shell::config::APP_SCHEME;
    let host = adastrail_shell::config::APP_HOST;
    if cfg!(windows) {
        format!("http://{scheme}.{host}")
    } else {
        format!("{scheme}://{host}")
    }
}

/// The monitors' usable areas, in the logical pixels the stored rect is in.
///
/// Tauri reports monitors in PHYSICAL pixels with a scale factor each, so the
/// conversion happens here — and per monitor rather than once, because a laptop
/// with an external display routinely has two different scale factors.
///
/// It is the full monitor rather than Electron's `workArea` (which excludes the
/// taskbar and the dock), because no desktop webview library exposes a work
/// area. The difference only matters for a window parked entirely inside the
/// taskbar, which is not a rect anybody drags a game to on purpose.
fn display_areas(window: &WebviewWindow) -> Vec<DisplayArea> {
    let Ok(monitors) = window.available_monitors() else {
        // Says nothing rather than "nowhere" — `on_some_display` keeps the
        // remembered position when the list is empty, so a shell that could not
        // enumerate displays never becomes the reason a window jumps home.
        return Vec::new();
    };
    monitors
        .iter()
        .map(|monitor| {
            let scale = monitor.scale_factor();
            let position = monitor.position().to_logical::<f64>(scale);
            let size = monitor.size().to_logical::<f64>(scale);
            DisplayArea {
                x: position.x,
                y: position.y,
                width: size.width,
                height: size.height,
            }
        })
        .collect()
}

/// Read the state this window should open in.
///
/// Split from [`build`] because the monitor list needs a window to ask, and the
/// window needs a size to be built with: the window is therefore created at the
/// remembered SIZE (which needs no monitors) and then moved to the remembered
/// POSITION only if the monitors still make it reachable.
fn opening_state(user_data: &Path) -> WindowState {
    load_window_state(user_data, &[], &mut output::warn)
}

/// Build the game's window and point it at the game.
pub fn build(app: &AppHandle, shell: &Shell) -> tauri::Result<WebviewWindow> {
    let remote = remote_game_url();
    let origin = app_origin();
    let target = remote.clone().unwrap_or_else(|| start_url(&origin));
    let state = opening_state(&shell.user_data);

    let title = if shell.developer_build {
        format!("{WINDOW_TITLE}{DEVELOPER_TITLE_SUFFIX}")
    } else {
        WINDOW_TITLE.to_string()
    };

    output::info(&format!("loading {target}"));
    let url = target
        .parse()
        .map_err(|_| tauri::Error::UnknownPath)
        .map(WebviewUrl::External)?;

    let window = WebviewWindowBuilder::new(app, "main", url)
        .title(title)
        .inner_size(state.width, state.height)
        .min_inner_size(MIN_WIDTH, MIN_HEIGHT)
        .background_color(brand_background())
        // Paint nothing until the page has something to show, so the player
        // never sees a white rectangle appear and then fill in — the desktop
        // equivalent of the mobile shell holding its splash until the WebView's
        // first frame.
        .visible(false)
        // The second argument is whether this launch forwards Shift+Tab to
        // Valve's overlay — see `crate::page::OVERLAY_COMMAND`.
        .initialization_script(initialization_script(
            &shell.capabilities,
            shell.overlay == OverlayPlan::Surface,
        ))
        .on_navigation(navigation_guard(
            app.clone(),
            origin.clone(),
            remote.clone(),
        ))
        // THE LAST COLD-START MARK, and the only one the shell cannot take for
        // itself: everything before it happens in this process, and this one is
        // the webview reporting that it finished with the document. It is not
        // the title screen — see `adastrail_shell::metrics` for what the number
        // therefore does not contain.
        .on_page_load(page_load_mark())
        .build()?;
    crate::metrics::mark("window-created");

    // NOW the monitors can be asked, so the remembered POSITION gets its
    // does-this-still-land-anywhere check — see `opening_state`.
    let placed = load_window_state(&shell.user_data, &display_areas(&window), &mut output::warn);
    if let (Some(x), Some(y)) = (placed.x, placed.y) {
        let _ = window.set_position(LogicalPosition::new(x, y));
    }
    let _ = window.set_size(LogicalSize::new(placed.width, placed.height));
    if placed.maximized {
        let _ = window.maximize();
    }
    if placed.fullscreen {
        let _ = window.set_fullscreen(true);
    }
    let _ = window.show();
    crate::metrics::mark("window-shown");

    remember_geometry(&window, shell.user_data.clone());
    Ok(window)
}

/// Stamp the last mark and write the launch down.
///
/// `Finished` only: `Started` fires again on every in-site navigation (the
/// library, the privacy page), and a second stamp of a mark already taken would
/// be dropped anyway — but writing the file again per navigation would fill
/// `startup.jsonl` with rows that are not launches.
fn page_load_mark(
) -> impl Fn(WebviewWindow, tauri::webview::PageLoadPayload<'_>) + Send + Sync + 'static {
    move |window, payload| {
        if payload.event() != PageLoadEvent::Finished {
            return;
        }
        crate::metrics::mark("page-loaded");
        let app = window.app_handle();
        let Some(shell) = app.try_state::<Shell>() else {
            return;
        };
        crate::metrics::finish(&shell.user_data, &app.package_info().version.to_string());
    }
}

/// The dark brand background, so no white flash shows through while the page
/// loads. Parsed from the one place the colour is written down.
fn brand_background() -> tauri::window::Color {
    let hex = BRAND_BG.trim_start_matches('#');
    let byte = |at: usize| u8::from_str_radix(&hex[at..at + 2], 16).unwrap_or(0);
    if hex.len() < 6 {
        return tauri::window::Color(0, 0, 0, 255);
    }
    tauri::window::Color(byte(0), byte(2), byte(4), 255)
}

/// Keep the window pinned to our own origin.
///
/// The site's own pages (the library, privacy, contact) are same-origin and
/// navigate normally; anything else — the repo link, an external credit — opens
/// in the player's browser rather than replacing the game with a web page it
/// cannot leave.
///
/// **The check runs on the effects side but decides nothing**: which URLs count
/// is `config::is_internal_url`, which has the tests.
///
/// It is installed on the BUILDER rather than on the finished window, and that
/// is not a style choice: a handler attached afterwards would leave the very
/// first navigation — the one that loads the game — unguarded.
fn navigation_guard(
    app: AppHandle,
    origin: String,
    remote: Option<String>,
) -> impl Fn(&Url) -> bool + Send + Sync + 'static {
    move |url: &Url| {
        let url = url.to_string();
        if is_internal_url(&url, &origin, remote.as_deref()) {
            return true;
        }
        // Only a web link is worth handing to the desktop; a `file:` or a
        // `javascript:` that got this far is a probe, not a credit link.
        if url.starts_with("http://") || url.starts_with("https://") {
            open_externally(&app, &url);
        } else {
            output::warn(&format!("navigation refused: {url}"));
        }
        false
    }
}

fn open_externally(app: &AppHandle, url: &str) {
    use tauri_plugin_opener::OpenerExt;
    if let Err(err) = app.opener().open_url(url, None::<&str>) {
        output::warn(&format!("could not open {url} — {err}"));
    }
}

/// Persist geometry on the way out.
///
/// Hooked to the CLOSE REQUEST rather than to anything later, because the rect
/// has to be read while the window still exists. That covers the player closing
/// the window — but NOT the QUIT row, which exits the process outright and never
/// asks a window to close, so [`remember_now`] is called there too. Electron
/// gets both from one handler because `app.quit()` closes its windows on the way
/// down; this is the same fact reached by a second call.
fn remember_geometry(window: &WebviewWindow, user_data: PathBuf) {
    let handle = window.clone();
    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::CloseRequested { .. }) {
            remember_now(&handle, &user_data);
        }
    });
}

/// Write down where the window is, right now.
///
/// The rect is read UN-MAXIMIZED: a maximized or fullscreen window reports the
/// screen, and restoring that as its normal size leaves the player unable to
/// get a small window back. So those two launches keep the stored rect and
/// change only the flag.
pub fn remember_now(window: &WebviewWindow, user_data: &Path) {
    let scale = window.scale_factor().unwrap_or(1.0);
    let maximized = window.is_maximized().unwrap_or(false);
    let fullscreen = window.is_fullscreen().unwrap_or(false);
    let size = window
        .inner_size()
        .map(|size| size.to_logical::<f64>(scale))
        .unwrap_or(LogicalSize::new(0.0, 0.0));
    let position = window
        .outer_position()
        .map(|position| position.to_logical::<f64>(scale))
        .ok();

    let stored = load_window_state(user_data, &[], &mut |_| {});
    let (width, height) = if maximized || fullscreen {
        (stored.width, stored.height)
    } else {
        (size.width.max(MIN_WIDTH), size.height.max(MIN_HEIGHT))
    };
    let (x, y) = if maximized || fullscreen {
        (stored.x, stored.y)
    } else {
        (position.map(|p| p.x), position.map(|p| p.y))
    };

    save_window_state(
        user_data,
        &WindowState {
            x,
            y,
            width,
            height,
            maximized,
            fullscreen,
        },
        &mut output::warn,
    );
}
