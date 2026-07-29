// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The platform seam behind ACHIEVEMENTS on the desktop — the exact peer of
// native/src/achievements-provider.ts, so the bridge above it
// (./achievements.ts) is the same dumb forwarder on both shells.
//
// Today: Steam (./achievements-steam.ts).
//
// See ./cloud-provider.ts for why the interface is duplicated across the two
// trees rather than shared.

import { steamAchievements } from "./achievements-steam";
import { steamClient } from "./steam";

/** Which platform service answered — labels the game's status line. */
export type AchievementsProviderId = "steam";

/** The signed-in platform player, shown by the game as "SIGNED IN AS …". */
export type AchievementsPlayer = { id: string; name: string };

/** One badge's progress: the game's OWN badge id, and 0…100 (100 = earned). */
export type AchievementEntry = { id: string; percent: number };

export type AchievementsProvider = {
  id: AchievementsProviderId;
  /** A player is signed in, so reports will stick. */
  isAvailable(): Promise<boolean>;
  /** The platform player, or null when there is none (or they declined). */
  identify(): Promise<AchievementsPlayer | null>;
  /** Mirror a batch. False means "not taken" — the web side then keeps the
   * batch pending and retries, rather than marking it delivered. */
  report(entries: readonly AchievementEntry[]): Promise<boolean>;
  /** Show the platform's own achievements board. */
  show(): Promise<boolean>;
  /** This platform's id for one of our badges; null drops it. */
  platformId(badgeId: string): string | null;
};

/**
 * The provider for this shell, or null where there is none. Null is a normal
 * state: a build run outside Steam reports achievements as local-only and the
 * game's own shelf keeps every badge, exactly as it does in a browser.
 */
export function achievementsProvider(): AchievementsProvider | null {
  return steamClient() ? steamAchievements() : null;
}
