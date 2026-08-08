// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! MODS' SHELL half — the peer of `electron/src/mods.ts`: the thing that joins
//! the Workshop ([`crate::workshop`]) to the compiler (`mod/tools/build.mjs`)
//! and answers the page's bridge (`pwa/src/app/mods-bridge.ts`). Keep the
//! protocol here in step with the one documented there.
//!
//! It does REAL WORK rather than merely forwarding JSON, because **compiling is
//! the security boundary**: a mod's YAML is read, parsed and validated outside
//! the page, and only plain checked JSON crosses to it. The page has no
//! filesystem, no YAML parser, and no way to run anything a mod shipped, and
//! that stays true precisely because this seam does not hand it anything but
//! data.
//!
//! **THE ONE DIFFERENCE FROM ELECTRON IS WHOSE PROCESS COMPILES.** Electron's
//! main process is Node, so it `import()`s the compiler. This shell is Rust, so
//! it SPAWNS it ([`crate::runtime`]) and reads a JSON document back — which is
//! the mirror image of Electron's `resources.ts` problem and, incidentally, a
//! stronger boundary: a mod that makes the compiler throw takes down a child
//! process rather than a thread of the shell's.
//!
//! THREE SOURCES, one list:
//!
//!   WORKSHOP  what the player subscribed to. Steam owns the download and the
//!             folder; we ask where it is.
//!   LOCAL     `<userData>/mods/<name>/`, for the mod the player is WRITING.
//!             Without it, authoring means publishing to the Workshop to test —
//!             a terrible loop that litters the Workshop with drafts. It is
//!             also the only source PUBLISH is offered for.
//!   PORTABLE  `mods/` BESIDE THE GAME, for a mod somebody was sent. Windows
//!             and Linux only — see [`portable_mods_path`].
//!
//! A mod that fails to compile is NOT dropped: it crosses with its errors, so
//! the MODS screen can tell the player why their subscription is not playable.
//! A silent omission would leave them with an empty list and no way to find out.

use std::path::{Path, PathBuf};

use serde_json::{json, Value};

/// One parsed message from the page (`__gisMods` already checked).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ModsRequest {
    /// Which of the four the page asked for, verbatim.
    pub action: String,
    /// The page's own correlation id.
    pub request_id: u64,
    /// `publish`: which folder. The ONE path the page hands inward, and
    /// therefore the one that gets checked — see [`is_local_mod`].
    pub folder: Option<String>,
    /// `publish`: what changed.
    pub change_note: String,
    /// `reveal`: which of OUR folders. A NAME, never a path.
    pub which: RevealTarget,
}

/// Which of the game's own folders a `reveal` names.
///
/// A closed set rather than a path, and that is the whole safety argument: the
/// page picking from two names is what keeps "open this in the file manager"
/// from becoming "open anything on this disk in the file manager".
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RevealTarget {
    /// The authoring folder, under the app's user data.
    Local,
    /// `mods/` beside the game, where the platform has one.
    Portable,
}

/// Read one mods message off the shell channel.
pub fn parse(message: &Value) -> ModsRequest {
    ModsRequest {
        action: crate::bridge::action(message),
        request_id: crate::bridge::request_id(message),
        folder: message
            .get("folder")
            .and_then(Value::as_str)
            .filter(|folder| !folder.is_empty())
            .map(str::to_string),
        change_note: message
            .get("changeNote")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        which: match message.get("which").and_then(Value::as_str) {
            Some("portable") => RevealTarget::Portable,
            _ => RevealTarget::Local,
        },
    }
}

/// Where a mod came from, and what may be done with it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ModSource {
    /// A subscription — somebody else's to update.
    Workshop,
    /// The player's own authoring folder — the only publishable one.
    Local,
    /// A folder or a `.zip` somebody was sent. Played like any other, never
    /// published, because what is published is what somebody AUTHORED.
    Portable,
}

impl ModSource {
    /// The word the page reads.
    pub fn as_str(self) -> &'static str {
        match self {
            ModSource::Workshop => "workshop",
            ModSource::Local => "local",
            ModSource::Portable => "portable",
        }
    }
}

/// One mod as the page sees it.
#[derive(Debug, Clone, PartialEq)]
pub struct InstalledMod {
    /// The Workshop item id, or `<source>:<folder name>`.
    pub key: String,
    /// Absolute path, for PUBLISH. Never read by the page.
    pub folder: String,
    /// Where it came from.
    pub source: ModSource,
    /// The compiled mod, or null when it did not compile.
    pub bundle: Value,
    /// Why it did not compile. Empty when it did.
    pub errors: Vec<String>,
    /// Steam has a newer version than the one on disk.
    pub needs_update: bool,
}

impl InstalledMod {
    /// The row, as the page's `InstalledMod`.
    pub fn to_json(&self) -> Value {
        json!({
            "key": self.key,
            "folder": self.folder,
            "source": self.source.as_str(),
            "bundle": self.bundle,
            "errors": self.errors,
            "needsUpdate": self.needs_update,
        })
    }
}

/// `list`: every mod on this machine, compiled, and the folders they came from.
pub fn list_event(
    request_id: u64,
    mods: &[InstalledMod],
    local: &Path,
    portable: Option<&Path>,
) -> Value {
    json!({
        "event": "list",
        "requestId": request_id,
        "ok": true,
        "mods": mods.iter().map(InstalledMod::to_json).collect::<Vec<_>>(),
        "folders": {
            "local": local.display().to_string(),
            "portable": portable.map(|path| json!(path.display().to_string()))
                .unwrap_or(Value::Null),
        },
    })
}

/// What a publish attempt answers with.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PublishOutcome {
    /// It went up.
    Published {
        /// The Workshop item id, as a string: it is a uint64 and JSON has no
        /// such number, so it travels as text the whole way to the page.
        item_id: String,
        /// Steam refuses to SHOW an item until its author has accepted the
        /// Workshop terms in a browser — and the item exists in the meantime,
        /// invisible. Its own outcome because it is the one failure the player
        /// must go and DO something about.
        needs_to_accept_agreement: bool,
    },
    /// It did not.
    Refused {
        /// `no-steam`, `not-a-mod` or `error`.
        reason: &'static str,
        /// More of it, when there is more.
        detail: Option<String>,
    },
}

/// `publish`: the outcome, as the page's `PublishResult`.
pub fn publish_event(request_id: u64, outcome: &PublishOutcome) -> Value {
    match outcome {
        PublishOutcome::Published {
            item_id,
            needs_to_accept_agreement,
        } => json!({
            "event": "publish",
            "requestId": request_id,
            "ok": true,
            "itemId": item_id,
            "needsToAcceptAgreement": needs_to_accept_agreement,
        }),
        PublishOutcome::Refused { reason, detail } => {
            let mut event = json!({
                "event": "publish",
                "requestId": request_id,
                "ok": false,
                "reason": reason,
            });
            if let (Some(detail), Some(object)) = (detail, event.as_object_mut()) {
                object.insert("detail".to_string(), json!(detail));
            }
            event
        }
    }
}

/// The game's Workshop hub in the Steam client — where a joiner refused for a
/// missing mod goes to get it.
///
/// Built from OUR OWN app id and never from anything the page sent: the one
/// thing this action must not become is an open-arbitrary-URL channel.
pub fn workshop_url(app_id: u32) -> String {
    format!("steam://url/SteamWorkshopPage/{app_id}")
}

/// The folder a player drops a mod they are writing into.
pub fn local_mods_dir(user_data: &Path) -> PathBuf {
    user_data.join("mods")
}

/// Where an archive is unpacked to be compiled.
///
/// Deliberately NOT inside [`local_mods_dir`]: a mod that arrived as a zip is
/// not one the player is authoring, and the publish containment check is a
/// prefix of that folder.
pub fn archive_cache_dir(user_data: &Path) -> PathBuf {
    user_data.join("mod-archives")
}

/// How the platform is laid out, for [`portable_mods_path`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PortableEnv {
    /// Whether this is an installed copy rather than a checkout.
    pub packaged: bool,
    /// `windows`, `macos`, or anything else.
    pub platform: String,
    /// Where the executable is, when packaged.
    pub exe_dir: PathBuf,
    /// The working directory, for a checkout.
    pub cwd: PathBuf,
}

/// `mods/` BESIDE THE GAME — the folder a player can find without being told,
/// where the platform has one.
///
/// The application-data path [`local_mods_dir`] answers is correct and
/// unguessable: spelled differently on three platforms and hidden on two. That
/// is fine for the mod somebody is WRITING, who typed a command to be told
/// where it is, and it is the wrong answer for "a friend sent me this". On
/// Windows and Linux the install folder is the answer — the player owns it, it
/// is one place, and it travels with a copied install.
///
/// **macOS has no such folder, on purpose.** An installed app lives in
/// `/Applications`, so "beside the app" is a system directory the player does
/// not own and should not be littered with a game's data — and the inside of the
/// bundle is worse than that: adding a file there breaks the code signature the
/// app is notarized under. macOS keeps user data in Application Support and this
/// follows the platform rather than fighting it.
///
/// Unpackaged (a checkout, `cargo run`) it is the working directory on every
/// platform — that is a developer's own tree, not an installed app.
pub fn portable_mods_path(env: &PortableEnv) -> Option<PathBuf> {
    if !env.packaged {
        return Some(env.cwd.join("mods"));
    }
    if env.platform == "macos" {
        return None;
    }
    Some(env.exe_dir.join("mods"))
}

/// Is this folder inside the player's own mods directory?
///
/// Publishing is an upload, and a folder outside that directory is not
/// something the page has any business naming. Compared as a path PREFIX with a
/// separator, so `…/mods-elsewhere` cannot pass for `…/mods`, and after
/// normalizing away every `.` and `..` so nothing can climb out of it.
pub fn is_local_mod(folder: &Path, local_root: &Path) -> bool {
    let root = normalize(local_root);
    let target = normalize(folder);
    target.starts_with(&root) && target != root
}

/// A path with every `.` dropped and every `..` resolved against what came
/// before it.
///
/// Lexical rather than `canonicalize`, deliberately: the real thing touches the
/// filesystem, follows symlinks and FAILS for a path that does not exist yet —
/// so a containment check built on it would answer "not contained" for a folder
/// the player is about to create, and would answer differently depending on
/// whether a link happened to be there.
fn normalize(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for part in path.components() {
        match part {
            std::path::Component::CurDir => {}
            std::path::Component::ParentDir => {
                out.pop();
            }
            other => out.push(other.as_os_str()),
        }
    }
    out
}

/// The cache key for one archive: its size and modification time.
///
/// Re-extracted when the FILE changes rather than on every launch, so replacing
/// a zip with a newer one is picked up on the next list and a launch that
/// changed nothing pays a stat instead of an unpack.
pub fn archive_stamp(size: u64, modified_ms: u64) -> String {
    format!("{size}-{modified_ms}")
}

/// A cache folder name that is a name and nothing else — the archive's own stem
/// is a filename the player chose, and it is about to be a path.
pub fn safe_slug(name: &str) -> String {
    let mut slug = String::with_capacity(name.len());
    let mut last_dash = false;
    for ch in name.chars() {
        if ch.is_ascii_alphanumeric() || ch == '.' || ch == '_' || ch == '-' {
            slug.push(ch);
            last_dash = false;
        } else if !last_dash {
            slug.push('-');
            last_dash = true;
        }
    }
    let slug: String = slug.chars().take(64).collect();
    let slug = slug.trim_start_matches(['.', '-']).to_string();
    if slug.is_empty() {
        "archive".to_string()
    } else {
        slug
    }
}

/// The key a row is listed under.
pub fn folder_key(source: ModSource, name: &str) -> String {
    format!("{}:{name}", source.as_str())
}

/// The file the Workshop item id is remembered in, BESIDE the mod.
///
/// It belongs to the mod rather than to the game's settings: copy the folder to
/// another machine and publishing from there still updates the same item,
/// rather than minting a second one that splits the mod's subscribers and
/// ratings in two.
pub const ITEM_ID_FILE: &str = ".workshop-id";

/// The remembered id, if the file holds one and it is a number.
pub fn read_item_id(contents: &str) -> Option<String> {
    let trimmed = contents.trim();
    (!trimmed.is_empty() && trimmed.chars().all(|ch| ch.is_ascii_digit()))
        .then(|| trimmed.to_string())
}
