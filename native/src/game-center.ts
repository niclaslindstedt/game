// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The shell's ONE handle on Game Center (../modules/game-center). Two features
// want the same signed-in player — CLOUD SAVE, which shows whose save this is
// (./cloud-icloud.ts), and ACHIEVEMENTS, which mirrors the game's badges
// (./achievements-gamecenter.ts) — so the sign-in is memoized here rather than
// once per caller: the sheet must not reappear because a second feature asked.
//
// Everything degrades instead of throwing: with the native module absent (Expo
// Go, or a build without the pod) sign-in answers null, availability is false,
// and both features report themselves off.

import GameCenterModule, {
  type GameCenterEntry,
  type GameCenterPlayer,
} from "../modules/game-center";

export type { GameCenterEntry, GameCenterPlayer };

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
