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
import { revealAround } from "./fog.ts";
import { nearestHeroWhere } from "./party.ts";
import { holdsKeyFor } from "./story.ts";
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
  for (const pad of state.elevators) {
    // WHOEVER IS STANDING ON THE PLATE RIDES IT. The car is a fixture of the
    // level rather than the host's private lift — a party that could only send
    // seat 0 down would leave everybody else stranded on a floor with no way
    // to follow, since the destination is by design a place no wall connects
    // to. A hero in the air is between floors: the jump arc regularly carries
    // him over a plate he was steering past, and being yanked off it mid-hop
    // reads as a bug rather than as a lift.
    const rider = nearestHeroWhere(
      state,
      pad.pos,
      (hero) => hero.z <= 0 && distance(hero.pos, pad.pos) <= pad.radius,
    );
    if (
      !rider ||
      rider.z > 0 ||
      distance(rider.pos, pad.pos) > pad.radius // the fallback nearest, not a rider
    ) {
      continue;
    }
    // A KEYED CAR does not come when called. The pad is drawn either way — a
    // lift you can see and cannot ride is what sends the player back for
    // whoever is carrying the pass — and the refusal is silent HERE because
    // the app names the pass over the plate instead (game-screen/lift-lock.ts),
    // off the event below. It is booked every tick he stands there so that read
    // can hold for as long as he is asking.
    //
    // `opensWith` is a DOOR id, so the question goes to `holdsKeyFor`, which
    // walks the collection for the item whose `unlocks` names it. Asking
    // `state.storyItems.includes(pad.opensWith)` instead compares a door id
    // against item ids: it type-checks, it is never true, and the car it seals
    // is the only way to the boss of the venue that uses one.
    if (pad.opensWith && !holdsKeyFor(state, pad.opensWith)) {
      state.events.push({
        type: "elevatorLocked",
        id: pad.id,
        key: pad.opensWith,
      });
      continue;
    }
    const from = { ...rider.pos };
    rider.pos = { ...pad.to };
    // Cancel the momentum he arrived with, or he walks out of the car still
    // travelling in the direction that put him in it.
    rider.vel = { x: 0, y: 0 };
    // The lock is the RUN's, not the rider's: it exists so the car cannot
    // immediately grab whoever it just set down, and one shared beat between
    // two players riding in turn costs a party nothing.
    state.elevatorLockMs = ELEVATOR.lockMs;
    const first = !pad.used;
    pad.used = true;
    // Light the room he was just dropped into. The fog sweep is a disc around the
    // hero every tick anyway; this only makes the FIRST frame of the arrival show
    // the place rather than the inside of a cloud.
    revealAround(state, rider.pos, ELEVATOR.arrivalReveal);
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
