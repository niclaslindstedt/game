// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Type declarations for game-center-push.mjs's tested exports.

export type GameCenterPushOptions = {
  apply: boolean;
  skipImages: boolean;
  help?: boolean;
  only?: "achievements" | "leaderboards";
  app?: string;
  locale?: string;
  art?: string;
};

export function parseArgs(argv: string[]): GameCenterPushOptions;
