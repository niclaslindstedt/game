// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Every widget this build draws, as a plain list.
//
// Its own module, and not a `.tsx` one, for two reasons that pull the same way:
// a `switch` is not enumerable, so the registry cannot answer "what do you
// draw" for itself; and the test that pins this list to the schema's
// `HUD_WIDGETS` is a plain `.ts` file, which may not import JSX. A widget an
// element may NAME and nothing renders would be an element that compiles and
// draws nothing, which is exactly what that pinning prevents.

export const HUD_WIDGET_NAMES = new Set([
  "heroPortrait",
  "weaponSlot",
  "companionRail",
  "partyFrames",
  "tradeAsks",
  "minimap",
  "autopilot",
  "consumableDock",
  "powerupDock",
  "swipeDock",
  "questTracker",
  "pickupFeed",
]);
