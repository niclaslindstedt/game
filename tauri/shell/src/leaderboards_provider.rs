// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! THE PLATFORM SEAM BEHIND LEADERBOARDS — the peer of
//! `electron/src/leaderboards-provider.ts`.
//!
//! **There is no Steam provider here either, and the reason has CHANGED — which
//! is a finding worth the paragraph.** The Electron seam gives two
//! independent reasons and says either alone would be enough. Exactly one of
//! them survived the move to Rust:
//!
//!  1. ~~**The binding cannot.**~~ It can. `steamworks` 0.13 binds the whole of
//!     ISteamUserStats' leaderboard surface — `find_leaderboard`,
//!     `find_or_create_leaderboard`, `upload_leaderboard_score`,
//!     `download_leaderboard_entries`, the sort methods and the display types.
//!     This is the one place the Rust binding is materially richer than
//!     `steamworks.js`, and it means the API gap Electron records is simply not
//!     a fact about this shell.
//!  2. **Steam has no board to open, and the game has none to draw.** This one
//!     stands, unchanged and on its own. The whole design of the game's
//!     leaderboards is that it ships NO board UI, because "the ranking, the
//!     player's rank, their friends and the time scopes are the platform's to
//!     draw" (AGENTS.md). That is true of Game Center, which has a full built-in
//!     board. It is NOT true of Steam: the overlay's dialogs are Friends,
//!     Community, Players, Settings, OfficialGameGroup, Stats and Achievements —
//!     there is no leaderboard page, and Steam games draw their own. **And on
//!     this shell there is no overlay at all** ([`crate::steam::overlay_support`]),
//!     so even the dialogs that do exist cannot be opened. A provider here would
//!     therefore publish scores into a board no player on this platform could
//!     ever look at.
//!
//! So the honest state is: **submitting is now possible and showing is not**,
//! and a provider that could do the first without the second would light up a
//! WORLD RANKINGS row that opens nothing. That is a worse answer than the row
//! staying hidden, which is what returning `None` gets — the seam's own idiom
//! for exactly this, already handled by the web side.
//!
//! **What it would take**, when it is worth doing: a board screen in the GAME
//! (`pwa/`), and then a provider here implementing the four members below. Note
//! that Steam scores are **int32** where Game Center's are int64 — so the
//! scale-from-format rule in `pwa/src/game/platform-leaderboards.ts` must be
//! re-checked per board before anything is published, or a lifetime-kills value
//! that outgrows 2^31 wraps into a negative rank.

/// One score to publish: the game's OWN board key, and the whole number the
/// board stores (already scaled — see `pwa/src/game/platform-leaderboards.ts`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScoreEntry {
    /// The platform's key for the board.
    pub key: String,
    /// The whole number the board stores.
    pub value: i64,
}

/// A place a score can be published and a ranking can be looked at.
pub trait LeaderboardsProvider: Send + Sync {
    /// Which platform service answered — labels the game's status line.
    fn id(&self) -> &'static str;
    /// A player is signed in, so submissions will stick.
    fn is_available(&self) -> bool;
    /// Publish a batch.
    fn submit(&self, entries: &[ScoreEntry]) -> bool;
    /// Open the platform's own board, or the whole list when given nothing.
    fn show(&self, key: Option<&str>) -> bool;
    /// This platform's key for one of our boards; `None` drops it.
    fn platform_id(&self, key: &str) -> Option<String>;
}

/// The provider for this shell. Always `None` today — see the module header.
///
/// The bridge above it ([`crate::leaderboards`]) is wired up regardless, so
/// adding a provider is one new file and one line here, with no protocol or
/// web-side change.
pub fn leaderboards_provider() -> Option<Box<dyn LeaderboardsProvider>> {
    None
}
