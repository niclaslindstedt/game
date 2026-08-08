// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! THE WEBVIEW'S PERMISSION HANDLER — the effects half of
//! [`adastrail_shell::media`], and the thing phase 2's macOS entitlement was a
//! promise of.
//!
//! Electron has ONE permission handler for every webview it owns. The three
//! platform webviews have three different mechanisms and Tauri surfaces exactly
//! one of them, so this shell answers at two depths and says so rather than
//! implying a gate it does not have:
//!
//! | Platform | What is installed here |
//! | -------- | ---------------------- |
//! | **WebKitGTK** | `permission-request` on the webview, answered by [`adastrail_shell::media::decide`]. A real OS-level refusal: the page never reaches the device |
//! | **WKWebView** | Nothing. The equivalent is a `WKUIDelegate` method Tauri does not expose, and swizzling the delegate Tauri installed is a fight with the next minor release |
//! | **WebView2** | Nothing. `add_PermissionRequested` needs the COM controller and the same argument applies |
//!
//! **AND ON ALL THREE, A BUILD WITHOUT VOICE HAS `navigator.mediaDevices`
//! REMOVED BY THE INITIALIZATION SCRIPT** — as a non-configurable own property,
//! so nothing in the page's dependency tree can put it back. That is the floor,
//! it is enforced by the shell rather than by the game, and it is what makes
//! "this build cannot open a microphone" true everywhere.
//!
//! **WebKitGTK's own default is DENY**, which is why the Linux handler is
//! needed for the feature to work at all rather than only to refuse it: without
//! a handler, a build that DOES carry voice would find the microphone refused by
//! the webview and voice chat would be a settings page that never carries a
//! syllable.

/// Install the platform's permission handler on the game's window.
///
/// A no-op where the platform exposes no seam — see the module header for why
/// that is a statement rather than an omission, and what covers it instead.
#[cfg(target_os = "linux")]
pub fn install(window: &tauri::WebviewWindow, voice: bool) {
    use adastrail_shell::media::{decide, explain, MediaRequest};
    use adastrail_shell::output;
    use webkit2gtk::glib::object::Cast;
    use webkit2gtk::{
        PermissionRequestExt, UserMediaPermissionRequest, UserMediaPermissionRequestExt, WebViewExt,
    };

    let installed = window.with_webview(move |platform| {
        platform
            .inner()
            .connect_permission_request(move |_, request| {
                let kind = match request.downcast_ref::<UserMediaPermissionRequest>() {
                    Some(media) => match (media.is_for_audio_device(), media.is_for_video_device())
                    {
                        (true, true) => MediaRequest::AudioAndVideo,
                        (true, false) => MediaRequest::Audio,
                        (false, true) => MediaRequest::Video,
                        (false, false) => MediaRequest::Other,
                    },
                    // Geolocation, notifications, pointer lock, a device-info probe
                    // — everything else this game asks nothing of.
                    None => MediaRequest::Other,
                };
                output::info(&explain(kind, voice));
                if decide(kind, voice) {
                    request.allow();
                } else {
                    request.deny();
                }
                // TRUE means "handled": returning false would leave WebKit's own
                // default to answer, which is a deny — right for every case but the
                // one grant, and therefore wrong.
                true
            });
    });
    if installed.is_err() {
        adastrail_shell::output::warn(
            "the webview's permission handler could not be installed — \
             the microphone falls back to the page-side lockout",
        );
    }
}

/// Install the platform's permission handler on the game's window.
///
/// macOS and Windows expose no seam Tauri surfaces; the initialization script's
/// lockout is what answers there. See the module header.
#[cfg(not(target_os = "linux"))]
pub fn install(window: &tauri::WebviewWindow, voice: bool) {
    let _ = (window, voice);
}
