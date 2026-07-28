// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The TypeScript face of the local GAME CENTER native module
// (ios/GameCenterModule.swift): the signed-in player, achievement reporting,
// leaderboard scores, and the system boards that show both.
//
// Loaded OPTIONALLY, the same way the coin store loads expo-iap: a build
// without the native module (Expo Go, the web target) gets `null` here and the
// shell reports Game Center unavailable instead of crashing.

import { requireOptionalNativeModule } from "expo";

/** The signed-in Game Center player. */
export type GameCenterPlayer = { id: string; name: string };

/** One badge's progress: the platform achievement id, and 0…100 (100 earned). */
export type GameCenterEntry = { id: string; percent: number };

/** One board's score: the platform leaderboard id, and the whole number the
 * board stores (already scaled — see pwa/src/game/platform-leaderboards.ts). */
export type GameCenterScore = { id: string; value: number };

export type GameCenterNativeModule = {
  /** Is a player authenticated right now? */
  isAvailable(): boolean;
  /** Authenticate; null when declined or unavailable. */
  authenticate(): Promise<GameCenterPlayer | null>;
  /** Mirror a batch of badges; false when Game Center refused the batch. */
  report(entries: GameCenterEntry[]): Promise<boolean>;
  /** Present Game Center's own achievements board. */
  show(): Promise<boolean>;
  /** Publish a batch of scores; false when any of them didn't land. */
  submitScores(entries: GameCenterScore[]): Promise<boolean>;
  /** Present Game Center's own leaderboard board — one board, or the list. */
  showLeaderboards(leaderboardID: string | null): Promise<boolean>;
};

/** The native module, or null in a build that doesn't carry it. */
export const GameCenter =
  requireOptionalNativeModule<GameCenterNativeModule>("GameCenter");

export default GameCenter;
