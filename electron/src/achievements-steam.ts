// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// ACHIEVEMENTS on Steam — the `AchievementsProvider` implementation, the peer
// of native/src/achievements-gamecenter.ts.
//
// The web side speaks PERCENT for every badge (0…100), because Game Center
// does. Steam does not: `ISteamUserStats::SetAchievement` is a switch with no
// partial state, so the mapping is simply **100 unlocks, anything less is not
// reported**. That is a faithful translation rather than a lossy one, and the
// reason is the ledger rule the whole feature rests on: the game's shelf is the
// truth and the platform is a one-way copy, so a badge the player has not
// earned has nothing to say to Steam yet.
//
// (Steam CAN draw a progress bar, via an indicator stat configured per
// achievement in the partner site. That is portal configuration this game does
// not have and cannot invent from here — every badge would need its own stat
// declared before a single write would land. It is a clean follow-up once the
// achievement rows exist in the portal at all; until then reporting only
// completions is correct, not a shortcut.)
//
// The id is the identity function, exactly as on Game Center: Steam lets the
// developer choose each achievement's API name, so the game's own badge id IS
// the Steam id and both sides read the same names. (This is what makes
// `platformId` trivial here and opaque on Play — see the seam's own note.)

import { output } from "./output";
import {
  OVERLAY_DIALOG_ACHIEVEMENTS,
  steamClient,
  steamPlayerId,
  steamPlayerName,
} from "./steam";
import type {
  AchievementEntry,
  AchievementsPlayer,
  AchievementsProvider,
} from "./achievements-provider";

/** A badge counts as earned at this percentage — the only value Steam can
 * represent. */
const EARNED_PERCENT = 100;

export function steamAchievements(): AchievementsProvider {
  return {
    id: "steam",

    async isAvailable(): Promise<boolean> {
      return steamClient() !== null;
    },

    async identify(): Promise<AchievementsPlayer | null> {
      const id = steamPlayerId();
      if (!id) return null;
      return { id, name: steamPlayerName() ?? "" };
    },

    async report(entries: readonly AchievementEntry[]): Promise<boolean> {
      const client = steamClient();
      if (!client) return false;
      const earned = entries.filter((entry) => entry.percent >= EARNED_PERCENT);
      // A batch of nothing but partial progress is DELIVERED, not failed: there
      // is genuinely nothing for Steam to store, and reporting failure would
      // leave the web side retrying that batch forever (it keeps a refused
      // batch pending by design).
      if (earned.length === 0) return true;
      try {
        for (const entry of earned) {
          // Skip what Steam already holds. Not for correctness — `activate` is
          // idempotent — but because an unlock is a USER-VISIBLE event, and
          // re-asserting the whole earned shelf on every sync is how a player
          // ends up watching forty toasts scroll past on launch.
          if (client.achievement.isActivated(entry.id)) continue;
          client.achievement.activate(entry.id);
        }
        // Flush. `activate` stores on our behalf in the current binding, but
        // StoreStats is the documented commit point for the whole batch and a
        // second call is a no-op — cheap insurance against a badge that lives
        // only in memory until the process exits.
        client.stats.store();
        return true;
      } catch (err) {
        output.warn(`steam achievements: report failed — ${describe(err)}`);
        return false;
      }
    },

    async show(): Promise<boolean> {
      const client = steamClient();
      if (!client) return false;
      try {
        client.overlay.activateDialog(OVERLAY_DIALOG_ACHIEVEMENTS);
        return true;
      } catch (err) {
        output.warn(`steam achievements: overlay failed — ${describe(err)}`);
        return false;
      }
    },

    platformId(badgeId: string): string | null {
      // Identity — see the header. Guarded only against the empty string, which
      // is not a name Steam could ever match.
      return badgeId.length > 0 ? badgeId : null;
    },
  };
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
