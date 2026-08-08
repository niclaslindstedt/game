// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! SCREENSHOTS' SHELL half — the peer of `electron/src/screenshots.ts`, and the
//! bridge between the game's screenshot key (`pwa/src/game/screenshots.ts`) and
//! the things a desktop can do with a picture that a browser tab cannot. The
//! protocol is documented on the web side (`pwa/src/app/screenshot-bridge.ts`);
//! keep the two in step.
//!
//! ```text
//!   FILE   put the PNG in the player's own pictures folder, under a folder
//!          named for the game. A "download" is the browser's answer and it is
//!          the wrong one in an installed app: it lands in a folder nobody
//!          opens, with a name nobody chose.
//!   SHARE  the desktop's honest version of a share sheet — the picture goes on
//!          the CLIPBOARD (a paste target is always one window away) and the
//!          file manager is opened on the file itself.
//! ```
//!
//! **Everything that decides is here; everything that touches a disk is a
//! [`ShotSink`].** That split is what lets the whole protocol be tested — the
//! base64 that is not a PNG, the file name that tries to leave the folder, the
//! write that fails — without a filesystem, a clipboard or a window.
//!
//! EVERY FAILURE IS AN `ok: false`. A full disk, a read-only pictures folder, a
//! player who has moved their home directory — all of them are somebody's
//! ordinary Tuesday, and none of them may crash the shell or lose the picture:
//! the game's own roll already holds it before this bridge is ever called.

use std::path::{Path, PathBuf};

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use serde_json::{json, Value};

use crate::screenshots_provider::ScreenshotLibrary;

/// The first four bytes of every PNG.
const PNG_MAGIC: [u8; 4] = [0x89, 0x50, 0x4e, 0x47];

/// The longest file name the bridge will build. Long enough for the game's own
/// stamped names, short enough to survive every filesystem they land on.
const MAX_NAME: usize = 120;

/// WHICH SHELL answered, as the page's own `ShotsProviderId` spells it.
///
/// Hardcoded, exactly as the Electron peer hardcodes it, and deliberately NOT
/// the platform library's id: the page's union is `steam | ios | android` — a
/// PLATFORM — and it is the same platform whichever binary is showing the game.
/// A value invented here would be a protocol redesigned for this shell, which
/// is the one thing the migration is not allowed to do.
const SHELL_PROVIDER: &str = "steam";

/// One parsed message from the page (`__gisShots` already checked).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ShotsRequest {
    /// `init` | `status` | `file` | `share`.
    pub action: String,
    /// The page's own correlation id.
    pub request_id: u64,
    /// The file name the game chose (already slugged and stamped) — re-checked
    /// here anyway, because a name from the page joins a path.
    pub name: Option<String>,
    /// The picture itself, base64 — the pipe carries text.
    pub png: Option<String>,
}

/// Read one shots message off the shell channel.
pub fn parse(message: &Value) -> ShotsRequest {
    ShotsRequest {
        action: crate::bridge::action(message),
        request_id: crate::bridge::request_id(message),
        name: message
            .get("name")
            .and_then(Value::as_str)
            .map(str::to_string),
        png: message
            .get("png")
            .and_then(Value::as_str)
            .map(str::to_string),
    }
}

/// What the shell knows about this launch that the picture's fate depends on.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ShotsOptions {
    /// Where pictures go: the OS pictures folder joined with the game's own
    /// folder name. Passed in rather than read here, so this module needs no
    /// path resolver.
    pub folder: PathBuf,
    /// Whether Steam's overlay is filing its own copy alongside ours.
    ///
    /// On this shell it is always false and that is load-bearing rather than
    /// pessimistic — see [`crate::screenshots_provider`]. The gallery reads it
    /// to decide whether to tell the player Steam has a copy too.
    pub steam_overlay: bool,
    /// Seconds since the epoch, for the fallback file name. Handed in so this
    /// module needs no clock.
    pub stamp: u64,
}

/// The effects half: writing the file, and putting it where a share can find it.
pub trait ShotSink {
    /// Write the picture into the pictures folder, answering where it landed.
    fn write(&self, path: &Path, png: &[u8]) -> bool;
    /// Put the picture on the clipboard and reveal the file in the file
    /// manager. Either half failing is a false; the file is already written.
    fn share(&self, path: &Path, png: &[u8]) -> bool;
}

/// Answer one shots message, or `None` for the `init` hello (nothing to set up —
/// the folder is made on the first write) and anything unrecognised.
pub fn handle(
    request: &ShotsRequest,
    options: &ShotsOptions,
    sink: &dyn ShotSink,
    library: Option<&dyn ScreenshotLibrary>,
) -> Option<Value> {
    let request_id = request.request_id;
    match request.action.as_str() {
        "init" => None,
        "status" => Some(json!({
            "event": "status",
            "requestId": request_id,
            "ok": true,
            "available": true,
            "provider": SHELL_PROVIDER,
            "folder": options.folder.to_string_lossy(),
            // The clipboard and the file manager are always there on a desktop;
            // there is nothing to probe.
            "canShare": true,
            "steamOverlay": options.steam_overlay,
        })),
        "file" => Some(match write(request, options, sink, library) {
            Some((path, _)) => json!({
                "event": "file",
                "requestId": request_id,
                "ok": true,
                "path": path.to_string_lossy(),
            }),
            None => json!({ "event": "file", "requestId": request_id, "ok": false }),
        }),
        "share" => {
            let ok = write(request, options, sink, library)
                // The clipboard first, because it is the half that actually
                // sends the picture somewhere; the file manager is the half that
                // shows the player where their copy lives.
                .is_some_and(|(path, png)| sink.share(&path, &png));
            Some(json!({ "event": "share", "requestId": request_id, "ok": ok }))
        }
        _ => None,
    }
}

/// Write the picture, and offer it to the platform library.
///
/// Answers where it landed AND the decoded bytes, so a `share` — which needs
/// both — decodes a megabyte of base64 once rather than twice.  `None` when the
/// page sent something that is not a PNG, or the disk refused it.
fn write(
    request: &ShotsRequest,
    options: &ShotsOptions,
    sink: &dyn ShotSink,
    library: Option<&dyn ScreenshotLibrary>,
) -> Option<(PathBuf, Vec<u8>)> {
    let png = decode_png(request.png.as_deref())?;
    let path = options
        .folder
        .join(safe_name(request.name.as_deref(), options.stamp));
    if !sink.write(&path, &png) {
        return None;
    }
    // The platform's own library. NEVER fatal: the file above is already the
    // player's copy, and a refusal here is a Steam that is not running rather
    // than a picture that was lost.
    if let (Some(library), Some((width, height))) = (library, png_dimensions(&png)) {
        library.add(&path, width, height);
    }
    Some((path, png))
}

/// The picture, or `None` when the page sent something that is not one.
///
/// The page is our own code, but this is the one place it hands the shell bytes
/// that become a FILE — so the magic number is checked rather than assumed.
pub fn decode_png(encoded: Option<&str>) -> Option<Vec<u8>> {
    let encoded = encoded.filter(|text| !text.is_empty())?;
    let bytes = STANDARD.decode(encoded).ok()?;
    (bytes.len() > 8 && bytes[..4] == PNG_MAGIC).then_some(bytes)
}

/// A file name that cannot escape the screenshots folder.
///
/// The game builds these itself and they are already tame; this is the belt on
/// the braces, because a name from the page joins a path here. Everything
/// outside the safe set becomes a dash — which takes `/`, `\`, `..` and a drive
/// letter's colon with it — and a name that does not then START with a letter or
/// a digit is replaced outright rather than repaired, so a leading dash cannot
/// present itself to anything as an option.
pub fn safe_name(name: Option<&str>, stamp: u64) -> String {
    let cleaned: String = name
        .unwrap_or_default()
        .chars()
        .take(MAX_NAME)
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-') {
                character
            } else {
                '-'
            }
        })
        .collect();
    if cleaned.starts_with(|c: char| c.is_ascii_alphanumeric()) {
        cleaned
    } else {
        format!("screenshot-{stamp}.png")
    }
}

/// A PNG's pixel size, read off its IHDR chunk.
///
/// Needed because the platform library is told the picture's dimensions and this
/// shell has no image decoder — nor any need for one: the 8-byte signature is
/// followed by a length, the `IHDR` tag, and then the width and the height as
/// big-endian `u32`s. That layout is the first thing the PNG specification
/// fixes, so reading those eight bytes is the whole job.
pub fn png_dimensions(png: &[u8]) -> Option<(u32, u32)> {
    if png.len() < 24 || &png[12..16] != b"IHDR" {
        return None;
    }
    let read = |at: usize| u32::from_be_bytes([png[at], png[at + 1], png[at + 2], png[at + 3]]);
    let (width, height) = (read(16), read(20));
    (width > 0 && height > 0).then_some((width, height))
}
