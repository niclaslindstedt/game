// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHICH PINS THE LEVEL MAP MAY DRAW — a rule about what a pin IS, not about
// where it sits.
//
// A pin that COMMEMORATES — a story find, an elite that fell, a merchant's
// stall, the giver whose errand you took — is drawn through standing fog,
// because the hero WAS there when it happened and a map does not forget ground
// it has already walked.
//
// A pin that INSTRUCTS is the opposite. `questGoal` names ground the hero may
// never have set foot on, so drawing it over undrawn dark would be the map
// annotating a page it has not filled in yet — an icon floating in a black
// rectangle, pointing at nothing the player can see. It waits for the fog to
// lift off its own cell, and until then the errand is a direction rather than
// a coordinate.
//
// The MINIMAP does not need this: it fog-gates every blip already, so the same
// rule falls out of the rule it was keeping anyway.

import { isExplored, type GameState, type MapMarker } from "@game/core";

/**
 * The pins the map may draw right now — used for the icons AND for the legend,
 * so a row never advertises a marker that is not on the map.
 */
export function visiblePins(state: GameState): MapMarker[] {
  return state.mapMarkers.filter(
    (marker) => marker.kind !== "questGoal" || isExplored(state, marker.pos),
  );
}
