// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE MINIMAP'S FOG HIDES. The hovering minimap shows a blip only where
// the hero has been — the expanded map is where the rest of the level's
// history lives — and there is exactly one exception.
//
// A `questGoal` is drawn through the fog because a GIVER DESCRIBED IT. Every
// errand has one (`QuestDef.giver` is required), so a goal is never a place
// the game silently knew about: it is directions the hero was given across a
// bar, and a hero with directions can mark his own map before he walks there.
//
// This lives in a leaf of its own so it can be tested, because the wrong
// version looks like the tidy one: fog-gating every blip alike reads as
// consistent, and it quietly restores the bug the goal pin exists for. The
// fog lifts where the hero WALKS, so gating on it means the X appears at the
// moment he no longer needs it.

import { isExplored, type GameState, type MapMarker } from "@game/core";

/** May the minimap draw this pin right now? */
export function blipVisible(state: GameState, marker: MapMarker): boolean {
  if (marker.kind === "questGoal") return true;
  return isExplored(state, marker.pos);
}
