// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! THE PLATFORM SEAM BEHIND SCREENSHOTS — where a picture the game took goes
//! INTO STEAM'S OWN library, the place a Steam player expects to find one
//! (Steam → View → Screenshots, and from there onto their profile, a friend's
//! chat, or the Community hub).
//!
//! **This is the seam that INVERTED on the way from Electron, and it is the
//! clearest single argument for the Rust binding.** The Electron peer
//! (`electron/src/screenshots-provider.ts`) returns null and gives two reasons.
//! Both flipped:
//!
//!  1. **The binding can now.** `steamworks` 0.13 binds ISteamScreenshots —
//!     `add_screenshot_to_library`, `hook_screenshots`, `trigger_screenshot`.
//!     `steamworks.js` binds none of it. The gap Electron's seam calls "small"
//!     is the one this shell can actually close.
//!  2. **Steam is NO LONGER already doing it.** That is the half worth being
//!     careful about. Electron's argument for not needing the API is that the
//!     overlay it injects hooks the presented frame and Steam's own screenshot
//!     key files a copy with the game uninvolved. **There is no overlay on this
//!     shell** ([`crate::steam::overlay_support`]) — so on a Tauri build, F12
//!     reaches the page and nothing else happens. A player who took a picture in
//!     the game would find it in the game's gallery and on disk, and NOT in
//!     their Steam library, which on a Steam build reads as the feature being
//!     broken.
//!
//! So the two shells reach opposite conclusions from the same principle, and
//! both are right: the picture should end up where the player expects it, and
//! what puts it there differs. On Electron that is Valve's overlay; here it is
//! this seam, and `add_screenshot_to_library` is the call that closes the loop.
//!
//! **`hook_screenshots` remains the one call we would least want**, exactly as
//! the Electron seam argues. It takes the screenshot key AWAY from Steam and
//! makes the game responsible for answering it. That is the wrong trade where
//! the overlay works, and here it is not even available to trade — there is no
//! overlay key to hook. The library add is the whole of what this shell wants.

use std::path::Path;

/// Somewhere a picture can be filed that is not just a folder.
pub trait ScreenshotLibrary: Send + Sync {
    /// Which platform library answered — labels the gallery's status line.
    fn id(&self) -> &'static str;
    /// Put this PNG in the platform's library, by path.
    ///
    /// By PATH rather than by buffer, which is the shape difference from the
    /// Electron seam and follows the API: Steam's own call takes a file it can
    /// read, so the bridge writes the player's copy first and hands the library
    /// the same file rather than a second copy of the bytes.
    ///
    /// Returns false when the platform refused it — the caller still has its own
    /// on-disk copy either way, so this is never fatal.
    fn add(&self, path: &Path, width: u32, height: u32) -> bool;
}
