// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The ONE lazy handle on the ACHIEVEMENTS browser. Two screens raise the same
// shelf — the title menu's ACHIEVEMENTS row and a live run (the ACHIEVEMENTS
// bind, or a tap on the unlock toast) — and both mount it through this handle
// rather than each calling `lazy(() => import(...))` on their own, so there is
// one import site, one chunk, and one place the lazy contract is stated.
//
// Lazy at all for the critical-path budget (`pwa/scripts/check-seo.mjs`): the
// shelf is a destination, never startup code, and it drags the whole badge
// catalog in behind it.

import { lazy } from "react";

export const AchievementsScreen = lazy(() =>
  import("./AchievementsScreen.tsx").then((m) => ({
    default: m.AchievementsScreen,
  })),
);
