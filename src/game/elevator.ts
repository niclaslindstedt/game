// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ELEVATOR — the one way to somewhere the map does not connect to.
//
// Every other link in this game is a hole in a wall: a doorway, an archway, a
// locked door with a keycard. All of them share a property that is usually a
// virtue and, at the end of a search, a liability — what is on the far side is
// part of the same floor plan, so the fog-of-war minimap sketches its shape long
// before the hero walks there, and the last room stops being a discovery some
// distance before it is discovered.
//
// An elevator breaks that. The car goes DOWN, off the plan entirely, so the
// destination has no approach, no adjacency and no silhouette: the minimap holds
// nothing at all where it is until the ride has happened. It is the right ending
// for a generated mission, because it means the last thing to find is not the
// boss but the way to him — and the pad could be in any of thirty rooms.
//
// The mechanic itself is four lines, and that is the point. Nothing here is
// pathing, streaming or level-swapping: the destination is a real place in the
// same level, merely one no wall connects to, so every system downstream (the
// camera, the fog, the nav grid, the horde, a save) keeps working untouched.
//
// The horde deliberately does NOT ride. What is at the bottom is what was
// already at the bottom, and nothing follows the hero down — a boss room that
// slowly fills with everything he failed to kill upstairs is a different game.

import { distance } from "@game/lib/vec.ts";
import { ELEVATOR } from "./config/index.ts";
import { revealAround } from "./map.ts";
import type { GameState } from "./types/index.ts";

/**
 * Ride any pad the hero is standing on.
 *
 * Runs after the movement pass, so it judges where he actually ended the tick,
 * and before the objective check, so arriving beside an exit can complete the
 * level on the same frame he lands.
 */
export function stepElevators(state: GameState, dtMs: number): void {
  if (state.elevators.length === 0) return;
  if (state.elevatorLockMs > 0) {
    state.elevatorLockMs = Math.max(0, state.elevatorLockMs - dtMs);
    return;
  }
  // A hero in the air is between floors: the jump arc regularly carries him over
  // a plate he was steering past, and being yanked off it mid-hop reads as a bug
  // rather than as a lift.
  if (state.player.z > 0) return;
  for (const pad of state.elevators) {
    if (distance(state.player.pos, pad.pos) > pad.radius) continue;
    const from = { ...state.player.pos };
    state.player.pos = { ...pad.to };
    // Cancel the momentum he arrived with, or he walks out of the car still
    // travelling in the direction that put him in it.
    state.player.vel = { x: 0, y: 0 };
    state.elevatorLockMs = ELEVATOR.lockMs;
    const first = !pad.used;
    pad.used = true;
    // Light the room he was just dropped into. The fog sweep is a disc around the
    // hero every tick anyway; this only makes the FIRST frame of the arrival show
    // the place rather than the inside of a cloud.
    revealAround(state, state.player.pos, ELEVATOR.arrivalReveal);
    state.events.push({
      type: "elevatorRide",
      id: pad.id,
      from,
      to: { ...pad.to },
      first,
    });
    return;
  }
}
