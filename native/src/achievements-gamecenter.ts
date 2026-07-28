// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// ACHIEVEMENTS' Apple provider: the game's badges mirrored into Game Center,
// over the local Expo module in ../modules/game-center (which also owns the
// sign-in cloud save reads — see ./game-center.ts).
//
// The badge id IS the Game Center id. App Store Connect lets the developer
// choose an achievement's identifier, so choosing our own means one name for a
// badge everywhere: the ledger, the shelf, the manifest the portal was filled
// in from (native/store/game-center-achievements.json), and the crash-free
// answer to "which badge is `kills_1000`?". Play Games can't do this — hence
// `platformId` on the provider rather than a constant on the web side.

import type {
  AchievementEntry,
  AchievementsProvider,
} from "./achievements-provider";
import {
  gameCenterAvailable,
  gameCenterReport,
  gameCenterShow,
  gameCenterSignIn,
} from "./game-center";

export function gameCenterAchievements(): AchievementsProvider {
  return {
    id: "game-center",

    // Reporting needs an AUTHENTICATED player, and authentication is a sheet —
    // so availability signs in on first ask (memoized for the launch) rather
    // than reporting "off" until some other feature happens to have done it.
    isAvailable: async () => {
      if (gameCenterAvailable()) return true;
      return (await gameCenterSignIn()) !== null;
    },

    identify: () => gameCenterSignIn(),

    report: (entries: readonly AchievementEntry[]) =>
      gameCenterReport(entries.map((e) => ({ id: e.id, percent: e.percent }))),

    show: () => gameCenterShow(),

    platformId: (badgeId) => badgeId,
  };
}
