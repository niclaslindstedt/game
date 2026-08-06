// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT A STANDING TRAVEL DOOR SHOWS AND WHAT IT ANSWERS A TAP WITH — the one
// rule behind the hub's rocket, its rift seam and its car.
//
// **A ROAD THE PLAYER HAS NOT EARNED IS NOT NAMED.** The picker used to list a
// locked destination GREYED rather than hidden, on the theory that an empty
// list reads as "broken" where a locked row reads as "come back later". The
// row does read that way — and it also reads out the name of a chapter the
// player has not reached, which is a spoiler charged for nothing. MARS is not
// mentioned until the moon lets go; THE RIFT and BOOT HILL are not mentioned
// until they are walkable. So `openRoads` is what a picker ever shows, and the
// rest of this module is what happens when that list is EMPTY.
//
// A door with nowhere to go does one of two things, and which one is the
// door's own to author:
//
//   SAY SO   — the door carries an `unready` line (a thought id), and the tap
//              plays it instead of opening a picker. The garage's ROCKET: it
//              stands on the back lawn for the whole first chapter because the
//              ship is the story, so it cannot simply vanish — the hero says
//              it is one part short and names neither voyage.
//   NOT BE   — the door carries no line, so its landmark is not drawn and
//              cannot be tapped (`hiddenTravelDoors`). The RIFT SEAM: a hole
//              in the world that leads nowhere is not a promise, it is a
//              question, and the seam already vanished this way before its
//              keepsake came home. A hero who banked THE FOUNDER's RIFT
//              CREATOR on medium and starts a fresh nightmare campaign keeps
//              the keepsake (it is banked on the CHARACTER, not per rung) but
//              has walked neither deep road on that rung — which is exactly
//              the case that used to open a picker made of nothing but locked
//              rows.
//
// THE DECISIONS ARE THE APP'S BECAUSE THE FACTS ARE: which roads are open is
// campaign progress on the CHARACTER (`isLevelUnlocked`) and which keepsakes
// are banked is the roster's (`hasKeepsake`) — no run carries either. The
// engine owns the other half of the spoken case: the line itself, and the
// reach test behind it (`tapTravelDoor` in src/game/story.ts).

import { runLevelDef, type Difficulty, type GameState } from "@game/core";

import { isLevelUnlocked } from "../character-progress.ts";
import { hasKeepsake, type Character } from "../characters.ts";

/** One of a level's standing doors, as this module needs to read it. */
type TravelDoor = NonNullable<
  ReturnType<typeof runLevelDef>["travelDoors"]
>[number];

/**
 * The roads this door can actually take the character down right now — the
 * ONLY destinations a picker may name.
 *
 * Empty for a door whose keepsake has not come home (the whole door is shut,
 * not merely its rows), for one still waiting on the field to be cleared, and
 * for one whose every destination is still locked.
 *
 * THREE GATES, THREE OWNERS, and keeping them apart is the point: `requires` is
 * the CHARACTER's (a keepsake banked across every run), `afterClear` is the
 * RUN's, and the per-destination filter is CAMPAIGN PROGRESS. Only the run's is
 * read off `state`, which is why this takes one at all.
 */
export function openRoads(
  state: GameState,
  character: Character,
  difficulty: Difficulty,
  door: TravelDoor,
): string[] {
  if (door.requires !== undefined && !hasKeepsake(character, door.requires)) {
    return [];
  }
  // The end of the road is not a way out of a fight still going on. `staying`
  // is the only state a cleared field is walked in — the win is banked and the
  // player chose to come back to it (`stayOnField`) — so it is exactly the
  // question this asks.
  if (door.afterClear && !state.staying) return [];
  return door.to.filter((dest) => isLevelUnlocked(character, dest, difficulty));
}

/**
 * The thought this door answers a tap with instead of a picker, or null when
 * the picker is the answer.
 *
 * Null for a door with no `unready` line authored (which is every door but the
 * rocket, and those hide themselves instead — see `hiddenTravelDoors`), for
 * one with at least one road open, and for an id that names no door on this
 * level, so the caller's fallback is always "open the picker".
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
  return openRoads(state, character, difficulty, door).length === 0
    ? door.unready
    : null;
}

/**
 * The travel-door landmark kinds this run must not draw and must not let a tap
 * reach: a door with no open road and nothing to say about it.
 *
 * Read once at run mount (GameScreen → `setHiddenLandmarks`), which is when a
 * hub run is built — coming home from a victory remounts it, so a road opened
 * by that victory brings its door back on the same visit.
 */
export function hiddenTravelDoors(
  state: GameState,
  character: Character,
  difficulty: Difficulty,
): string[] {
  return (runLevelDef(state).travelDoors ?? [])
    .filter(
      (door) =>
        !door.unready &&
        openRoads(state, character, difficulty, door).length === 0,
    )
    .map((door) => door.id);
}
