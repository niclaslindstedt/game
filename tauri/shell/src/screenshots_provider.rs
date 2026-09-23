// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! THE PLATFORM SEAM BEHIND SCREENSHOTS — where a picture the game took goes
//! INTO STEAM'S OWN library, the place a Steam player expects to find one
//! (Steam → View → Screenshots, and from there onto their profile, a friend's
//! chat, or the Community hub).
//!
//! **Two facts make this seam necessary:**
//!
//!  1. **The binding can.** `steamworks` 0.13 binds ISteamScreenshots —
//!     `add_screenshot_to_library`, `hook_screenshots`, `trigger_screenshot`.
//!  2. **Steam does NOT already do it.** That is the half worth being careful
//!     about. In a shell whose own renderer carries the overlay, Steam's
//!     screenshot key files a copy with the game uninvolved. **Steam's key
//!     photographs nothing on this shell**, and that is true even where the overlay itself
//!     works: what this shell hands the hook is a DECOY swap chain
//!     ([`crate::steam::overlay_support`]) whose frames are transparent by
//!     construction, so a key press would file an empty picture — and on the two
//!     desktops with no decoy, F12 reaches the page and nothing else happens at
//!     all. Either way a player who took a picture in the game would find it in
//!     the game's gallery and on disk, and NOT in their Steam library, which on
//!     a Steam build reads as the feature being broken.
//!
//! The principle is that the picture should end up where the player expects
//! it; here this seam is what puts it there, and `add_screenshot_to_library` is
//! the call that closes the loop.
//!
//! **`hook_screenshots` remains the one call we would least want.** It takes the screenshot key AWAY from Steam and
//! makes the game responsible for answering it. That is the wrong trade where
//! the overlay's key photographs the game — and here there is nothing to trade
//! for, since the frame it would photograph is the decoy's empty one. The
//! library add is the whole of what this shell wants.

use std::path::Path;

/// Somewhere a picture can be filed that is not just a folder.
pub trait ScreenshotLibrary: Send + Sync {
    /// Which platform library answered — labels the gallery's status line.
    fn id(&self) -> &'static str;
    /// Put this PNG in the platform's library, by path.
    ///
    /// By PATH rather than by buffer, which follows the API: Steam's own call takes a file it can
    /// read, so the bridge writes the player's copy first and hands the library
    /// the same file rather than a second copy of the bytes.
    ///
    /// Returns false when the platform refused it — the caller still has its own
    /// on-disk copy either way, so this is never fatal.
    fn add(&self, path: &Path, width: u32, height: u32) -> bool;
}
