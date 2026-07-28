// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The shell's ONE handle on Game Center (../modules/game-center). Three
// features want the same signed-in player — CLOUD SAVE, which shows whose save
// this is (./cloud-icloud.ts), ACHIEVEMENTS, which mirrors the game's badges
// (./achievements-gamecenter.ts), and LEADERBOARDS, which publishes its scores
// (./leaderboards-gamecenter.ts) — so the sign-in is memoized here rather than
// once per caller: the sheet must not reappear because a second feature asked.
//
// Everything degrades instead of throwing: with the native module absent (Expo
// Go, or a build without the pod) sign-in answers null, availability is false,
// and both features report themselves off.

import GameCenterModule, {
  type GameCenterEntry,
  type GameCenterPlayer,
  type GameCenterScore,
} from "../modules/game-center";

export type { GameCenterEntry, GameCenterPlayer, GameCenterScore };

/** Game Center's answer, resolved once per launch. */
let identity: Promise<GameCenterPlayer | null> | null = null;

/** Is a player authenticated right now? False before sign-in resolves. */
export function gameCenterAvailable(): boolean {
  try {
    return GameCenterModule?.isAvailable() === true;
  } catch {
    return false;
  }
}

/** Authenticate (once per launch), resolving the player or null. */
export function gameCenterSignIn(): Promise<GameCenterPlayer | null> {
  if (!GameCenterModule) return Promise.resolve(null);
  identity ??= GameCenterModule.authenticate().catch(() => null);
  return identity;
}

/** Mirror a batch of badges; false when Game Center refused (or is absent). */
export async function gameCenterReport(
  entries: GameCenterEntry[],
): Promise<boolean> {
  if (!GameCenterModule) return false;
  try {
    return await GameCenterModule.report(entries);
  } catch {
    return false;
  }
}

/** Present Game Center's own achievements board. */
export async function gameCenterShow(): Promise<boolean> {
  if (!GameCenterModule) return false;
  try {
    return await GameCenterModule.show();
  } catch {
    return false;
  }
}

/** Publish a batch of scores; false when any didn't land (or the module is
 * absent). Game Center keeps the best value per board, so a retry is free. */
export async function gameCenterSubmitScores(
  entries: GameCenterScore[],
): Promise<boolean> {
  if (!GameCenterModule) return false;
  try {
    return await GameCenterModule.submitScores(entries);
  } catch {
    return false;
  }
}

/** Present Game Center's own leaderboard board — one board, or the whole list
 * when given null. */
export async function gameCenterShowLeaderboards(
  leaderboardId: string | null,
): Promise<boolean> {
  if (!GameCenterModule) return false;
  try {
    return await GameCenterModule.showLeaderboards(leaderboardId);
  } catch {
    return false;
  }
}
