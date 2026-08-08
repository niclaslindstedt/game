// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! STEAM WORKSHOP — where a player's mods come from, and where an author's
//! goes. The peer of `electron/src/workshop.ts`, and the seam's third file in
//! the same shape as cloud save's and the achievements': a bridge above it
//! moves JSON, this declares what a mod portal has to be, and only
//! `src-tauri/src/workshop.rs` knows Steam exists.
//!
//! That is what keeps the web side from ever learning which platform answered —
//! and why the day a second storefront grows a mod portal, it is one new file
//! there rather than a change to the protocol.
//!
//! Two directions, and they are asymmetric on purpose:
//!
//!   SUBSCRIBE  Steam does all of it. The client downloads a subscribed item
//!              into its own folder and we ask where that folder is. There is
//!              no install step of ours to get wrong, and no unpacking — which
//!              also means no archive parser pointed at a stranger's file.
//!   PUBLISH    We hand Steam a FOLDER and it uploads the contents. So a mod is
//!              published exactly as authored: the YAML a human wrote, not the
//!              compiled bundle. The subscriber's game compiles it locally, and
//!              a mod on the Workshop stays readable, forkable and diffable the
//!              way the game's own content is.
//!
//! The whole seam degrades to "no Workshop" without Steam: the provider is
//! `None` on a developer machine, in CI, and on a build launched outside the
//! client, and every path here answers an empty list or a refusal rather than
//! an error. A game with no mods is the game.

/// A mod as Steam knows it: an id and a folder on disk.
///
/// Nothing is read or validated here — that is the compiler's job, one layer
/// up.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkshopItem {
    /// The published file id, as a string: it is a uint64 and JSON has no such
    /// number, so it travels as text the whole way to the page and back.
    pub item_id: String,
    /// Where the client put it.
    pub folder: String,
    /// Steam has a newer version than the one on disk.
    pub needs_update: bool,
}

/// What a publish needs to know about the mod, read off its compiled bundle.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PublishRequest {
    /// The item to update, or `None` to create one.
    pub item_id: Option<String>,
    /// The mod's display name.
    pub title: String,
    /// Its description.
    pub description: String,
    /// What changed, as the player typed it.
    pub change_note: String,
    /// The AUTHORED folder, not a compiled bundle — see the module header.
    pub folder: String,
    /// A thumbnail, when the mod ships one.
    pub preview: Option<String>,
    /// The Workshop tags, from the mod's own kind.
    pub tags: Vec<String>,
}

/// Which Workshop tag a mod's `kind` earns.
///
/// Two, because two is what the Workshop's own filter is worth: a player
/// browsing wants to know whether this replaces the game or adds to it, and any
/// finer taxonomy is a set of tags nobody selects.
pub fn tag_for_kind(kind: &str) -> &'static str {
    if kind == "conversion" {
        "Total Conversion"
    } else {
        "Addon"
    }
}

/// Steam's own item-state bits, as much of them as this shell reads.
pub mod state {
    /// The client has finished downloading it.
    pub const INSTALLED: u32 = 4;
    /// …and a newer version exists.
    pub const NEEDS_UPDATE: u32 = 8;
}

/// What to do with one subscribed item, from its state bits.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ItemDisposition {
    /// It is on disk and ready to compile.
    Ready {
        /// Whether Steam has a newer version.
        needs_update: bool,
    },
    /// The client has not finished downloading it. Kick the download along and
    /// leave it out of this pass — the next launch (or the next refresh) sees
    /// it. A subscription mid-download is not a failure and not a mod.
    Downloading,
}

/// Read one item's state bits.
pub fn disposition(bits: u32) -> ItemDisposition {
    if bits & state::INSTALLED == 0 {
        return ItemDisposition::Downloading;
    }
    ItemDisposition::Ready {
        needs_update: bits & state::NEEDS_UPDATE != 0,
    }
}

/// What a publish attempt answered with, before the bridge dresses it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PublishAnswer {
    /// It went up.
    Ok {
        /// The item it went up as.
        item_id: String,
        /// Whether the author still has to accept the Workshop terms.
        needs_to_accept_agreement: bool,
    },
    /// It did not.
    Failed {
        /// What Steam said.
        detail: String,
    },
}

/// Somewhere a mod can be subscribed to and published — the platform seam.
///
/// Synchronous for the reason the cloud seam is: Steam's calls return on the
/// calling thread and this shell has no async runtime to promise into. The one
/// exception on the real client is the UPLOAD, which the implementation blocks
/// on inside `src-tauri/src/workshop.rs` — a publish is already a long press on
/// a button the page has a ten-minute timeout for.
pub trait WorkshopProvider: Send + Sync {
    /// Every installed, subscribed item.
    fn subscribed(&self) -> Vec<WorkshopItem>;
    /// Publish (or update) one folder.
    fn publish(&self, request: &PublishRequest) -> PublishAnswer;
}

/// The line the shell logs when a mod could not be read at all.
///
/// The compiler THROWING rather than reporting is a bug in US, not in the mod —
/// but it must still not take the list down with it, so the row appears with
/// this as its error.
pub fn compiler_failed(key: &str, detail: &str) -> String {
    format!("mods: {key} could not be read — {detail}")
}
