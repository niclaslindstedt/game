// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// LEADERBOARDS' Apple provider: the game's scores published to Game Center,
// over the local Expo module in ../modules/game-center (which also owns the
// sign-in cloud save and the achievements read — see ./game-center.ts).
//
// The board key IS the Game Center leaderboard id, for the same reason a badge
// id is its achievement id: App Store Connect lets the developer choose the
// identifier, so choosing our own means one name for a board everywhere — the
// catalog, the manifest the portal was filled in from
// (native/store/game-center-leaderboards.json), and the answer to "which board
// is `kill_rate`?". Play Games can't do this, which is what `platformId` on the
// provider is for.

import {
  gameCenterAvailable,
  gameCenterShowLeaderboards,
  gameCenterSignIn,
  gameCenterSubmitScores,
} from "./game-center";
import type { LeaderboardsProvider, ScoreEntry } from "./leaderboards-provider";

export function gameCenterLeaderboards(): LeaderboardsProvider {
  return {
    id: "game-center",

    // Submitting needs an AUTHENTICATED player, and authentication is a sheet —
    // so availability signs in on first ask (memoized for the launch) rather
    // than reporting "off" until some other feature happens to have done it.
    isAvailable: async () => {
      if (gameCenterAvailable()) return true;
      return (await gameCenterSignIn()) !== null;
    },

    submit: (entries: readonly ScoreEntry[]) =>
      gameCenterSubmitScores(
        entries.map((entry) => ({ id: entry.key, value: entry.value })),
      ),

    show: (key) => gameCenterShowLeaderboards(key ?? null),

    platformId: (key) => key,
  };
}
