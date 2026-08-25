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
  "scoreboard",
  "tradeAsks",
  "minimap",
  "autopilot",
  "consumableDock",
  "powerupDock",
  "swipeDock",
  "questTracker",
  "pickupFeed",
  "voiceCards",
  "windVane",
]);

/**
 * The widgets that draw a LIST, and the binding group one of their rows
 * publishes — the runtime half of the schema's `HUD_ROW_WIDGETS`.
 *
 * IT IS LOAD-BEARING FOR THE RESOLVER, not documentation. A row widget's parts
 * are a TEMPLATE: they mean nothing until a row is in scope, and resolving them
 * without one calls every judgement on them against an empty `state.speaker` —
 * which throws, and a thrown judgement is disowned for the rest of the run
 * (`script.ts`). So the resolver stops at these nodes and the widget walks them
 * again per row. This is the same shape of bug the drive surface had: a resolve
 * is not free, it CALLS things.
 */
export const HUD_ROW_WIDGET_NAMES = new Set(["voiceCards"]);
