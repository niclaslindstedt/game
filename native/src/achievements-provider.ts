// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The platform seam behind ACHIEVEMENTS, the exact peer of cloud save's
// (./cloud-provider.ts). The bridge (./achievements.ts) and the whole web side
// know only this interface, so a second platform is ONE new file.
//
// Today: Game Center (./achievements-gamecenter.ts).
//
// Next: Google Play Games. The mapping is one-to-one — `achievements-play.ts`
// written against the same five members — with ONE wrinkle that is the reason
// `platformId` exists at all:
//
//   isAvailable  the player is signed into Play Games Services
//   identify     the signed-in Play Games player (id + display name)
//   report       Play Games has `unlock` (one-shot) and `setSteps` (an
//                incremental achievement's step count). Our web side speaks in
//                PERCENT, so an incremental maps as round(percent/100 * steps)
//                and 100 unlocks
//   show         Play Games' own achievements activity
//   platformId   Play Console GENERATES an opaque id per achievement
//                (`CgkI…`), which the game cannot choose — so the provider,
//                not the web side, owns the badge-id → platform-id mapping.
//                Game Center lets us pick the id, so there it is the identity
//                function and the two sides read the same names
//
// The provider must never throw: every method degrades to
// unavailable/false so a shell missing the native module still boots.

import { Platform } from "react-native";

import { gameCenterAchievements } from "./achievements-gamecenter";

/** Which platform service answered — labels the game's status line. */
export type AchievementsProviderId = "game-center" | "play-games";

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
  /** This platform's id for one of our badges; null drops it (a badge with no
   * entry configured in the portal). */
  platformId(badgeId: string): string | null;
};

/**
 * The provider for this platform, or null where there is none yet. Android
 * returns null today, so an Android build reports achievements as local-only
 * and the game's own shelf keeps every badge — exactly what a build without the
 * native module does on iOS.
 */
export function achievementsProvider(): AchievementsProvider | null {
  if (Platform.OS === "ios") return gameCenterAchievements();
  return null;
}
