// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT A STANDING TRAVEL DOOR ANSWERS A TAP WITH — the one rule behind the
// hub's rocket, its rift seam and its car.
//
// A door normally opens the destination picker (TravelPanel), which shows a
// locked road GREYED rather than hidden: an empty list reads as "broken" where
// a locked row reads as "come back later". That is right for a door with an
// open road beside the shut ones — and wrong for a door with NONE, because
// every row is then a place the player has not reached yet, named to answer a
// question nobody asked. The garage's ROCKET is that door for the whole first
// chapter: the ship is one part short until GOODCO HQ falls, and a picker
// listing THE MOON and MARS spoils two voyages to say so.
//
// So a door may author what the hero says instead (`travelDoors[].unready`,
// a thought id), and this is where the app decides he says it. THE DECISION IS
// THE APP'S BECAUSE THE FACT IS: which roads are open is campaign progress on
// the CHARACTER (`isLevelUnlocked`), which no run carries. The engine owns the
// other half — the line itself, and the reach test behind it (`tapTravelDoor`
// in src/game/story.ts).

import { runLevelDef, type Difficulty, type GameState } from "@game/core";

import { isLevelUnlocked } from "../character-progress.ts";
import type { Character } from "../characters.ts";

/**
 * The thought this door answers a tap with instead of a picker, or null when
 * the picker is the answer.
 *
 * Null for a door with no `unready` line authored (every door but the rocket
 * today), for one with at least one road open, and for an id that names no
 * door on this level — so the caller's fallback is always "open the picker",
 * exactly as it was before any of this existed.
 */
export function groundedDoorThought(
  state: GameState,
  character: Character,
  difficulty: Difficulty,
  doorId: string,
): string | null {
  const door = (runLevelDef(state).travelDoors ?? []).find(
    (d) => d.id === doorId,
  );
  if (!door?.unready) return null;
  const anyRoadOpen = door.to.some((dest) =>
    isLevelUnlocked(character, dest, difficulty),
  );
  return anyRoadOpen ? null : door.unready;
}
