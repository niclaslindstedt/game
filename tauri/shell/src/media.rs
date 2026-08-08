// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! WHAT THE PAGE MAY ASK THE OPERATING SYSTEM FOR — the peer of
//! `installPermissionHandlers` in `electron/src/main.ts`, and the gate phase 2
//! shipped an entitlement for without shipping the thing that makes it mean
//! anything.
//!
//! **THE ONE GRANT IS THE MICROPHONE, AND IT IS GATED ON THE `voice`
//! CAPABILITY.** That gate is the whole reason voice is a build capability
//! rather than a setting (`crate::capabilities`): a build that was not
//! deliberately given voice cannot ask for the device at all — not because the
//! page politely declines to, but because the SHELL refuses the request. So a
//! plain download, an unstamped tree, and every build that predates voice are
//! all incapable of opening a microphone regardless of what the page does.
//!
//! **VIDEO IS REFUSED EVEN WITH VOICE ON.** This game has no camera feature, so
//! a request naming video is a request nothing here makes — refused by naming
//! the kind explicitly rather than by trusting the page to only ever ask for
//! audio.
//!
//! **EVERYTHING ELSE IS REFUSED, AND THAT IS A LIST WORTH HAVING.** Geolocation,
//! notifications, MIDI, pointer lock, the clipboard, the filesystem and screen
//! capture are all things nothing in this game needs, and a handler that says no
//! to each of them costs nothing and removes them from what a compromised
//! dependency could reach for. The renderer here is a large web app with its own
//! dependency tree; the whole deny-by-default posture in
//! `src-tauri/capabilities/default.json` exists because it is not treated as
//! trusted with the machine.
//!
//! ## THE PLATFORM HALF, AND WHERE IT IS HONEST
//!
//! Electron has one permission handler for every webview it owns. The three
//! platform webviews have three different mechanisms, and this shell answers
//! them at two depths on purpose:
//!
//!  * **WebKitGTK** raises `permission-request` on the webview, which
//!    `src-tauri/src/media.rs` connects and answers with [`decide`]. That is a
//!    real OS-level refusal: the page never reaches the device.
//!  * **WKWebView and WebView2** expose their equivalents only through
//!    Objective-C delegates and COM event handlers that Tauri does not surface,
//!    so there is no supported seam to hang [`decide`] on today.
//!  * **On every platform**, including those two, a build without `voice` has
//!    `navigator.mediaDevices` REMOVED by the initialization script, as a
//!    non-configurable own property of `navigator` — so the page cannot get it
//!    back and no library in its dependency tree can either.
//!
//! The floor is therefore shell-enforced everywhere and OS-enforced on one of
//! three, which is stated here rather than left to be discovered: the
//! entitlement in `entitlements.mac.plist` is what phase 2 shipped, and this is
//! what it is now attached to.

/// What the page asked the platform for, in the vocabulary all three webviews
/// can be reduced to.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MediaRequest {
    /// A microphone.
    Audio,
    /// A camera.
    Video,
    /// Both at once, which is how `getUserMedia({audio:true,video:true})`
    /// arrives. Refused whole rather than half-granted: a request naming video
    /// is not a request this game makes.
    AudioAndVideo,
    /// Anything else the platform can raise — geolocation, notifications,
    /// clipboard reads, screen capture, a persistent-storage quota.
    Other,
}

/// Whether this launch may honour it.
///
/// `voice` is [`crate::capabilities::Capabilities::voice`], which is already
/// the pair of "this build carries voice" and "this build carries multiplayer"
/// — a microphone with nothing to talk into is refused at the command line
/// rather than here.
pub fn decide(request: MediaRequest, voice: bool) -> bool {
    matches!(request, MediaRequest::Audio) && voice
}

/// The line the shell logs for a refusal.
///
/// It names the CAPABILITY when that is what decided it, because "permission
/// refused: media" on a build somebody deliberately packaged without voice
/// reads as a bug and "this build carries no voice capability" reads as the
/// answer.
pub fn explain(request: MediaRequest, voice: bool) -> String {
    match request {
        MediaRequest::Audio if !voice => {
            "permission refused: microphone — this build carries no voice capability".to_string()
        }
        MediaRequest::Audio => "permission granted: microphone".to_string(),
        MediaRequest::Video | MediaRequest::AudioAndVideo => {
            "permission refused: camera — this game has no camera feature".to_string()
        }
        MediaRequest::Other => "permission refused: the game asks for nothing else".to_string(),
    }
}

/// The page-side floor: take the microphone API away from a build that may not
/// use one.
///
/// Empty for a build that MAY, because a build with voice must be able to open
/// a device and the platform handler is what decides each request. For a build
/// without, `navigator.mediaDevices` is redefined as `undefined` and made
/// non-configurable, so nothing in the page's dependency tree can restore it —
/// which is a stronger statement than a feature flag and a weaker one than the
/// OS refusal, and both are stated in the module header.
///
/// **It is deliberately not a `delete`.** Removing the property lets a library
/// re-add it; defining it non-configurable is what makes the absence permanent
/// for the life of the document.
pub fn lockout_script(voice: bool) -> String {
    if voice {
        return String::new();
    }
    r#"  try {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: undefined, writable: false, configurable: false
    });
  } catch (e) { /* a webview that refuses the redefinition still has the native gate */ }
"#
    .to_string()
}
