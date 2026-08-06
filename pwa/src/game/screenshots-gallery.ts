// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The ONE lazy handle on the SCREENSHOT gallery. Two screens raise the same
// viewer — the title menu's EXTRAS → SCREENSHOTS row and a live run (a press on
// the flash the screenshot key raises) — and both mount it through this handle
// rather than each calling `lazy(() => import(...))` on their own, so there is
// one import site, one chunk, and one place the lazy contract is stated.
//
// Lazy at all for the critical-path budget (`pwa/scripts/check-seo.mjs`): the
// viewer is a destination, never startup code, and it drags the DOM rasterizer
// and the share plumbing in behind it.

import { lazy } from "react";

export const ScreenshotsScreen = lazy(() =>
  import("./ScreenshotsScreen.tsx").then((m) => ({
    default: m.ScreenshotsScreen,
  })),
);
