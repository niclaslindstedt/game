// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! THE PLATFORM SEAM BEHIND CLOUD SAVE — the peer of
//! `electron/src/cloud-provider.ts`, so the bridge above it
//! ([`crate::cloud_save`]) is the same dumb string-mover on both shells.
//!
//! Today: Steam, implemented in `src-tauri/src/cloud.rs`. A second desktop
//! storefront (GOG Galaxy, Epic) would be one new file there and one line at the
//! call site, exactly as Play Games is on the mobile side.
//!
//! **The one member that did not travel is `subscribe`, and its absence is the
//! finding rather than an omission.** The mobile seam has it because iCloud
//! pushes a change to a running app; Steam Cloud does not — it reconciles at
//! launch and at exit, so there is nothing to notify a running game about. The
//! Electron peer keeps the member and its Steam implementation returns a no-op
//! unsubscribe, which is a member that exists to do nothing on the only platform
//! that implements it. Here it is simply not declared, and the `changed` event
//! is never emitted; the game's own pull-at-boot and pull-on-focus carry the
//! reconciliation, and the merge is idempotent so an extra pull is free.
//!
//! **`Missing` and `Failed` are not the same answer**, and keeping them apart is
//! the whole reason [`CloudRead`] is an enum rather than an `Option`. Collapsing
//! them would let the game treat an unreachable cloud as a fresh account and
//! push a near-empty save over a roster it never saw — the one outcome cloud
//! save exists to prevent.

/// The iCloud / Steam Cloud / Saved Games key the blob lives under.
///
/// Versioned so a future format that can't be merged by old builds can move to
/// its own key rather than being mis-read by them. The same string on every
/// shell — the payload is the game's, and a player's roster has to be findable
/// from whichever binary they launch next.
pub const SAVE_KEY: &str = "gis-save-v1";

/// The signed-in platform player, shown by the game as "SIGNED IN AS …".
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CloudPlayer {
    /// The platform's own id for them. Never used to key a save.
    pub id: String,
    /// Their display name, which may legitimately be empty.
    pub name: String,
}

/// What came back from a read.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CloudRead {
    /// The cloud holds nothing under this key yet — a fresh account.
    Missing,
    /// The READ FAILED. Not the same as [`CloudRead::Missing`]; see the module
    /// header for what confusing the two costs.
    Failed,
    /// The stored blob.
    Blob(String),
}

/// Somewhere one opaque string can be kept for a player across their machines.
///
/// Every method is synchronous, which is the one shape difference from the
/// TypeScript peers and is a platform fact rather than a judgement: Steam's
/// cloud calls return on the calling thread, and the shell has no async runtime
/// to promise into. The page's protocol is unchanged — a request still arrives,
/// an event still goes back.
pub trait CloudProvider: Send + Sync {
    /// Which platform cloud answered — labels the game's status line.
    fn id(&self) -> &'static str;
    /// A cloud is reachable and writable for this player right now.
    fn is_available(&self) -> bool;
    /// The platform player, or `None` when there is none (or they declined).
    fn identify(&self) -> Option<CloudPlayer>;
    /// The stored blob — see [`CloudRead`] for what the three answers mean.
    fn load(&self, key: &str) -> CloudRead;
    /// Write the blob; false when the provider refused it.
    fn save(&self, key: &str, data: &str) -> bool;
    /// The provider's per-value ceiling in bytes.
    fn max_bytes(&self) -> usize;
}
