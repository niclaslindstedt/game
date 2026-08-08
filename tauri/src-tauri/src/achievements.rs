// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! ACHIEVEMENTS on Steam — the [`AchievementsProvider`] implementation, and the
//! peer of `electron/src/achievements-steam.ts`.
//!
//! The web side speaks PERCENT for every badge (0…100), because Game Center
//! does. Steam does not: `SetAchievement` is a switch with no partial state, so
//! the mapping is simply **100 unlocks, anything less is not reported**. That is
//! a faithful translation rather than a lossy one, and the reason is the ledger
//! rule the whole feature rests on: the game's shelf is the truth and the
//! platform is a one-way copy, so a badge the player has not earned has nothing
//! to say to Steam yet.
//!
//! (Steam CAN draw a progress bar, via an indicator stat configured per
//! achievement in the partner site. That is portal configuration this game does
//! not have and cannot invent from here — every badge would need its own stat
//! declared before a single write would land. It is a clean follow-up once the
//! achievement rows exist in the portal at all; until then reporting only
//! completions is correct, not a shortcut.)
//!
//! The id is the identity function, exactly as on Game Center: Steam lets the
//! developer choose each achievement's API name, so the game's own badge id IS
//! the Steam id and both sides read the same names.
//!
//! **`show` opens the overlay's ACHIEVEMENTS dialog exactly as the Electron peer
//! does — on a launch that HAS an overlay.** This shell earns one by giving
//! Valve's injected library a surface of its own to draw on
//! ([`adastrail_shell::steam::overlay_support`], [`crate::overlay`]), which is a
//! per-launch and per-platform fact rather than a build-wide one. So the call is
//! made only when the overlay is genuinely loaded, and the row answers false
//! otherwise: reporting success for a board that never appeared would be worse
//! than the row staying shut.

use adastrail_shell::achievements_provider::{
    AchievementEntry, AchievementsPlayer, AchievementsProvider,
};
use adastrail_shell::output;

use crate::steam::{overlay_loaded, steam_client, steam_player_id, steam_player_name};

/// A badge counts as earned at this percentage — the only value Steam can
/// represent.
const EARNED_PERCENT: f64 = 100.0;

/// The overlay page the ACHIEVEMENTS row would open. Steam names its dialogs
/// with strings rather than an enum in this binding.
const OVERLAY_DIALOG_ACHIEVEMENTS: &str = "achievements";

/// Steam's achievement shelf, as the bridge above it sees it.
pub struct SteamAchievements;

impl AchievementsProvider for SteamAchievements {
    fn id(&self) -> &'static str {
        "steam"
    }

    fn is_available(&self) -> bool {
        steam_client().is_some()
    }

    fn identify(&self) -> Option<AchievementsPlayer> {
        Some(AchievementsPlayer {
            id: steam_player_id()?,
            name: steam_player_name().unwrap_or_default(),
        })
    }

    fn report(&self, entries: &[AchievementEntry]) -> bool {
        let Some(client) = steam_client() else {
            return false;
        };
        let stats = client.user_stats();
        let earned = entries
            .iter()
            .filter(|entry| entry.percent >= EARNED_PERCENT);

        let mut unlocked = 0usize;
        let mut refused = 0usize;
        for entry in earned {
            let achievement = stats.achievement(&entry.id);
            // Skip what Steam already holds. Not for correctness — setting one
            // twice is harmless — but because an unlock is a USER-VISIBLE event,
            // and re-asserting the whole earned shelf on every sync is how a
            // player ends up watching forty toasts scroll past on launch.
            if achievement.get() == Ok(true) {
                continue;
            }
            match achievement.set() {
                Ok(()) => unlocked += 1,
                // The one failure that matters: an API name the portal has never
                // heard of. Counted rather than fatal, because the rest of the
                // batch is still worth storing.
                Err(()) => {
                    refused += 1;
                    output::warn(&format!(
                        "steam achievements: Steam does not know a badge called {} — \
                         it needs an achievement row in the partner site",
                        entry.id
                    ));
                }
            }
        }
        if unlocked == 0 {
            // Nothing changed. That is a DELIVERED batch, not a failed one — the
            // web side keeps a refused batch pending, and a shelf that is
            // already mirrored would otherwise be re-sent forever.
            return refused == 0;
        }
        // Flush. `set` only writes Steam's in-memory copy; `store_stats` is what
        // sends the batch to the server and raises the player's toasts.
        if stats.store_stats().is_err() {
            output::warn(
                "steam achievements: the unlocks could not be stored — they will be re-sent",
            );
            return false;
        }
        refused == 0
    }

    fn show(&self) -> bool {
        let Some(client) = steam_client() else {
            return false;
        };
        // See the module header: no overlay, no board, and no pretending.
        if !overlay_loaded() {
            output::info(
                "steam achievements: no overlay in this process, so there is no board to open \
                 (see tauri/README.md)",
            );
            return false;
        }
        client
            .friends()
            .activate_game_overlay(OVERLAY_DIALOG_ACHIEVEMENTS);
        true
    }

    fn platform_id(&self, badge_id: &str) -> Option<String> {
        // Identity — see the header. Guarded only against the empty string,
        // which is not a name Steam could ever match.
        (!badge_id.is_empty()).then(|| badge_id.to_string())
    }
}

/// The achievements provider for this shell, or `None` where there is none.
///
/// `None` is a normal state: a build run outside Steam reports achievements as
/// local-only and the game's own shelf keeps every badge, exactly as it does in
/// a browser.
pub fn achievements_provider() -> Option<Box<dyn AchievementsProvider>> {
    steam_client().map(|_| Box::new(SteamAchievements) as Box<dyn AchievementsProvider>)
}
