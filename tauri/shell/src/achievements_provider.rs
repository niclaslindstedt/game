// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! THE PLATFORM SEAM BEHIND ACHIEVEMENTS — the peer of
//! `electron/src/achievements-provider.ts`, so the bridge above it
//! ([`crate::achievements`]) is the same dumb forwarder on both shells.
//!
//! Today: Steam, implemented in `src-tauri/src/achievements.rs`.
//!
//! See [`crate::cloud_provider`] for why these traits are declared per shell
//! rather than shared across the trees: the PROTOCOL is what must not drift, and
//! that is pinned by the web side, which every shell answers.

/// The signed-in platform player, shown by the game as "SIGNED IN AS …".
pub type AchievementsPlayer = crate::cloud_provider::CloudPlayer;

/// One badge's progress: the game's OWN badge id, and 0…100 (100 = earned).
#[derive(Debug, Clone, PartialEq)]
pub struct AchievementEntry {
    /// The platform's id for the badge — already mapped through
    /// [`AchievementsProvider::platform_id`].
    pub id: String,
    /// 0…100, already clamped.
    pub percent: f64,
}

/// A place the game's badge shelf can be mirrored to.
pub trait AchievementsProvider: Send + Sync {
    /// Which platform service answered — labels the game's status line.
    fn id(&self) -> &'static str;
    /// A player is signed in, so reports will stick.
    fn is_available(&self) -> bool;
    /// The platform player, or `None` when there is none.
    fn identify(&self) -> Option<AchievementsPlayer>;
    /// Mirror a batch. False means "not taken" — the web side then keeps the
    /// batch pending and retries, rather than marking it delivered.
    fn report(&self, entries: &[AchievementEntry]) -> bool;
    /// Show the platform's own achievements board.
    fn show(&self) -> bool;
    /// This platform's id for one of our badges; `None` drops it.
    ///
    /// On Steam this is the identity function — the developer chooses each
    /// achievement's API name, so the game's own badge id IS the Steam id. It is
    /// a seam member anyway because it is opaque on Play, and because a shell
    /// that guessed an id would report a badge the portal has never heard of.
    fn platform_id(&self, badge_id: &str) -> Option<String>;
}
