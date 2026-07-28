// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The platform seam behind LEADERBOARDS, the exact peer of the achievements'
// (./achievements-provider.ts) and cloud save's (./cloud-provider.ts). The
// bridge (./leaderboards.ts) and the whole web side know only this interface,
// so a second platform is ONE new file.
//
// Today: Game Center (./leaderboards-gamecenter.ts).
//
// Next: Google Play Games. The mapping is one-to-one — `leaderboards-play.ts`
// written against the same four members — with the same wrinkle that gives
// `platformId` its reason to exist:
//
//   isAvailable  the player is signed into Play Games Services
//   submit       `leaderboardsClient.submitScore(id, value)`. Play keeps the
//                best value per board exactly as Game Center does, so the
//                game's habit of publishing its whole slate at a natural
//                moment carries over untouched
//   show         `leaderboardsClient.getLeaderboardIntent(id?)`, started as an
//                activity — the platform draws the ranking either way
//   platformId   Play Console GENERATES an opaque id per board (`CgkI…`),
//                which the game cannot choose — so the provider, not the web
//                side, owns the board-key → platform-id mapping. Game Center
//                lets us pick the id, so there it is the identity function and
//                both sides read the same names
//
// The provider must never throw: every method degrades to unavailable/false so
// a shell missing the native module still boots.

import { Platform } from "react-native";

import { gameCenterLeaderboards } from "./leaderboards-gamecenter";

/** Which platform service answered — labels the game's status line. */
export type LeaderboardsProviderId = "game-center" | "play-games";

/** One score to publish: the game's OWN board key, and the whole number the
 * board stores (already scaled — see pwa/src/game/platform-leaderboards.ts). */
export type ScoreEntry = { key: string; value: number };

export type LeaderboardsProvider = {
  id: LeaderboardsProviderId;
  /** A player is signed in, so submissions will stick. */
  isAvailable(): Promise<boolean>;
  /** Publish a batch. False means "not taken" — the game simply re-publishes
   * next time, since the platform keeps the best value it has seen. */
  submit(entries: readonly ScoreEntry[]): Promise<boolean>;
  /** Show the platform's own board — one board by key, or the whole list. */
  show(key?: string): Promise<boolean>;
  /** This platform's id for one of our boards; null drops it (a board with no
   * entry configured in the portal yet). */
  platformId(key: string): string | null;
};

/**
 * The provider for this platform, or null where there is none yet. Android
 * returns null today, so an Android build reports leaderboards unavailable and
 * hides the row — exactly what a build without the native module does on iOS.
 */
export function leaderboardsProvider(): LeaderboardsProvider | null {
  if (Platform.OS === "ios") return gameCenterLeaderboards();
  return null;
}
